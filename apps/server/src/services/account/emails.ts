import type { AppConfig } from "../../config";
import { supabaseAdmin } from "../../lib/supabase";

/**
 * Пошти за id профілів — підписи «хто це зробив».
 *
 * Окремим запитом, а не вкладеним select-ом: таблиці з історією посилаються
 * на profiles кількома колонками одразу (автор і той, хто розглянув), і
 * вкладений select довелося б розрізняти підказкою на імʼя звʼязку. Явний
 * запит id → email не залежить ні від імені обмеження, ні від стану кеша
 * схеми PostgREST — а коштує один невеликий похід у базу.
 *
 * Помилка читання не кидається: імʼя автора — підпис, а не дані. Без нього
 * список читається, тому валити через нього всю сторінку не варто.
 */
export async function profileEmails(
  config: AppConfig,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];

  if (unique.length === 0) return new Map();

  const { data, error } = await supabaseAdmin(config)
    .from("profiles")
    .select("id, email")
    .in("id", unique)
    .returns<{ id: string; email: string }[]>();

  if (error) {
    console.warn("[account] не вдалося прочитати пошти авторів:", error);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.id, row.email]));
}
