import type {
  ActiveRules,
  BriefBlock,
  BriefH2,
  BriefKeyword,
  BriefRecommendations,
  ParsedPage,
  SeoBrief,
} from "@brief/shared";
import { normalizeRange, sumRanges } from "@brief/shared";
import { AppError } from "../../http/errors";
import type { AiProvider } from "../ai";
import { detectContentLanguage } from "./language";
import { buildPagesPayload, medianWordCount } from "./payload";
import { briefSystemPrompt, briefUserPrompt } from "./prompts";
import { seoBriefSchema, toResponseSchema } from "./schema";

export interface GenerateBriefInput {
  topic: string;
  pages: readonly ParsedPage[];
  /**
   * Чинні правила для мови контенту.
   *
   * Передається способом дістати, а не готовим списком: мова визначається
   * тут, зі самих сторінок, тому на момент виклику ще не відомо, правила
   * якої мови потрібні. Так цей файл лишається без жодного знання про базу —
   * рівно як і з провайдером.
   */
  loadRules: (languageCode: string) => Promise<ActiveRules>;
}

/**
 * Формує єдине SEO ТЗ з усіх сторінок одночасно (розділ 8 ТЗ).
 *
 * Бізнес-логіка не знає, який провайдер працює, — вона отримує AiProvider
 * готовим. Тому підміна Gemini на OpenAI цей файл не зачіпає.
 */
export async function generateBrief(
  input: GenerateBriefInput,
  provider: AiProvider,
): Promise<SeoBrief> {
  const pages = input.pages.filter((page) => page.wordCount > 0);

  if (pages.length === 0) {
    throw new AppError(
      "no_content",
      "Немає жодної успішно проаналізованої сторінки з контентом.",
      422,
    );
  }

  // Мова ТЗ не налаштовується — вона завжди читається зі самих конкурентів.
  const language = detectContentLanguage(pages);
  const rules = await input.loadRules(language.code);
  const payload = buildPagesPayload(pages);

  const response = await provider.generateJson({
    system: briefSystemPrompt({ language: language.name, rules }),
    messages: [
      {
        role: "user",
        content: briefUserPrompt({
          topic: input.topic,
          pagesJson: payload.json,
          pageCount: payload.pageCount,
          medianWords: medianWordCount(pages),
          detectedLanguage: language.name,
        }),
      },
    ],
    responseSchema: toResponseSchema(),
    temperature: 0.4,
  });

  console.info(
    `[brief] ${provider.name}/${response.model} · мова ${language.name} · ` +
      `правил ${rules.global.length}+${rules.language.length} · ` +
      `сторінок ${payload.pageCount} · промпт ${payload.chars} симв. · ` +
      `токени ${response.usage.inputTokens ?? "?"}→${response.usage.outputTokens ?? "?"}`,
  );

  const parsed = seoBriefSchema.safeParse(response.data);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(
      "ai_schema_mismatch",
      `Модель повернула структуру, що не відповідає схемі: ` +
        `${issue?.path.join(".") || "корінь"} — ${issue?.message ?? "невідома причина"}`,
      502,
    );
  }

  return {
    ...normalizeBrief(parsed.data),
    // Назву мови ставимо свою, а не ту, що повернула модель: за нею потім
    // шукаються правила для правок у чаті, і «Brazilian Portuguese» замість
    // «Portuguese» тихо лишило б наступну правку без правил.
    contentLanguage: language.name,
  };
}

/**
 * Арифметика й звірка зі структурою, а не творчість: межі діапазонів мають
 * бути впорядковані, ціле не може бути меншим за суму частин, зведена таблиця
 * ключів не може пропускати ключі, які вже названі в розділах, а рекомендація
 * не може суперечити структурі, яку сама ж описує. Модель тут інколи
 * помиляється, і виправити самим дешевше, ніж витрачати ще один запит.
 */
export function normalizeBrief(brief: SeoBrief): SeoBrief {
  const structure = brief.structure.map((h2) => ({
    ...h2,
    wordCount: normalizeRange(h2.wordCount),
    children: h2.children.map((h3) => ({
      ...h3,
      wordCount: normalizeRange(h3.wordCount),
      blocks: h3.blocks.map(normalizeBlock),
      children: h3.children.map((h4) => ({
        ...h4,
        wordCount: normalizeRange(h4.wordCount),
      })),
    })),
    blocks: h2.blocks.map(normalizeBlock),
  }));

  const intro = {
    ...brief.intro,
    wordCount: normalizeRange(brief.intro.wordCount),
    paragraphs: normalizeRange(brief.intro.paragraphs),
  };

  // Вступ — частина статті, тому входить у загальний обсяг разом з розділами.
  const parts = sumRanges([
    intro.wordCount,
    ...structure.map((h2) => h2.wordCount),
  ]);
  const total = normalizeRange(brief.totalWordCount);

  return {
    ...brief,
    intro,
    structure,
    totalWordCount: {
      min: Math.max(total.min, parts.min),
      max: Math.max(total.max, parts.max, total.min, parts.min),
    },
    keywords: withSectionKeywords(brief, intro.keywords, structure),
    recommendations: normalizeRecommendations(brief.recommendations, structure),
  };
}

