import { z } from "zod";
import type { SeoBrief } from "@brief/shared";
import { rangeSchema } from "../../schemas/range";

/**
 * Схема SEO ТЗ (розділ 9 ТЗ).
 *
 * Одна схема виконує три роботи: описує відповідь для моделі (через
 * toJsonSchema), валідує те, що модель повернула, і звіряється з типом
 * SeoBrief під час компіляції.
 *
 * Описи полів англійською навмисно: їх читає модель, і саме вони задають,
 * що має бути англійською інструкцією, а що — контентом мовою конкурентів.
 *
 * Поля, для яких порожнє значення законне («Empty array for other kinds»,
 * «empty array if not needed»), мають .default(). Схема в запиті все одно
 * називає їх обов'язковими — модель має їх надсилати, — але жоден провайдер
 * не гарантує форму відповіді, і на порожньому items у блоці highlight
 * валилося все ТЗ. Дописати [] тут дешевше за ще один запит.
 */

const blockSchema = z.object({
  kind: z
    .enum([
      "list",
      "ordered_list",
      "table",
      "pros_cons",
      "questions",
      "highlight",
      "links",
      "template",
    ])
    .describe(
      "list = bulleted list; ordered_list = numbered list where the order " +
        "matters (rankings, top-N, steps); table = comparison table; " +
        "pros_cons = advantages and disadvantages; questions = FAQ questions; " +
        "highlight = one key fact to visually highlight; " +
        "links = external links to place in the text; " +
        "template = one repeated description per entity",
    ),
  instruction: z
    .string()
    .describe(
      "IN ENGLISH. What the writer must do with this block, e.g. " +
        '"Create a list of payment methods. It is necessary to mention these methods in the list:"',
    ),
  items: z
    .array(z.string())
    .default([])
    .describe(
      "IN THE CONTENT LANGUAGE. For kind=list and kind=ordered_list — the " +
        "points that must be mentioned. For kind=questions — the FAQ questions " +
        "themselves; do NOT write answers, the writer will. For kind=template — " +
        "the entities to describe, one per item. Empty array for other kinds.",
    ),
  columns: z
    .array(z.string())
    .default([])
    .describe(
      "IN THE CONTENT LANGUAGE. For kind=table — column headers. For " +
        "kind=template — column headers of the small table inside every " +
        "description. Empty array for other kinds.",
    ),
  rows: z
    .array(z.string())
    .default([])
    .describe(
      "IN THE CONTENT LANGUAGE. Labels of the rows the writer must fill in. " +
        "Same two kinds as columns. Empty array for other kinds.",
    ),
  text: z
    .string()
    .optional()
    .describe(
      "For kind=highlight only. IN THE CONTENT LANGUAGE — the sentence itself " +
        "that must be highlighted, written out in full.",
    ),
  links: z
    .array(
      z.object({
        anchor: z.string().describe("IN THE CONTENT LANGUAGE. Anchor text"),
        url: z.string().describe("Full URL including https://"),
      }),
    )
    .optional()
    .describe(
      "For kind=links only — anchor text and URL for every link the writer " +
        "must place. Use only URLs that appear in the competitor data.",
    ),
  itemTemplate: z
    .string()
    .optional()
    .describe(
      "For kind=template only — the heading pattern of one description, e.g. " +
        '"H3: №. {Brand Name} — {short bonus description}"',
    ),
  itemWordCount: rangeSchema
    .optional()
    .describe("For kind=template only — word count of ONE description"),
  prosCount: rangeSchema
    .optional()
    .describe(
      "For kind=pros_cons and kind=template — how many advantages to list",
    ),
  consCount: rangeSchema
    .optional()
    .describe(
      "For kind=pros_cons and kind=template — how many disadvantages to list",
    ),
});

const h4Schema = z.object({
  title: z.string().describe("IN THE CONTENT LANGUAGE. H4 heading text"),
  instruction: z
    .string()
    .describe("IN ENGLISH. What to cover under this H4"),
  wordCount: rangeSchema.describe("Word count range for this H4"),
});

const h3Schema = z.object({
  title: z.string().describe("IN THE CONTENT LANGUAGE. H3 heading text"),
  instruction: z.string().describe("IN ENGLISH. What to cover under this H3"),
  wordCount: rangeSchema.describe("Word count range for this H3"),
  keywords: z
    .array(z.string())
    .describe(
      "IN THE CONTENT LANGUAGE. Keywords for this section — 4-8 of them, " +
        "word forms counted separately",
    ),
  blocks: z
    .array(blockSchema)
    .default([])
    .describe("Lists, tables or FAQ inside this H3"),
  children: z
    .array(h4Schema)
    .default([])
    .describe("Nested H4; empty array if not needed"),
});

const h2Schema = z.object({
  title: z.string().describe("IN THE CONTENT LANGUAGE. H2 heading text"),
  instruction: z
    .string()
    .describe(
      "IN ENGLISH. What must be described in this section, e.g. " +
        '"Write 50-75 words introduction, then explain how each variant differs"',
    ),
  wordCount: rangeSchema.describe("Word count range for this whole section"),
  keywords: z
    .array(z.string())
    .describe(
      "IN THE CONTENT LANGUAGE. Keywords for this section, as one flat list — " +
        "do NOT split into primary and secondary. 8-15 of them, listing the " +
        "word forms of the language as separate entries.",
    ),
  blocks: z
    .array(blockSchema)
    .default([])
    .describe("Lists, tables or FAQ inside this H2"),
  children: z
    .array(h3Schema)
    .default([])
    .describe("Nested H3; empty array if not needed"),
});

