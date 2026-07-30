import type {
  ActiveRules,
  ComparisonMetaIssue,
  ComparisonSection,
  MetaField,
  PageComparison,
  ParsedPage,
} from "@brief/shared";
import {
  detectContentLanguage,
  normalizeRange,
  resolveContentLanguage,
} from "@brief/shared";
import { AppError } from "../../http/errors";
import type { AiProvider } from "../ai";
import { buildPagePayload, buildPagesPayload } from "../brief/payload";
import type { PromptSet } from "../prompts/repository";
import { buildKeywords, buildMetrics, buildScore } from "./metrics";
import { comparisonSystemPrompt, comparisonUserPrompt } from "./prompts";
import {
  comparisonReportSchema,
  pageComparisonSchema,
  toComparisonResponseSchema,
  type ComparisonReport,
} from "./schema";

/**
 * Скільки записів лишаємо в кожному переліку. Межі не косметичні: звіт
 * зберігається в сесії й читається цілком, а перелік із двохсот рядків
 * перестає бути планом і стає ще одним текстом, який ніхто не вичитує.
 */
const LIMITS = {
  sections: 40,
  // Ключів навмисно на порядок більше за решту: це не перелік для вичитування,
  // а таблиця покриття, і кожен рядок у ній рахує код, а не читає людина.
  // У реальних ТЗ таких рядків 150-330 на статтю в 7-8 тисяч слів, тому 80
  // відрізало саме довгий хвіст — те, чого на сторінці якраз і немає.
  keywords: 400,
  strengths: 12,
  actions: 8,
} as const;

/** Поля метаданих у тому порядку, в якому їх читає людина. */
const META_FIELDS: readonly MetaField[] = ["title", "description", "h1"];

export interface ComparePageInput {
  topic: string;
  /** Власна сторінка користувача. */
  own: ParsedPage;
  /** Сторінки конкурентів — потрібна хоча б одна з контентом. */
  competitors: readonly ParsedPage[];
  /** Мова, задана вручну, кодом ISO 639-1 — те саме, що в генерації ТЗ. */
  languageCode?: string;
  /**
   * Чинні правила для мови контенту — так само функцією, як у генерації ТЗ:
   * мова визначається тут, зі самих сторінок, тому на момент виклику ще
   * не відомо, правила якої мови потрібні.
   */
  loadRules: (languageCode: string) => Promise<ActiveRules>;
  /** Чинні тексти промптів — так само готовими, як у генерації ТЗ. */
  prompts: PromptSet;
}

/**
 * Порівнює власну сторінку з конкурентами (розділ 15 ТЗ).
 *
 * Як і `generateBrief()`, цей файл не знає ні про провайдера, ні про базу:
 * перше приходить готовим `AiProvider`, друге — функцією `loadRules`.
 */
export async function comparePage(
  input: ComparePageInput,
  provider: AiProvider,
): Promise<PageComparison> {
  const competitors = input.competitors.filter((page) => page.wordCount > 0);

  if (competitors.length === 0) {
    throw new AppError(
      "no_content",
      "Немає жодної успішно проаналізованої сторінки конкурента з контентом.",
      422,
    );
  }

  if (input.own.wordCount === 0) {
    throw new AppError(
      "no_own_content",
      "З власної сторінки не вдалося дістати текст. Перевірте, що вказано " +
        "адресу самої статті, а не сторінки-лістингу.",
      422,
    );
  }

  // Мова визначається по всіх сторінках разом: власна й конкурентні — це один
  // ринок, а зайвий голос корисний, коли <html lang> є не в усіх. Вибір
  // користувача з вкладки «Аналіз» перебиває визначену й тут: мова в сесії
  // одна, і звіт, складений іншою мовою, ніж ТЗ, читався б як чужий.
  const language = resolveContentLanguage(
    detectContentLanguage([...competitors, input.own]),
    input.languageCode,
  );
  const rules = await input.loadRules(language.code);

  const own = buildPagePayload(input.own);
  const rivals = buildPagesPayload(competitors);
  const metrics = buildMetrics(input.own, competitors);

  const response = await provider.generateJson({
    system: comparisonSystemPrompt({
      language: language.name,
      rules,
      prompts: input.prompts,
    }),
    messages: [
      {
        role: "user",
        content: comparisonUserPrompt({
          topic: input.topic,
          ownJson: own.json,
          competitorsJson: rivals.json,
          competitorCount: competitors.length,
          ownWords: metrics.wordCount.own,
          medianWords: metrics.wordCount.median,
          detectedLanguage: language.name,
          prompts: input.prompts,
        }),
      },
    ],
    responseSchema: toComparisonResponseSchema(),
    // Між генерацією (0.4) і правкою (0.2): вирок наявній сторінці має бути
    // точним, але прогалини — це все ще пошук, а не переписування абзацу.
    temperature: 0.3,
  });

  console.info(
    `[compare] ${provider.name}/${response.model} · мова ${language.name} · ` +
      `правил ${rules.global.length}+${rules.language.length} · ` +
      `конкурентів ${competitors.length} · ` +
      `промпт ${own.chars + rivals.chars} симв. · ` +
      `токени ${response.usage.inputTokens ?? "?"}→${response.usage.outputTokens ?? "?"}`,
  );

  const parsed = comparisonReportSchema.safeParse(response.data);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(
      "ai_schema_mismatch",
      `Модель повернула структуру, що не відповідає схемі: ` +
        `${issue?.path.join(".") || "корінь"} — ${issue?.message ?? "невідома причина"}`,
      502,
    );
  }

  const comparison = assemble({
    report: parsed.data,
    own: input.own,
    competitors,
    metrics,
    contentLanguage: language.name,
  });

  // Той самий рубіж, що й для ТЗ: звіт іде в базу і повертається клієнту,
  // тому склеєний обʼєкт звіряється з тією ж схемою, якою потім читається.
  const valid = pageComparisonSchema.safeParse(comparison);

  if (!valid.success) {
    const issue = valid.error.issues[0];
    throw new AppError(
      "comparison_invalid",
      `Не вдалося скласти звіт: ` +
        `${issue?.path.join(".") || "корінь"} — ${issue?.message ?? "невідома причина"}`,
      500,
    );
  }

  return valid.data;
}

