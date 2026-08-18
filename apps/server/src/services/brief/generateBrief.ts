import type {
  ActiveRules,
  BriefBlock,
  BriefH2,
  BriefKeyword,
  BriefRecommendations,
  ParsedPage,
  SeoBrief,
} from "@brief/shared";
import {
  detectContentLanguage,
  normalizeRange,
  resolveContentLanguage,
  sumRanges,
} from "@brief/shared";
import { AppError } from "../../http/errors";
import { requestJson, type AiProvider } from "../ai";
import type { PromptSet } from "../prompts/repository";
import { buildPagesPayload, medianWordCount } from "./payload";
import { briefSystemPrompt, briefUserPrompt } from "./prompts";
import { seoBriefSchema, toResponseSchema } from "./schema";

export interface GenerateBriefInput {
  topic: string;
  pages: readonly ParsedPage[];
  /**
   * Мова, задана вручну, кодом ISO 639-1.
   *
   * Автовизначення по <html lang> надійне, але сторінка без цього атрибута
   * розпізнається за характерними літерами — а вони в мов перетинаються.
   * Помилка тут коштує всього ТЗ, тому в користувача є остаточне слово.
   */
  languageCode?: string;
  /**
   * Чинні правила для мови контенту.
   *
   * Передається способом дістати, а не готовим списком: мова визначається
   * тут, зі самих сторінок, тому на момент виклику ще не відомо, правила
   * якої мови потрібні. Так цей файл лишається без жодного знання про базу —
   * рівно як і з провайдером.
   */
  loadRules: (languageCode: string) => Promise<ActiveRules>;
  /**
   * Чинні тексти промптів.
   *
   * Готовими, а не функцією як правила: промпти не залежать ні від мови, ні
   * від чогось іншого, що стає відомим тільки тут. Цей файл, як і раніше,
   * не знає про базу — набір приходить уже прочитаним.
   */
  prompts: PromptSet;
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

  // Мова читається зі самих конкурентів; вибір користувача її перебиває.
  const detected = detectContentLanguage(pages);
  const language = resolveContentLanguage(detected, input.languageCode);
  const rules = await input.loadRules(language.code);
  const payload = buildPagesPayload(pages);

  const response = await requestJson(
    provider,
    {
      system: briefSystemPrompt({
        language: language.name,
        rules,
        prompts: input.prompts,
      }),
      messages: [
        {
          role: "user",
          content: briefUserPrompt({
            topic: input.topic,
            pagesJson: payload.json,
            pageCount: payload.pageCount,
            medianWords: medianWordCount(pages),
            detectedLanguage: language.name,
            prompts: input.prompts,
          }),
        },
      ],
      responseSchema: toResponseSchema(),
      temperature: 0.4,
    },
    seoBriefSchema,
  );

  console.info(
    `[brief] ${provider.name}/${response.model} · мова ${language.name}` +
      `${language.overridden ? ` (вручну, визначено ${detected.name})` : ""} · ` +
      `правил ${rules.global.length}+${rules.language.length} · ` +
      `сторінок ${payload.pageCount} · промпт ${payload.chars} симв. · ` +
      `токени ${response.usage.inputTokens ?? "?"}→${response.usage.outputTokens ?? "?"}` +
      `${response.attempts > 1 ? ` · спроб ${response.attempts}` : ""}`,
  );

  return {
    ...normalizeBrief(response.data),
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
 * «Можна додати» про розділ, який уже обовʼязковий, знецінює і список,
 * і структуру: райтер бачить те саме двічі й не знає, обовʼязкове воно чи ні.
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

/**
 * Адреса лишається в ТЗ, тільки якщо це справжнє зовнішнє посилання.
 *
 * Порожньо — внутрішнє перелінкування, і саме таких у ТЗ більшість: цільову
 * сторінку свого сайту добирає SEO-фахівець. Але модель, якій сказано лишити
 * поле порожнім, іноді все одно щось туди пише — `#`, назву сайту без схеми,
 * шлях `/casino-non-aams`. Усе це не адреса, і показувати таке райтером гірше,
 * ніж не показувати нічого: він або поставить биту адресу, або піде питати.
 *
 * Тому лишається тільки абсолютний http(s) URL, а решта зводиться до
 * внутрішнього посилання — тобто до того, чим вона й була.
 */
function normalizeLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function normalizeBlock(block: BriefBlock): BriefBlock {
  return {
    ...block,
    // Рядок без анкора не посилання: URL сам по собі райтеру нікуди не стає.
    ...(block.links
      ? {
          links: block.links
            .filter((link) => link.anchor.trim())
            .map((link) => ({
              anchor: link.anchor.trim(),
              url: normalizeLinkUrl(link.url),
            })),
        }
      : {}),
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

  const table = brief.keywords.map((keyword) => {
    const trimmed = keyword.keyword.trim();
    const usage = normalizeRange(keyword.usage);
    const mention = mentions.get(trimmed.toLowerCase());

    return {
      ...keyword,
      keyword: trimmed,
      // Нуль у таблиці означає «не вживати». Для ключа, названого в розділі,
      // це пряма суперечність: розділ вимагає вжити його саме там. Норму
      // виводимо з кількості розділів — так само, як для дописаних нижче.
      usage:
        mention && usage.max === 0
          ? { min: mention.sections, max: mention.sections + 1 }
          : usage,
    };
  });

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