const introSchema = z.object({
  instruction: z
    .string()
    .describe(
      "IN ENGLISH. What the opening text between the H1 and the first H2 must " +
        'do, e.g. "Write the introduction following these requirements"',
    ),
  wordCount: rangeSchema.describe("Word count of the intro; usually 50-75"),
  paragraphs: rangeSchema.describe("How many paragraphs; usually 1-2"),
  mainPoints: z
    .array(z.string())
    .describe(
      "IN THE CONTENT LANGUAGE. The 2-4 things the intro must cover, one per item",
    ),
  keywords: z
    .array(z.string())
    .describe(
      "IN THE CONTENT LANGUAGE. Keywords to place in the intro, as one flat " +
        "list — 5-10 of them",
    ),
});

const keywordSchema = z.object({
  keyword: z.string().describe("IN THE CONTENT LANGUAGE"),
  usage: rangeSchema.describe(
    "How many times this keyword must appear in the finished article — " +
      "counting headings, tables and lists, and counting occurrences inside " +
      "longer keywords, not only occurrences in body paragraphs. A rare " +
      "keyword takes an exact number: min equal to max. Both bounds 0 mean " +
      "the opposite — a form the writer must not use at all.",
  ),
});

/* ── Додаткові рекомендації ──────────────────────────────────────────────── */

const optionalAdditionSchema = z.object({
  placement: z
    .enum(["h2", "h3", "block"])
    .describe(
      "h2 = a whole new section; h3 = a subsection inside an existing one; " +
        "block = a list, table, FAQ or highlight inside an existing section",
    ),
  title: z
    .string()
    .describe(
      "IN THE CONTENT LANGUAGE. The heading text, or the caption of the block.",
    ),
  section: z
    .string()
    .default("")
    .describe(
      "IN THE CONTENT LANGUAGE. The heading from \"structure\" this goes into " +
        "or after, copied verbatim. Empty string only if the place genuinely " +
        "does not matter.",
    ),
  wordCount: rangeSchema.describe("How many words this addition adds"),
  instruction: z
    .string()
    .describe("IN ENGLISH. What to put there and what it gains."),
});

export const seoBriefSchema = z.object({
  contentLanguage: z
    .string()
    .describe(
      "English name of the language of the analysed competitor pages, " +
        'e.g. "Italian", "Swedish", "Greek". All content fields must be in ' +
        "this language.",
    ),
  recommendedTitle: z
    .string()
    .describe("IN THE CONTENT LANGUAGE. Up to 60 characters"),
  recommendedMetaDescription: z
    .string()
    .describe("IN THE CONTENT LANGUAGE. 140-160 characters"),
  recommendedH1: z
    .string()
    .describe("IN THE CONTENT LANGUAGE. Must not duplicate the title verbatim"),
  instruction: z
    .string()
    .describe(
      "IN ENGLISH. Brief for the article as a whole: audience, tone, " +
        "what matters most. 2-4 sentences.",
    ),
  totalWordCount: rangeSchema.describe(
    "Total article length; at least the intro plus the sum of all H2 ranges",
  ),
  intro: introSchema.describe(
    "The opening text between the H1 and the first H2. Every article has one — " +
      "never leave it out and never repeat it as a separate H2.",
  ),
  structure: z.array(h2Schema).describe("Article outline: H2 → H3 → H4"),
  keywords: z
    .array(keywordSchema)
    .describe(
      "Summary table for the WHOLE article, sorted from the most frequent " +
        "keyword down. It must contain every keyword listed in the intro and " +
        "in any section, plus the head terms of the topic, the shorter " +
        "fragments they are built from and their word forms. Scale it to the " +
        "volume: one entry per 20-40 words, and never fewer than 60 entries — " +
        "hundreds of rows for a long article, not a short highlight list.",
    ),
  recommendations: z.object({
    optionalAdditions: z
      .array(optionalAdditionSchema)
      .default([])
      .describe(
        "Headings and blocks the writer MAY add on top of the outline. " +
          "Anything mandatory belongs in \"structure\", not here.",
      ),
    structureNotes: z
      .array(z.string())
      .default([])
      .describe(
        "IN ENGLISH. Advice about the article as a whole that belongs to no " +
          "single section: reading order, what to keep short, what to link, " +
          "what to update later.",
      ),
  }),
});

/**
 * Компіляційна гарантія, що схема не розійшлася з типами з @brief/shared.
 * Якщо додати поле в SeoBrief і забути тут (або навпаки) — впаде typecheck,
 * а не запит до AI у рантаймі.
 */
type SchemaMatchesType =
  z.infer<typeof seoBriefSchema> extends SeoBrief
    ? SeoBrief extends z.infer<typeof seoBriefSchema>
      ? true
      : never
    : never;

const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;

/**
 * JSON Schema для параметра responseJsonSchema провайдера.
 * `$schema` прибираємо: Gemini його не потребує, а зайві ключі
 * деякі провайдери відхиляють.
 */
export function toResponseSchema(): unknown {
  const jsonSchema = z.toJSONSchema(seoBriefSchema, {
    // Схеми, що використовуються повторно, вставляємо на місці:
    // не всі провайдери підтримують $ref/$defs.
    reused: "inline",
  }) as Record<string, unknown>;

  delete jsonSchema["$schema"];
  return jsonSchema;
}
