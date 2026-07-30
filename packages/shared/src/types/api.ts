/**
 * Контракт HTTP API між apps/web та apps/server.
 * Обидві сторони імпортують ці типи — розсинхрон ловиться на typecheck.
 */

import type { PageAnalysis, ParsedPage } from "./page";
import type { SeoBrief } from "./brief";
import type { PageComparison } from "./comparison";
import type { ChatMessage, Session, SessionSummary } from "./session";

/** Уніфікована помилка API. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** POST /api/analyze — спарсити список URL. */
export interface AnalyzeRequest {
  urls: string[];
}

export interface AnalyzeResponse {
  results: PageAnalysis[];
}

/**
 * POST /api/brief — згенерувати SEO ТЗ з уже спарсених сторінок.
 *
 * Мова визначається зі самих сторінок; `languageCode` лише перебиває
 * визначену, коли користувач виправив її вручну у вкладці «Аналіз».
 */
export interface BriefRequest {
  /** Цільова тема/ключ статті. */
  topic: string;
  pages: ParsedPage[];
  /** Код ISO 639-1. Відсутній або невідомий — мова визначається зі сторінок. */
  languageCode?: string;
}

export interface BriefResponse {
  brief: SeoBrief;
}

/** POST /api/chat — правки брифу через діалог. */
export interface ChatRequest {
  topic: string;
  /** Поточний бриф, який AI має відредагувати. */
  brief: SeoBrief;
  /** Історія діалогу без нового повідомлення. */
  history: ChatMessage[];
  message: string;
  /** Спарсені сторінки як контекст. Повторного парсингу не відбувається. */
  pages: ParsedPage[];
}

export interface ChatResponse {
  /** Текстова відповідь AI для показу в чаті. */
  reply: string;
  /** Оновлений бриф. null — якщо AI нічого не змінював. */
  brief: SeoBrief | null;
}

/**
 * POST /api/compare — аналіз власної сторінки відносно конкурентів.
 *
 * Наявне ТЗ у запит не входить: порівняння має працювати й тоді, коли ТЗ ще
 * не згенеровано, а звіт, форма якого залежить від наявності ТЗ, читався б
 * як два різні звіти.
 */
export interface CompareRequest {
  topic: string;
  /** Власна сторінка. */
  page: ParsedPage;
  /** Сторінки конкурентів — потрібна хоча б одна. */
  competitors: ParsedPage[];
  /** Те саме перевизначення мови, що й у BriefRequest. */
  languageCode?: string;
}

export interface CompareResponse {
  comparison: PageComparison;
}

/**
 * GET /api/health
 *
 * Про AI тут нічого немає навмисно: ключ належить користувачеві, а не серверу,
 * тому «чи налаштований AI» — питання акаунта, і відповідає на нього /api/me.
 */
export interface HealthResponse {
  ok: true;
  /** true, якщо сервер бачить налаштування Supabase і авторизація працює. */
  authConfigured: boolean;
}

/* ── Сесії в базі ─────────────────────────────────────────────────────────
 *
 * Сесія читається цілком (GET /:id), а пишеться дрібними частинами.
 * Причина у вазі: одна спарсена сторінка важить сотні кілобайт, і слати
 * весь об'єкт щоразу, коли завершився аналіз одного URL, — це десять
 * повних тіл запиту замість десяти маленьких.
 */

export interface SessionListResponse {
  sessions: SessionSummary[];
}

export interface SessionResponse {
  session: Session;
}

export interface CreateSessionRequest {
  name: string;
  topic: string;
  urls: string[];
  /**
   * Власна сторінка — необовʼязково.
   *
   * Задається одразу при створенні, щоб вона парсилася разом із конкурентами:
   * інакше найчастіший сценарій («у мене вже є стаття, чого їй бракує?»)
   * вимагав би створити сесію, дочекатися аналізу й лише тоді згадати про
   * власну адресу в іншій вкладці.
   */
  ownUrl?: string;
}

/** PATCH /api/sessions/:id — надсилаються лише змінені поля. */
export interface UpdateSessionRequest {
  name?: string;
  topic?: string;
  brief?: SeoBrief | null;
  comparison?: PageComparison | null;
  legacyBriefRemoved?: boolean;
  /** Код ISO 639-1 або null — повернутися до автовизначення. */
  contentLanguage?: string | null;
}

/**
 * PUT /api/sessions/:id/own-page — задати або замінити власну сторінку.
 *
 * PUT, а не POST: власна сторінка в сесії одна, і повторний виклик має
 * замінювати її, а не додавати другу.
 */
export interface SetOwnPageRequest {
  url: string;
}

/**
 * PATCH /api/sessions/:id/analyses/:analysisId
 *
 * Два різні виклики одним маршрутом: результат парсингу (усі чотири поля
 * разом — вони описують один момент) і прапорець «не використовувати для ТЗ»
 * (сам, без решти). Тому поля необовʼязкові, але надіслати порожнє тіло
 * не можна.
 */
export interface UpdateAnalysisRequest {
  status?: PageAnalysis["status"];
  page?: ParsedPage | null;
  error?: string | null;
  analyzedAt?: string | null;
  /** true — виключити сторінку з основи для ТЗ, false — повернути в роботу. */
  excluded?: boolean;
}

export interface AnalysisResponse {
  analysis: PageAnalysis;
}

export interface CreateMessageRequest {
  role: ChatMessage["role"];
  content: string;
  changedBrief?: boolean;
}

export interface MessageResponse {
  message: ChatMessage;
}

/** POST /api/sessions/import — перенесення сесій із localStorage в акаунт. */
export interface ImportSessionsRequest {
  sessions: Session[];
}

export interface ImportSessionsResponse {
  imported: number;
  skipped: number;
}