/** Ключ для порівняння заголовків: регістр і пунктуація тут не зміст. */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Усі заголовки структури за таким ключем — H2, H3 і H4. */
function headingIndex(structure: readonly BriefH2[]): Map<string, string> {
  const index = new Map<string, string>();

  const add = (title: string): void => {
    const key = titleKey(title);
    if (key && !index.has(key)) index.set(key, title.trim());
  };

  for (const h2 of structure) {
    add(h2.title);
    for (const h3 of h2.children) {
      add(h3.title);
      for (const h4 of h3.children) add(h4.title);
    }
  }

  return index;
}

/**
 * Рекомендації описують структуру, тому й звіряються з нею.
 *
 * Три списки відповідають на три різні питання — що є в нас і немає в
 * конкурентів, що є в конкурентів і немає в нас, що можна додати понад план, —
 * і кожна тема належить рівно одному з них. Твердження, яке цю межу порушує,
 * гірше за відсутнє: райтер бачить розділ і в структурі, і в списку
 * «пропущено», і не знає, кому вірити.
 */
function normalizeRecommendations(
  recommendations: BriefRecommendations,
  structure: readonly BriefH2[],
): BriefRecommendations {
  const headings = headingIndex(structure);
  const inStructure = (title: string): boolean => headings.has(titleKey(title));
  // Формулювання беремо зі структури: так «наш унікальний розділ» знаходиться
  // в дереві очима, а не за змістом.
  const align = (title: string): string =>
    headings.get(titleKey(title)) ?? title.trim();

  return {
    uniqueSections: recommendations.uniqueSections.map((section) => ({
      ...section,
      title: align(section.title),
    })),
    // Тема, яка насправді є в структурі, не пропущена — і в цьому списку вона
    // лише збиває редактора з думки, що її забули.
    skippedSections: recommendations.skippedSections
      .filter((section) => !inStructure(section.title))
      .map((section) => ({
        ...section,
        competitors: Math.max(0, section.competitors),
      })),
    optionalAdditions: recommendations.optionalAdditions
      // «Можна додати» про вже обовʼязковий розділ знецінює обидва списки.
      // Блоки не фільтруємо: там title — це підпис, і збіг із заголовком
      // розділу для нього нормальний.
      .filter(
        (addition) =>
          addition.placement === "block" || !inStructure(addition.title),
      )
      .map((addition) => ({
        ...addition,
        section: addition.section.trim() ? align(addition.section) : "",
        wordCount: normalizeRange(addition.wordCount),
      })),
    structureNotes: recommendations.structureNotes,
  };
}

function normalizeBlock(block: BriefBlock): BriefBlock {
  return {
    ...block,
    ...(block.prosCount ? { prosCount: normalizeRange(block.prosCount) } : {}),
    ...(block.consCount ? { consCount: normalizeRange(block.consCount) } : {}),
    ...(block.itemWordCount
      ? { itemWordCount: normalizeRange(block.itemWordCount) }
      : {}),
  };
}

/**
 * Зведена таблиця має покривати всі ключі, названі у вступі та розділах:
 * ключ, який райтер бачить у розділі, але не бачить у таблиці, виглядає
 * як помилка ТЗ — і не потрапляє в жодний підрахунок вживань.
 *
 * Пропущені ключі дописуються тут, а не другим запитом до моделі: скільки
 * разів ужити ключ, названий у N розділах, — арифметика, не творчість.
 */
function withSectionKeywords(
  brief: SeoBrief,
  introKeywords: readonly string[],
  structure: readonly BriefH2[],
): BriefKeyword[] {
  const mentions = new Map<string, { keyword: string; sections: number }>();

  const count = (keywords: readonly string[]): void => {
    // Дублі всередині одного розділу — це одна згадка, а не дві.
    for (const raw of new Set(keywords.map((keyword) => keyword.trim()))) {
      if (!raw) continue;

      const key = raw.toLowerCase();
      const seen = mentions.get(key);

      if (seen) seen.sections += 1;
      else mentions.set(key, { keyword: raw, sections: 1 });
    }
  };

  count(introKeywords);
  for (const h2 of structure) {
    count(h2.keywords);
    for (const h3 of h2.children) count(h3.keywords);
  }

  const table = brief.keywords.map((keyword) => ({
    ...keyword,
    keyword: keyword.keyword.trim(),
    usage: normalizeRange(keyword.usage),
  }));

  const known = new Set(table.map((row) => row.keyword.toLowerCase()));

  for (const [key, mention] of mentions) {
    if (known.has(key)) continue;

    // Мінімум — по разу на кожен розділ, де ключ названий; максимум — з запасом
    // на заголовок і згадку в тексті того ж розділу.
    table.push({
      keyword: mention.keyword,
      usage: { min: mention.sections, max: mention.sections + 1 },
    });
  }

  return table;
}
