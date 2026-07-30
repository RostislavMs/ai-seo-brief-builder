/**
 * Структура даних однієї спарсеної сторінки конкурента.
 * Це єдиний формат, у якому контент доходить до AI — HTML сюда не потрапляє.
 */

/** Рівні заголовків, які нас цікавлять згідно з ТЗ (H1–H4). */
export type HeadingLevel = 1 | 2 | 3 | 4;

/**
 * Один заголовок у порядку появи в документі.
 * Плоский упорядкований список замість чотирьох окремих масивів —
 * так зберігається реальна вкладеність структури, що критично для AI.
 * Для відображення у UI є хелпер `groupHeadings()`.
 */
export interface Heading {
  level: HeadingLevel;
  text: string;
}

/** Заголовки, згруповані за рівнями — формат із розділу 7 ТЗ. */
export interface GroupedHeadings {
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
}

export type ListKind = "ordered" | "unordered";

export interface ContentList {
  kind: ListKind;
  items: string[];
}

export interface ContentTable {
  caption: string | null;
  headers: string[];
  rows: string[][];
}

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Як саме вдалося отримати контент. Багато сайтів блокують ботів, тому
 * використовується каскад стратегій — і користувач має бачити, яка спрацювала.
 */
export type ContentSource = "direct" | "browser" | "archive";

/** Метадані сторінки. */
export interface PageMeta {
  url: string;
  /** URL після редиректів, якщо він відрізняється від запрошеного. */
  finalUrl: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** Мова з атрибута <html lang>, якщо є. */
  lang: string | null;
  source: ContentSource;
  /**
   * Дата архівної копії в ISO. Заповнена лише для source === "archive":
   * архів може бути застарілим, і це треба показувати явно.
   */
  archivedAt: string | null;
}

/** Повністю очищений і структурований контент сторінки. */
export interface ParsedPage {
  meta: PageMeta;
  headings: Heading[];
  paragraphs: string[];
  lists: ContentList[];
  tables: ContentTable[];
  faq: FaqItem[];
  wordCount: number;
}

export type AnalysisStatus = "pending" | "loading" | "success" | "error";

/** Результат аналізу одного URL разом зі статусом — саме це показує UI. */
export interface PageAnalysis {
  id: string;
  url: string;
  status: AnalysisStatus;
  page: ParsedPage | null;
  error: string | null;
  /** ISO-дата завершення парсингу. */
  analyzedAt: string | null;
}
