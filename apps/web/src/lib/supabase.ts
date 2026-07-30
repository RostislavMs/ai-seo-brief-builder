import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Клієнт Supabase у браузері. Відповідає лише за авторизацію: дані
 * застосунок читає й пише через власне API, де є перевірка прав і
 * шифрування ключів.
 *
 * Publishable-ключ у бандлі — це нормально: він публічний за задумом,
 * а доступ до рядків обмежує RLS.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

/**
 * Без змінних оточення клієнта не створюємо: createClient кинув би виняток
 * на етапі імпорту модуля й застосунок не відрендерився б узагалі —
 * замість зрозумілого пояснення користувач побачив би білий екран.
 */
export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Посилання підтвердження пошти й скидання пароля приходять
          // з токенами у фрагменті URL — клієнт має їх розібрати.
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      })
    : null;

export const isAuthConfigured = supabase !== null;

/** Кидає, якщо клієнта немає. Для місць, де без нього нічого робити. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Не задані VITE_SUPABASE_URL і VITE_SUPABASE_PUBLISHABLE_KEY " +
        "в apps/web/.env",
    );
  }

  return supabase;
}
