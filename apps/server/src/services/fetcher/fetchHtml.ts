import { Buffer } from "node:buffer";
import { AppError } from "../../http/errors";
import { diagnose, type AccessProblem } from "./detect";

export interface FetchHtmlOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
}

export interface DirectFetchResult {
  /** null, якщо контенту немає або він непридатний. */
  buffer: Buffer | null;
  finalUrl: string;
  status: number;
  /** charset із заголовка Content-Type, якщо сервер його вказав. */
  charset: string | null;
  /** null — контент придатний до розбору. */
  problem: AccessProblem | null;
  /** Людський опис проблеми для повідомлення користувачеві. */
  detail: string;
}

/**
 * Дістає charset із Content-Type. Це найнадійніше джерело кодування:
 * за стандартом заголовок має пріоритет над <meta charset>.
 */
export function parseCharset(contentType: string | null): string | null {
  if (!contentType) return null;

  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  return match?.[1]?.toLowerCase() ?? null;
}

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

/** Скільки байтів декодувати для діагностики — заслонки завжди маленькі. */
const DIAGNOSE_BYTES = 300_000;

/**
 * Читає тіло відповіді з жорстким лімітом розміру.
 * Без ліміту одна велика сторінка може зʼїсти всю памʼять процесу.
 */
async function readWithLimit(
  response: Response,
  maxBytes: number,
  url: string,
): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError(
      "page_too_large",
      `Сторінка завелика (${Math.round(declared / 1024)} КБ): ${url}`,
      413,
    );
  }

  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        throw new AppError(
          "page_too_large",
          `Сторінка перевищила ліміт ${Math.round(maxBytes / 1024)} КБ: ${url}`,
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (total > maxBytes) await response.body.cancel().catch(() => {});
  }

  return Buffer.concat(chunks);
}

/**
 * Перша ступінь каскаду: звичайний HTTP-запит.
 *
 * User-Agent тут чесно повідомляє, що це інструмент, і не вдає Chrome.
 * Це не етичний жест, а заміряний результат: підробка Chrome-заголовків
 * знизила успішність із 4/8 до 3/8 на тестовій вибірці. Причина — TLS-відпечаток
 * Node не відповідає заявленому браузеру, і WAF ловить саму суперечність.
 * Сайти, які треба брати браузером, беруться справжнім браузером (ступінь 2).
 */
export async function fetchDirect(
  url: URL,
  options: FetchHtmlOptions,
): Promise<DirectFetchResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        "User-Agent": options.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uk,en;q=0.9,*;q=0.5",
      },
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    return {
      buffer: null,
      finalUrl: url.href,
      status: 0,
      charset: null,
      problem: "network",
      detail: isTimeout
        ? `сторінка не відповіла за ${options.timeoutMs / 1000} с`
        : `не вдалося зʼєднатися з ${url.hostname}`,
    };
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isHtml =
    contentType === "" ||
    HTML_CONTENT_TYPES.some((type) => contentType.includes(type));

  if (!isHtml) {
    await response.body?.cancel().catch(() => {});
    return {
      buffer: null,
      finalUrl: response.url || url.href,
      status: response.status,
      charset: null,
      problem: "not_html",
      detail: `за цим URL не HTML-сторінка (${contentType.split(";")[0]})`,
    };
  }

  const buffer = await readWithLimit(response, options.maxBytes, url.href);
  const head = buffer.subarray(0, DIAGNOSE_BYTES).toString("utf8");
  const headers = Object.fromEntries(response.headers.entries());
  const diagnosis = diagnose(response.status, head, headers);

  return {
    buffer: diagnosis.problem === null ? buffer : null,
    finalUrl: response.url || url.href,
    status: response.status,
    charset: parseCharset(response.headers.get("content-type")),
    problem: diagnosis.problem,
    detail: describe(diagnosis.problem, response.status, diagnosis),
  };
}

function describe(
  problem: AccessProblem | null,
  status: number,
  diagnosis: { words: number; title: string },
): string {
  switch (problem) {
    case null:
      return "";
    case "blocked":
      return diagnosis.title
        ? `заблоковано (${status}, «${diagnosis.title}»)`
        : `заблоковано (${status})`;
    case "not_found":
      return `сторінку не знайдено (${status})`;
    case "http_error":
      return `сервер відповів ${status}`;
    case "thin":
      return `сторінка віддала лише ${diagnosis.words} слів — контент домальовує JavaScript`;
    default:
      return `код ${status}`;
  }
}
