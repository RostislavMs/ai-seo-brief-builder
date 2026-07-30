import { AppError } from "../../http/errors";

/**
 * Хости, куди сервер не має ходити за запитом користувача.
 * Інакше форма «вставте URL» перетворюється на інструмент сканування
 * внутрішньої мережі, у якій стоїть сервер (SSRF).
 */
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

const PRIVATE_IPV4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

const INTERNAL_TLD = /\.(local|localhost|internal|intranet|test|invalid)$/i;

/** Приводить введений користувачем рядок до валідного абсолютного URL. */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new AppError("invalid_url", "Порожній URL");
  }

  // Користувачі часто вставляють адресу без схеми.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AppError("invalid_url", `Некоректний URL: ${input}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError(
      "invalid_url",
      `Підтримуються лише http і https: ${input}`,
    );
  }

  // Фрагмент не впливає на відповідь сервера — прибираємо,
  // щоб той самий URL не аналізувався двічі.
  url.hash = "";

  return url;
}

/**
 * Забороняє звернення до локальних та приватних адрес.
 * Перевіряється лише hostname — DNS-rebinding у MVP не покривається.
 */
export function assertPublicHost(url: URL, allowPrivateHosts: boolean): void {
  if (allowPrivateHosts) return;

  const hostname = url.hostname.toLowerCase();

  if (
    LOOPBACK_HOSTNAMES.has(hostname) ||
    PRIVATE_IPV4.test(hostname) ||
    INTERNAL_TLD.test(hostname) ||
    hostname.startsWith("[fc") ||
    hostname.startsWith("[fd") ||
    hostname.startsWith("[fe80")
  ) {
    throw new AppError(
      "blocked_host",
      `Аналіз локальних і приватних адрес заборонено: ${url.hostname}`,
      403,
    );
  }
}

/** Ключ для дедуплікації URL у межах одного запиту. */
export function urlKey(url: URL): string {
  const host = url.hostname.replace(/^www\./i, "");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${host}${path}${url.search}`;
}
