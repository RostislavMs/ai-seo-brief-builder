import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import { AppError } from "../http/errors";

/**
 * Клієнт Supabase із сервісним ключем.
 *
 * Сервісний ключ обходить RLS, тому кожен запит нижче за течією зобов'язаний
 * сам фільтрувати за user_id із перевіреного JWT. Це навмисний обмін:
 * логіка доступу лишається в одному місці (коді сервера), а не роз'їжджається
 * між політиками бази й обробниками маршрутів.
 */

let cached: { key: string; client: SupabaseClient } | null = null;

export function supabaseAdmin(config: AppConfig): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new AppError(
      "supabase_not_configured",
      "Сервер не бачить NITRO_SUPABASE_URL і NITRO_SUPABASE_SECRET_KEY. " +
        "Якщо вони є в apps/server/.env — перезапустіть pnpm dev: " +
        "змінні оточення читаються лише при старті процесу.",
      503,
    );
  }

  // Nitro в dev перезапускає модуль, а клієнт тримає пул з'єднань:
  // створювати його на кожен запит — марна робота.
  const cacheKey = `${config.supabaseUrl}::${config.supabaseSecretKey}`;
  if (cached?.key === cacheKey) return cached.client;

  const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      // Сервер без браузера: зберігати чи оновлювати сесію нічого й нікуди.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  cached = { key: cacheKey, client };
  return client;
}

export function isSupabaseConfigured(config: AppConfig): boolean {
  return Boolean(config.supabaseUrl && config.supabaseSecretKey);
}

/** Перетворює помилку PostgREST у зрозумілу користувачеві. */
export function throwDbError(
  error: { message: string; code?: string },
  context: string,
): never {
  console.error(`[db] ${context}:`, error);

  // Таблиць немає — типова ситуація на свіжому проєкті Supabase.
  // PostgREST не бачить їх у своєму кеші схеми й віддає PGRST205,
  // а не звичний код Postgres 42P01.
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist/i.test(error.message)
  ) {
    throw new AppError(
      "db_not_migrated",
      "Таблиці не створені. Виконайте supabase/migrations/0001_init.sql " +
        "у SQL Editor вашого проєкту Supabase.",
      503,
    );
  }

  throw new AppError("db_error", `Помилка бази даних: ${error.message}`, 500);
}
