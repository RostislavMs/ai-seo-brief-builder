/** Акаунт, ключі AI-провайдерів і налаштування. Спільний контракт web ↔ server. */

import type { UserRole } from "./rules";

/** Провайдери, для яких користувач може підставити власний ключ. */
export type AiProviderId = "gemini" | "openai" | "anthropic";

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