interface AssembleInput {
  report: ComparisonReport;
  own: ParsedPage;
  competitors: readonly ParsedPage[];
  metrics: PageComparison["metrics"];
  contentLanguage: string;
}

/**
 * Склеює відповідь моделі з порахованою частиною.
 *
 * Тут же виправляється те, що арифметика, а не творчість: межі діапазонів
 * упорядковуються, кількість конкурентів не може перевищувати їхнє реальне
 * число, а бал рахується вже з готових розділів і ключів.
 */
function assemble(input: AssembleInput): PageComparison {
  const { report, own, competitors, metrics } = input;

  const sections = report.sections
    .map<ComparisonSection>((section) => ({
      title: section.title.trim(),
      status: section.status,
      // Модель інколи називає більше конкурентів, ніж їх узагалі було.
      competitors: Math.min(
        Math.max(0, Math.round(section.competitors)),
        competitors.length,
      ),
      instruction: section.instruction.trim(),
      // Обсяг для розкритого розділу дописувати нічого не значить.
      ...(section.addedWords && section.status !== "covered"
        ? { addedWords: normalizeRange(section.addedWords) }
        : {}),
    }))
    .filter((section) => section.title.length > 0)
    .slice(0, LIMITS.sections);

  const keywords = buildKeywords(report.keywords, own, competitors).slice(
    0,
    LIMITS.keywords,
  );

  return {
    url: own.meta.finalUrl,
    comparedAt: new Date().toISOString(),
    competitorCount: competitors.length,
    contentLanguage: input.contentLanguage,
    score: buildScore({ sections, keywords, metrics }),
    metrics,
    verdict: report.verdict.trim(),
    sections,
    keywords,
    meta: buildMeta(report, own),
    strengths: report.strengths
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, LIMITS.strengths),
    actions: report.actions
      .map((item) => ({ action: item.action.trim(), severity: item.severity }))
      .filter((item) => item.action.length > 0)
      .slice(0, LIMITS.actions),
  };
}

/**
 * Title, Meta Description і H1: що зараз — з самої сторінки, що замінити —
 * від моделі.
 *
 * Нинішнє значення підставляє сервер, а не модель: воно лежить у даних, і
 * єдине, що могло б із ним статися по дорозі через модель, — тихо змінитися.
 * Порожня пропозиція означає «лишити як є», тому перетворюється на null.
 */
function buildMeta(
  report: ComparisonReport,
  own: ParsedPage,
): ComparisonMetaIssue[] {
  const current: Record<MetaField, string | null> = {
    title: own.meta.title,
    description: own.meta.description,
    h1: own.headings.find((heading) => heading.level === 1)?.text ?? null,
  };

  const issues: ComparisonMetaIssue[] = [];

  for (const field of META_FIELDS) {
    // Перший запис на поле, а не останній: дубль від моделі — це та сама
    // порада, переказана вдруге, і друга спроба не краща за першу.
    const suggestion = report.meta.find((item) => item.field === field);
    if (!suggestion) continue;

    const suggested = suggestion.suggested.trim();

    issues.push({
      field,
      current: current[field],
      // Пропозиція, що дослівно повторює наявне значення, — теж «лишити як є».
      suggested:
        suggested && suggested !== (current[field] ?? "").trim()
          ? suggested
          : null,
      instruction: suggestion.instruction.trim(),
    });
  }

  return issues;
}
