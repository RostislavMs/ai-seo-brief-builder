import { z } from "zod";
import type { ParsedPage } from "@brief/shared";

/**
 * Валідація ParsedPage, який приходить від клієнта.
 *
 * Сесії живуть у localStorage, тому спарсені сторінки повертаються на сервер
 * від клієнта — а йому не можна довіряти. Ліміти водночас захищають
 * від запиту на десятки мегабайтів.
 */

const headingSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
});

export const parsedPageSchema = z.object({
  meta: z.object({
    url: z.string(),
    finalUrl: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    canonical: z.string().nullable(),
    lang: z.string().nullable(),
    source: z.enum([
      "direct",
      "browser",
      "reader",
      "proxy",
      "firecrawl",
      "scraper",
      "archive",
    ]),
    archivedAt: z.string().nullable(),
  }),
  headings: z.array(headingSchema).max(500),
  paragraphs: z.array(z.string()).max(500),
  lists: z
    .array(
      z.object({
        kind: z.enum(["ordered", "unordered"]),
        items: z.array(z.string()).max(300),
      }),
    )
    .max(150),
  tables: z
    .array(
      z.object({
        caption: z.string().nullable(),
        headers: z.array(z.string()).max(50),
        rows: z.array(z.array(z.string()).max(50)).max(300),
      }),
    )
    .max(60),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .max(100),
  wordCount: z.number().int().nonnegative(),
});

/** Компіляційна гарантія збігу з типом із @brief/shared. */
type SchemaMatchesType =
  z.infer<typeof parsedPageSchema> extends ParsedPage
    ? ParsedPage extends z.infer<typeof parsedPageSchema>
      ? true
      : never
    : never;

const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;
