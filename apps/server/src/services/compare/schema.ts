import { z } from "zod";
import type { PageComparison } from "@brief/shared";
import { rangeSchema } from "../../schemas/range";

/**
 * Дві схеми на одну модель даних, і це не дублювання.
 *
 * `comparisonReportSchema` — рівно те, що просимо в моделі: зміст без чисел.
 * Показники, входження ключів, поточні title/description/H1 і бал у ній
 * відсутні навмисно — усе це сервер знає сам, а поле, яке модель може
 * заповнити «приблизно», вона заповнить приблизно.
 *
 * `pageComparisonSchema` — готовий звіт, який лежить у базі: відповідь моделі
 * плюс порахована частина. Він же валідує звіт, що приходить назад від
 * клієнта, і звіряється з типом `PageComparison` під час компіляції.
 */

const severitySchema = z
  .enum(["critical", "important", "minor"])
  .describe(
    "critical = the page cannot compete without this; " +
      "important = a real gap against the competitors; " +
      "minor = worth doing once the rest is done",
  );

const sectionStatusSchema = z
  .enum(["missing", "weak", "covered"])
  .describe(
    "missing = competitors cover the topic, this page does not; " +
      "weak = present but shallower than the competitors; " +
      "covered = on par with them or better",
  );

const metaFieldSchema = z.enum(["title", "description", "h1"]);

/* ── Те, що просимо в моделі ─────────────────────────────────────────────── */

export const comparisonReportSchema = z.object({
  verdict: z
    .string()
    .describe(
      "IN ENGLISH. 2-4 sentences: where this page stands against the " +
        "competitors and what decides whether it can outrank them. No praise, " +
        "no hedging — name the single biggest problem first.",
    ),
  sections: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "IN THE CONTENT LANGUAGE. The topic as it should be titled on the " +
              "page. For status=weak and status=covered reuse the wording " +
              "already on the page, so the writer can find the section.",
          ),
        status: sectionStatusSchema,
        competitors: z
          .number()
          .int()
          .describe("How many of the analysed competitor pages cover this topic"),
        instruction: z
          .string()
          .describe(
            "IN ENGLISH. What to do with this section. For status=covered say " +
              "in one sentence what keeps it strong, so it survives the rewrite.",
          ),
        addedWords: rangeSchema
          .optional()
          .describe(
            "How many words to add here. Fill for missing and weak, omit for covered.",
          ),
      }),
    )
    .describe(
      "The topics the competitors cover, every one of them judged against this " +
        "page — the missing ones together with the ones already covered. Order " +
        "them the way they should read on the page, not by status.",
    ),
  keywords: z
    .array(z.string())
    .describe(
      "IN THE CONTENT LANGUAGE. The keywords the competitors are built around, " +
        "most valuable first. List them all: whether this page already uses " +
        "them is checked separately, so do not filter and do not guess counts. " +
        "One entry per 20-40 words of the competitor median, and never fewer " +
        "than 60 — head terms, the shorter fragments they are built from and " +
        "the word forms of the language as separate entries. " +
        "Derive them from the actual competitor text — never invent a query.",
    ),
  meta: z
    .array(
      z.object({
        field: metaFieldSchema,
        suggested: z
          .string()
          .describe(
            "IN THE CONTENT LANGUAGE. The replacement. Empty string means the " +
              "current value is good enough and must be left alone.",
          ),
        instruction: z
          .string()
          .describe(
            "IN ENGLISH. Why this replacement, or why the current value stays. " +
              "Title up to 60 characters, meta description 140-160.",
          ),
      }),
    )
    .describe(
      "Exactly one entry per field: title, description, h1. Three entries, " +
        "never more, never fewer.",
    ),
  strengths: z
    .array(z.string())
    .describe(
      "IN ENGLISH. What this page already does better than the competitors and " +
        "must not lose in the rewrite. Empty array if there is genuinely nothing.",
    ),
  actions: z
    .array(
      z.object({
        action: z
          .string()
          .describe(
            "IN ENGLISH, imperative, one step, e.g. " +
              '"Add a comparison table of the five providers with price and payout columns"',
          ),
        severity: severitySchema,
      }),
    )
    .describe(
      "The plan, most valuable step first, at most 8 steps. It is the summary " +
        "of everything above — do not add findings here that appear nowhere else.",
    ),
});

export type ComparisonReport = z.infer<typeof comparisonReportSchema>;

/** JSON Schema для провайдера. `$schema` прибираємо — як і у схемі ТЗ. */
export function toComparisonResponseSchema(): unknown {
  const jsonSchema = z.toJSONSchema(comparisonReportSchema, {
    reused: "inline",
  }) as Record<string, unknown>;

  delete jsonSchema["$schema"];
  return jsonSchema;
}

/* ── Готовий звіт ────────────────────────────────────────────────────────── */

const metricSchema = z.object({
  own: z.number(),
  median: z.number(),
  best: z.number(),
});

export const pageComparisonSchema = z.object({
  url: z.string(),
  comparedAt: z.string(),
  competitorCount: z.number().int(),
  contentLanguage: z.string(),
  score: z.object({
    total: z.number(),
    structure: z.number(),
    volume: z.number(),
    keywords: z.number(),
  }),
  metrics: z.object({
    wordCount: metricSchema,
    h2: metricSchema,
    h3: metricSchema,
    paragraphs: metricSchema,
    lists: metricSchema,
    tables: metricSchema,
    faq: metricSchema,
  }),
  verdict: z.string(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        status: sectionStatusSchema,
        competitors: z.number().int(),
        instruction: z.string(),
        addedWords: rangeSchema.optional(),
      }),
    )
    .max(60),
  keywords: z
    .array(
      z.object({
        keyword: z.string(),
        competitors: z.number().int(),
        occurrences: z.number().int(),
      }),
    )
    // Межа — від здорового глузду, а не від формату: у реальних ТЗ зведена
    // таблиця ключів на статтю в 7-8 тисяч слів має 150-330 рядків, і 120
    // відрізало дві третини аналізу.
    .max(500),
  meta: z
    .array(
      z.object({
        field: metaFieldSchema,
        current: z.string().nullable(),
        suggested: z.string().nullable(),
        instruction: z.string(),
      }),
    )
    .max(3),
  strengths: z.array(z.string()).max(20),
  actions: z
    .array(z.object({ action: z.string(), severity: severitySchema }))
    .max(20),
});

/**
 * Компіляційна гарантія збігу з типом із @brief/shared: додане в
 * `PageComparison` і забуте тут впаде на `pnpm typecheck`, а не в рантаймі
 * на читанні сесії.
 */
type SchemaMatchesType =
  z.infer<typeof pageComparisonSchema> extends PageComparison
    ? PageComparison extends z.infer<typeof pageComparisonSchema>
      ? true
      : never
    : never;

const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;
