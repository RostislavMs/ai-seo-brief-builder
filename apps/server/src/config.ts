import { useRuntimeConfig } from "nitropack/runtime";

/**
 * Єдина точка доступу до налаштувань. Значення задані в nitro.config.ts,
 * а в рантаймі перекриваються змінними NITRO_* з .env
 * (`NITRO_FETCH_TIMEOUT_MS` → `fetchTimeoutMs`).
 *
 * Ключа AI тут немає: запити виконуються ключем користувача з user_ai_keys.
 */
export interface AppConfig {
  supabaseUrl: string;
  supabaseSecretKey: string;
  supabaseJwksUrl: string;
  encryptionKey: string;
  /** Пошти, яким автоматично видається роль адміна. Уже в нижньому регістрі. */
  adminEmails: readonly string[];
  fetchTimeoutMs: number;
  fetchMaxBytes: number;
  fetchUserAgent: string;
  allowPrivateHosts: boolean;
  maxUrlsPerRequest: number;
  browserEnabled: boolean;
  browserTimeoutMs: number;
  browserPath: string;
  browserSettleMs: number;
  archiveEnabled: boolean;
  archiveOnDemandEnabled: boolean;
  archiveSaveTimeoutMs: number;
}

const DEFAULTS: AppConfig = {
  supabaseUrl: "",
  supabaseSecretKey: "",
  supabaseJwksUrl: "",
  encryptionKey: "",
  adminEmails: [],
  fetchTimeoutMs: 20_000,
  fetchMaxBytes: 4_000_000,
  fetchUserAgent:
    "Mozilla/5.0 (compatible; AI-SEO-Brief-Builder/0.1; +https://github.com/local/ai-seo-brief-builder)",
  allowPrivateHosts: false,
  maxUrlsPerRequest: 10,
  browserEnabled: true,
  browserTimeoutMs: 35_000,
  browserPath: "",
  browserSettleMs: 8000,
  archiveEnabled: true,
  archiveOnDemandEnabled: true,
  archiveSaveTimeoutMs: 90_000,
};

/** Nitro прогоняє env через destr, але з .env усе одно може прийти рядок. */
function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Список через кому з .env. Регістр знімаємо одразу: пошта в JWT і пошта,
 * набрана рукою в .env, різняться регістром частіше, ніж здається.
 */
function asEmailList(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

export function getConfig(): AppConfig {
  const runtime = useRuntimeConfig() as Record<string, unknown>;

  const supabaseUrl = asString(
    runtime["supabaseUrl"],
    DEFAULTS.supabaseUrl,
  ).replace(/\/+$/, "");

  return {
    supabaseUrl,
    supabaseSecretKey: asString(
      runtime["supabaseSecretKey"],
      DEFAULTS.supabaseSecretKey,
    ),
    // Стандартний шлях Supabase — щоб у .env не тримати четверту змінну,
    // яка завжди виводиться з першої.
    supabaseJwksUrl: asString(
      runtime["supabaseJwksUrl"],
      supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : "",
    ),
    encryptionKey: asString(runtime["encryptionKey"], DEFAULTS.encryptionKey),
    adminEmails: asEmailList(runtime["adminEmails"]),
    fetchTimeoutMs: asNumber(runtime["fetchTimeoutMs"], DEFAULTS.fetchTimeoutMs),
    fetchMaxBytes: asNumber(runtime["fetchMaxBytes"], DEFAULTS.fetchMaxBytes),
    fetchUserAgent: asString(runtime["fetchUserAgent"], DEFAULTS.fetchUserAgent),
    allowPrivateHosts: asBoolean(
      runtime["allowPrivateHosts"],
      DEFAULTS.allowPrivateHosts,
    ),
    maxUrlsPerRequest: asNumber(
      runtime["maxUrlsPerRequest"],
      DEFAULTS.maxUrlsPerRequest,
    ),
    browserEnabled: asBoolean(runtime["browserEnabled"], DEFAULTS.browserEnabled),
    browserTimeoutMs: asNumber(
      runtime["browserTimeoutMs"],
      DEFAULTS.browserTimeoutMs,
    ),
    browserPath: asString(runtime["browserPath"], DEFAULTS.browserPath),
    browserSettleMs: asNumber(
      runtime["browserSettleMs"],
      DEFAULTS.browserSettleMs,
    ),
    archiveEnabled: asBoolean(runtime["archiveEnabled"], DEFAULTS.archiveEnabled),
    archiveOnDemandEnabled: asBoolean(
      runtime["archiveOnDemandEnabled"],
      DEFAULTS.archiveOnDemandEnabled,
    ),
    archiveSaveTimeoutMs: asNumber(
      runtime["archiveSaveTimeoutMs"],
      DEFAULTS.archiveSaveTimeoutMs,
    ),
  };
}
