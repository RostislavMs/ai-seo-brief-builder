import type { FetchServiceId } from "../types/account";

/**
 * Платні сервіси доступу до сторінок, ключ яких додає сам користувач.
 *
 * Каскад доступу (див. server/services/fetcher/acquire.ts) працює й без них —
 * безкоштовні ступені закривають більшість сайтів. Ключ тут потрібен рівно для
 * тих сторінок, які не беруться нічим безкоштовним, і платить за них той, хто
 * ключ додав: спільного серверного ключа немає — так само, як і для AI.
 */

export const FETCH_SERVICE_IDS: FetchServiceId[] = ["firecrawl"];

export const FETCH_SERVICE_LABEL: Record<FetchServiceId, string> = {
  firecrawl: "Firecrawl",
};

/** Коротко про те, що сервіс робить із чужою сторінкою. */
export const FETCH_SERVICE_NOTE: Record<FetchServiceId, string> = {
  firecrawl:
    "Відкриває сторінку своїм браузером із резидентної адреси й віддає готовий текст — " +
    "тобто бере й ті сайти, де не спрацювали ні прямий запит, ні браузер, ні сервіс читання. " +
    "Один аналіз однієї сторінки — один кредит.",
};

/** Де взяти ключ. Показується поруч із полем вводу. */
export const FETCH_SERVICE_KEY_URL: Record<FetchServiceId, string> = {
  firecrawl: "https://www.firecrawl.dev/app/api-keys",
};

/** Префікс ключа — рання перевірка, щоб не ганяти явно чужий ключ у мережу. */
export const FETCH_SERVICE_KEY_PREFIX: Record<FetchServiceId, string | null> = {
  firecrawl: "fc-",
};

export function isFetchServiceId(value: unknown): value is FetchServiceId {
  return (
    typeof value === "string" && (FETCH_SERVICE_IDS as string[]).includes(value)
  );
}
