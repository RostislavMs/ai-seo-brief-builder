import type { ParsedPage } from "@brief/shared";
import { median, outlineToText } from "@brief/shared";

/**
 * Ліміти на одну сторінку. Заголовки не обрізаємо ніколи — це основа аналізу.
 * Решту стрижемо, бо десять сторінок сирого контенту дають промпт,
 * за який платиться без пропорційної користі.
 */
const LIMITS = {
  paragraphs: 40,
  paragraphChars: 500,
  lists: 12,
  listItems: 12,
  tables: 6,
  tableRows: 6,
  faq: 15,
  faqAnswerChars: 400,
} as const;

interface PagePayload {
  url: string;
  title: string | null;
  description: string | null;
  wordCount: number;
  /** Дерево заголовків із відступами — компактніше за масив обʼєктів. */
  outline: string;
  paragraphs: string[];
  lists: string[][];
  tables: { caption: string | null; headers: string[]; rows: string[][] }[];
  faq: { question: string; answer: string }[];
}

function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function toPagePayload(page: ParsedPage): PagePayload {
  return {
    url: page.meta.finalUrl,
    title: page.meta.title,
    description: page.meta.description,
    wordCount: page.wordCount,
    outline: outlineToText(page.headings),
    paragraphs: page.paragraphs
      .slice(0, LIMITS.paragraphs)
      .map((text) => cut(text, LIMITS.paragraphChars)),
    lists: page.lists
      .slice(0, LIMITS.lists)
      .map((list) => list.items.slice(0, LIMITS.listItems)),
    tables: page.tables.slice(0, LIMITS.tables).map((table) => ({
      caption: table.caption,
      headers: table.headers,
      rows: table.rows.slice(0, LIMITS.tableRows),
    })),
    faq: page.faq.slice(0, LIMITS.faq).map((item) => ({
      question: item.question,
      answer: cut(item.answer, LIMITS.faqAnswerChars),
    })),
  };
}

export interface PagesPayload {
  json: string;
  /** Скільки сторінок і скільки символів реально пішло в промпт. */
  pageCount: number;
  chars: number;
}

/**
 * Готує дані конкурентів для промпта.
 * До AI йде лише цей обʼєкт — HTML не потрапляє сюда за побудовою (розділ 3 ТЗ).
 */
export function buildPagesPayload(pages: readonly ParsedPage[]): PagesPayload {
  const json = JSON.stringify(pages.map(toPagePayload));

  return { json, pageCount: pages.length, chars: json.length };
}

/**
 * Та сама підготовка для однієї сторінки — власної, у порівнянні
 * з конкурентами. Обʼєкт, а не масив з одного елемента: у промпті поряд
 * стоять «ваша сторінка» і «сторінки конкурентів», і масив на першому місці
 * читався б як ще один перелік.
 */
export function buildPagePayload(page: ParsedPage): PagesPayload {
  const json = JSON.stringify(toPagePayload(page));

  return { json, pageCount: 1, chars: json.length };
}

/**
 * Скорочений контекст конкурентів для чату.
 *
 * Під час правок ТЗ повний контент не потрібен — потрібне заземлення на те,
 * що конкуренти взагалі покривають. Тому лишаються тільки структура,
 * обсяг і питання FAQ. Це в разів дешевше, а чат викликається багато разів.
 */
export function buildCompactPagesPayload(
  pages: readonly ParsedPage[],
): PagesPayload {
  const json = JSON.stringify(
    pages.map((page) => ({
      url: page.meta.finalUrl,
      title: page.meta.title,
      wordCount: page.wordCount,
      outline: outlineToText(page.headings),
      faqQuestions: page.faq.slice(0, LIMITS.faq).map((item) => item.question),
    })),
  );

  return { json, pageCount: pages.length, chars: json.length };
}

/** Медіана обсягу конкурентів — орієнтир для обсягу статті. */
export function medianWordCount(pages: readonly ParsedPage[]): number {
  // Порожні сторінки відкидаються до підрахунку: нуль у вибірці тягне
  // орієнтир униз, хоча означає лише невдалий парсинг.
  return median(pages.map((page) => page.wordCount).filter((count) => count > 0));
}
