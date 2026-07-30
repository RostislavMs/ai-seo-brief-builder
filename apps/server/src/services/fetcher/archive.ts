import { Buffer } from "node:buffer";
import { diagnose, type AccessProblem } from "./detect";
import { parseCharset } from "./fetchHtml";

/**
 * Третя ступінь каскаду: Wayback Machine.
 *
 * Публічний архів забирає саме ті сайти, які не беруться нічим іншим:
 * на тестовій вибірці це g2.com (6860 слів) і forbes.com. Ціна — контент
 * може бути застарілим, тому дата копії повертається назовні
 * й показується в інтерфейсі.
 */

const WAYBACK_HOST = "https://web.archive.org";

/** Суфікс id_ віддає оригінальний HTML без панелі та скриптів архіву. */
function snapshotUrl(target: string): string {
  return `${WAYBACK_HOST}/web/2id_/${target}`;
}

/**
 * Заслонка «копії немає» самого архіву. Вона віддає 583 слова службового
 * тексту й переважно код 404 — але покладатися лише на код не можна:
 * без цієї перевірки боілерплейт Wayback пішов би до AI як контент конкурента.
 */
const ARCHIVE_MISS =
  /doesn'?t have that page|has not archived|not been archived|Hrm\.|wayback machine/i;

function looksLikeArchiveMiss(html: string): boolean {
  const title = (/<title[^>]*>([^<]{0,200})/i.exec(html) ?? [])[1] ?? "";
  return ARCHIVE_MISS.test(title);
}

export interface ArchiveFetchOptions {
  timeoutMs: number;
  maxBytes: number;
}

export interface ArchiveFetchResult {
  buffer: Buffer | null;
  /** charset із Content-Type відповіді архіву. */
  charset: string | null;
  /** Оригінальний URL сторінки, а не адреса архіву. */
  finalUrl: string;
  /** ISO-дата копії. */
  archivedAt: string | null;
  problem: AccessProblem | null;
  detail: string;
}

/**
 * Дата зашита в адресу знімка: /web/20260315123456id_/https://…
 * Розбираємо саму адресу, щоб не робити ще один запит до API.
 */
function parseSnapshotDate(archiveUrl: string): string | null {
  const match = /\/web\/(\d{14})/.exec(archiveUrl);
  if (!match?.[1]) return null;

  const stamp = match[1];
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`;

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Просить Internet Archive створити копію просто зараз (Save Page Now).
 *
 * Заміряно на сайті, закритому Cloudflare від усіх наших ступенів:
 * копії не існувало, SPN створив її за 20.6 с — 2615 слів, дата сьогоднішня.
 * Тобто краулер архіву проходить там, де не проходимо ми, і застарілість
 * тут не виникає взагалі.
 *
 * Ступінь остання й найповільніша: це безкоштовний публічний сервіс,
 * тому звертаємося до нього лише коли не лишилось інших варіантів.
 */
export async function requestArchiveSnapshot(
  url: URL,
  options: ArchiveFetchOptions & { saveTimeoutMs: number },
): Promise<ArchiveFetchResult> {
  const failure = (problem: AccessProblem, detail: string): ArchiveFetchResult => ({
    buffer: null,
    finalUrl: url.href,
    charset: null,
    archivedAt: null,
    problem,
    detail,
  });

  let saved: Response;

  try {
    saved = await fetch(`${WAYBACK_HOST}/save/${url.href}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(options.saveTimeoutMs),
      headers: { "User-Agent": "AI-SEO-Brief-Builder/0.1" },
    });
  } catch {
    return failure(
      "network",
      `архів не встиг створити копію за ${Math.round(options.saveTimeoutMs / 1000)} с`,
    );
  }

  // Без ключа сервіс обмежує частоту — це нормальна ситуація, не помилка.
  if (saved.status === 429) {
    await saved.body?.cancel().catch(() => {});
    return failure(
      "blocked",
      "архів обмежив частоту створення копій, спробуйте за хвилину",
    );
  }

  if (!saved.ok) {
    await saved.body?.cancel().catch(() => {});
    return failure(
      "http_error",
      `архів не зміг створити копію (${saved.status})`,
    );
  }

  await saved.body?.cancel().catch(() => {});

  // Відповідь SPN містить панель архіву, тому читаємо створений знімок
  // окремо через id_ — так приходить оригінальний HTML.
  const stamp = /\/web\/(\d{14})/.exec(saved.url)?.[1];

  return readSnapshot(
    url,
    stamp ? `${WAYBACK_HOST}/web/${stamp}id_/${url.href}` : snapshotUrl(url.href),
    options,
  );
}

export async function fetchFromArchive(
  url: URL,
  options: ArchiveFetchOptions,
): Promise<ArchiveFetchResult> {
  return readSnapshot(url, snapshotUrl(url.href), options);
}

async function readSnapshot(
  url: URL,
  archiveUrl: string,
  options: ArchiveFetchOptions,
): Promise<ArchiveFetchResult> {
  const failure = (problem: AccessProblem, detail: string): ArchiveFetchResult => ({
    buffer: null,
    finalUrl: url.href,
    charset: null,
    archivedAt: null,
    problem,
    detail,
  });

  let response: Response;

  try {
    response = await fetch(archiveUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        // Архів віддає контент будь-кому, підбирати заголовки не потрібно.
        "User-Agent": "AI-SEO-Brief-Builder/0.1",
        Accept: "text/html,*/*;q=0.8",
      },
    });
  } catch {
    return failure("network", "архів не відповів");
  }

  if (response.status === 404) {
    await response.body?.cancel().catch(() => {});
    return failure("not_found", "копії сторінки в архіві немає");
  }

  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    return failure("blocked", "архів обмежив частоту запитів, спробуйте пізніше");
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return failure("http_error", `архів відповів ${response.status}`);
  }

  const raw = await response.arrayBuffer();

  if (raw.byteLength > options.maxBytes) {
    return failure("http_error", "копія в архіві завелика");
  }

  const buffer = Buffer.from(raw);
  const html = buffer.subarray(0, 300_000).toString("utf8");

  if (looksLikeArchiveMiss(html)) {
    return failure("not_found", "копії сторінки в архіві немає");
  }

  const diagnosis = diagnose(response.status, html);

  if (diagnosis.problem !== null) {
    return failure(
      diagnosis.problem,
      `копія в архіві непридатна (${diagnosis.words} слів)`,
    );
  }

  return {
    buffer,
    finalUrl: url.href,
    charset: parseCharset(response.headers.get("content-type")),
    archivedAt: parseSnapshotDate(response.url),
    problem: null,
    detail: "",
  };
}
