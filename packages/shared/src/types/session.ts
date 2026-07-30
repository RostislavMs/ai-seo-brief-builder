/** Сесія — одиниця роботи користувача (розділ 5 ТЗ). Живе в localStorage. */

import type { PageAnalysis } from "./page";
import type { SeoBrief } from "./brief";
import type { PageComparison } from "./comparison";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** true, якщо ця відповідь AI змінила поточне SEO ТЗ. */
  changedBrief?: boolean;
}

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Цільовий ключ/тема статті — задає користувач, впливає на весь бриф. */
  topic: string;
  urls: string[];
  /** Сторінки конкурентів. Власна сторінка сюди не потрапляє. */
  analyses: PageAnalysis[];
  messages: ChatMessage[];
  brief: SeoBrief | null;
  /**
   * Власна сторінка користувача — та, яку порівнюємо з конкурентами.
   *
   * Окреме поле, а не ще один рядок у `analyses`: інакше вона мовчки пішла б
   * у промпт генерації ТЗ разом із конкурентами, і ТЗ склалося б у тому числі
   * зі сторінки, яку воно має виправити.
   */
  ownPage: PageAnalysis | null;
  /** Результат порівняння власної сторінки з конкурентами. */
  comparison: PageComparison | null;
  /**
   * true, якщо ТЗ було відкинуте під час приведення сесії до нового формату.
   * Прапорець зберігається, доки користувач не згенерує ТЗ заново, — інакше
   * повідомлення зникало б після першого ж перезавантаження сторінки,
   * і причина втрати ТЗ лишалася б незрозумілою.
   */
  legacyBriefRemoved?: boolean;
}

/** Полегшений вид сесії для списку на Home — без важкого контенту. */
export interface SessionSummary {
  id: string;
  name: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  urlCount: number;
  hasBrief: boolean;
}
