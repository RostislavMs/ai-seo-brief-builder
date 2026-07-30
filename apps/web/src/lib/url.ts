/**
 * Підготовка списку URL з того, що ввів користувач.
 * Сервер валідує все повторно — це лише щоб не гнати очевидний мусор
 * і не аналізувати ту саму сторінку двічі.
 */

/** Ключ для порівняння: без схеми, www та кінцевого слеша. */
function comparableKey(raw: string): string {
  const withoutScheme = raw.trim().toLowerCase().replace(/^https?:\/\//, "");
  return withoutScheme.replace(/^www\./, "").replace(/\/+$/, "");
}

/** Розбирає текст із поля введення: по одному URL на рядок, коми теж працюють. */
export function parseUrlInput(input: string): string[] {
  return input
    .split(/[\n,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function dedupeUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const key = comparableKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(url.trim());
  }

  return result;
}

/** Груба перевірка, щоб підсвітити помилку до відправки на сервер. */
export function looksLikeUrl(value: string): boolean {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    // Домен без точки — майже завжди помилка введення.
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Короткий вигляд URL для щільних списків. */
export function shortenUrl(raw: string, maxLength = 60): string {
  const withoutScheme = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const decoded = safeDecode(withoutScheme);

  return decoded.length > maxLength
    ? `${decoded.slice(0, maxLength - 1)}…`
    : decoded;
}

/** URL з кирилицею приходять у percent-encoding — показуємо читабельно. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
