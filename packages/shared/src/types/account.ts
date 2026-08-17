/** Акаунт, ключі AI-провайдерів і налаштування. Спільний контракт web ↔ server. */

import type { UserRole } from "./rules";

/** Провайдери, для яких користувач може підставити власний ключ. */
export type AiProviderId = "gemini" | "openai" | "anthropic";

/**
 * Платні сервіси доступу до сторінок, ключ яких належить користувачеві.
 *
 * Окремо від AiProviderId навмисно: у цих сервісів немає ні моделі, ні
 * «активного» вибору. Вони не замінюють один одного, а лише додають каскаду
 * доступу ще одну ступінь — тому додати можна будь-який, а вибирати нічого.
 */
export type FetchServiceId = "firecrawl";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  /**
   * Роль керує лише правилами для мов: "admin" розглядає пропозиції,
   * "user" їх подає. На сесії, ключі й генерацію ТЗ вона не впливає.
   */
  role: UserRole;
  createdAt: string;
}

/**
 * Ключ у тому вигляді, в якому його бачить клієнт: без секрету.
 * Сам ключ після збереження не повертається нікуди й ніколи.
 */
export interface AiKeySummary {
  provider: AiProviderId;
  /** Кілька останніх символів ключа — щоб упізнати свій серед кількох. */
  hint: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ключ платного сервісу доступу — так само без секрету.
 * Моделі тут немає: сервіс віддає сторінку, а не генерує текст.
 */
export interface FetchKeySummary {
  service: FetchServiceId;
  hint: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Стан рахунку сервісу доступу. Читається живим запитом на вимогу, а не
 * разом із /api/me: залишок кредитів змінюється від кожного аналізу, і
 * підмішувати його в кожне читання профілю означало б чужий HTTP-запит
 * на кожному екрані.
 */
export interface FetchKeyStatus {
  service: FetchServiceId;
  /** null — сервіс не відповів; причина в `warning`. */
  remainingCredits: number | null;
  planCredits: number | null;
  /** Кінець розрахункового періоду в ISO. */
  periodEnd: string | null;
  /** true — цифри звірено з живим API сервісу. */
  live: boolean;
  warning: string | null;
}

export interface UserSettings {
  /**
   * null — жодного ключа ще не додано. Серверного ключа не існує:
   * запити завжди йдуть ключем самого користувача.
   */
  activeProvider: AiProviderId | null;
}

/** GET /api/me — усе, що потрібно інтерфейсу одразу після входу. */
export interface MeResponse {
  profile: UserProfile;
  keys: AiKeySummary[];
  /**
   * Ключі платних сервісів доступу до сторінок. Порожній масив — норма:
   * каскад працює й без них, просто без платних ступеней.
   */
  fetchKeys: FetchKeySummary[];
  settings: UserSettings;
  /** Провайдер і модель, якими зараз реально виконуються запити. */
  effective: {
    provider: string;
    model: string;
    /** "user" — ключ користувача, "none" — ключа немає й генерація не працює. */
    source: "user" | "none";
  };
  /**
   * Скільки правил чекає на розгляд — для бейджа в бічній панелі.
   * Для адміна — усі пропозиції, для звичайного користувача — лише власні.
   * Живе тут, а не в /api/rules, бо /api/me читається на кожному екрані,
   * а сторінка правил — ні.
   */
  pendingRules: number;
}

/** PUT /api/keys/:provider */
export interface SaveKeyRequest {
  apiKey: string;
  model: string;
}

/** PUT /api/fetch-keys/:service */
export interface SaveFetchKeyRequest {
  apiKey: string;
}

/** PATCH /api/settings */
export interface UpdateSettingsRequest {
  activeProvider?: AiProviderId | null;
}

/** PATCH /api/me */
export interface UpdateProfileRequest {
  displayName: string | null;
}

/**
 * Модель у списку вибору. Зливає два джерела: живий перелік від провайдера
 * (що реально доступне за цим ключем) і власний каталог (ціни, мітки).
 */
export interface ModelOption {
  id: string;
  label: string;
  /** null — моделі немає в каталозі, ціна й опис невідомі. */
  tier: "recommended" | "balanced" | "budget" | "premium" | null;
  /** USD за мільйон токенів. null — ціна не підтверджена. */
  inputPrice: number | null;
  outputPrice: number | null;
  contextTokens: number | null;
  note: string | null;
  /** true, якщо провайдер підтвердив доступність за ключем користувача. */
  available: boolean;
}

/** GET /api/models/:provider */
export interface ModelsResponse {
  provider: AiProviderId;
  models: ModelOption[];
  /** Модель, яку варто підставити за замовчуванням. */
  recommended: string;
  /**
   * true — список звірено з живим API провайдера.
   * false — ключа немає, показано лише каталог.
   */
  live: boolean;
  /** Заповнюється, якщо живий запит не вдався: ключ, мережа, ліміт. */
  warning: string | null;
}
