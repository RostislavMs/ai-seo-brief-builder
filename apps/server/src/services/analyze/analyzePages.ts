import { randomUUID } from "node:crypto";
import type { PageAnalysis } from "@brief/shared";
import { AppError } from "../../http/errors";
import type { AcquireOptions } from "../fetcher/acquire";
import { normalizeUrl, urlKey } from "../fetcher/url";
import { parsePage } from "../parser";

/**
 * Скільки сторінок тягнемо одночасно. Обмеження важливе: кожна може підняти
 * власний контекст браузера, а це найдорожча частина пайплайна.
 */
const CONCURRENCY = 4;

/** Прибирає повтори: той самий URL із www/без, зі слешем і без — це одна сторінка. */
function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let key = trimmed.toLowerCase();
    try {
      key = urlKey(normalizeUrl(trimmed));
    } catch {
      // Невалідний URL лишаємо в роботі: користувач має побачити,
      // яка саме адреса не підійшла.
    }

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

/** Обробляє список із обмеженням одночасних задач, зберігаючи порядок. */
async function runWithLimit<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;

        const item = items[index];
        if (item === undefined) return;

        results[index] = await worker(item);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

/**
 * Аналізує всі URL незалежно один від одного (розділ 12 ТЗ):
 * падіння однієї сторінки не зриває решту, а повертається як status: "error".
 */
export async function analyzePages(
  urls: string[],
  options: AcquireOptions,
): Promise<PageAnalysis[]> {
  const targets = dedupeUrls(urls);

  return runWithLimit(targets, CONCURRENCY, async (url) => {
    const base = { id: randomUUID(), url };

    try {
      const page = await parsePage(url, options);

      return {
        ...base,
        status: "success",
        page,
        error: null,
        analyzedAt: new Date().toISOString(),
      } satisfies PageAnalysis;
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Невідома помилка парсингу";

      if (!(error instanceof AppError)) {
        console.error(`[analyze] ${url} —`, error);
      }

      return {
        ...base,
        status: "error",
        page: null,
        error: message,
        analyzedAt: new Date().toISOString(),
      } satisfies PageAnalysis;
    }
  });
}
