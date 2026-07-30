import type { Buffer } from "node:buffer";
import type { ContentSource } from "@brief/shared";
import { AppError } from "../../http/errors";
import { fetchFromArchive, requestArchiveSnapshot } from "./archive";
import { fetchWithBrowser } from "./browser";
import { fetchDirect } from "./fetchHtml";
import { isWorthRetrying, type AccessProblem } from "./detect";
import { assertPublicHost, normalizeUrl } from "./url";

export interface AcquireOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  allowPrivateHosts: boolean;
  /** Ступінь 2 можна вимкнути — вона найдорожча. */
  browserEnabled: boolean;
  browserTimeoutMs: number;
  browserPath: string;
  browserSettleMs: number;
  /** Ступінь 3: читання наявної копії. */
  archiveEnabled: boolean;
  /** Ступінь 4: створення копії на вимогу. Повільна, тому остання. */
  archiveOnDemandEnabled: boolean;
  archiveSaveTimeoutMs: number;
}

export interface AcquiredPage {
  requestedUrl: string;
  finalUrl: string;
  /**
   * Байти лишаються байтами, щоб cheerio сам визначив кодування:
   * серед конкурентів досі трапляється windows-1251.
   * `charset` — значення з Content-Type, найнадійніше джерело кодування.
   * Браузер віддає вже декодований рядок.
   */
  body:
    | { kind: "buffer"; value: Buffer; charset: string | null }
    | { kind: "html"; value: string };
  source: ContentSource;
  archivedAt: string | null;
}

/** Крок каскаду, який не дав результату — для підсумкового повідомлення. */
interface Attempt {
  source: ContentSource;
  problem: AccessProblem;
  detail: string;
}

/**
 * Вердикт викликача про придатність контенту.
 *
 * Каскад не може судити про це сам: `diagnose` бачить лише сирий HTML, а там
 * у сторінки-лістингу тисячі слів у картках і меню. Заміряно: reddit пройшов
 * перевірку сирого HTML, а парсер дістав із нього 17 слів; tsn.ua — 1 слово.
 * Тому останнє слово за тим, хто справді розбирає сторінку.
 */
export type Acceptance<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

const SOURCE_LABEL: Record<ContentSource, string> = {
  direct: "прямий запит",
  browser: "браузер",
  archive: "архів",
};

/**
 * Отримує HTML сторінки, послідовно пробуючи стратегії, поки одна не дасть
 * придатний контент (розділ 6 ТЗ — доступ до сторінок конкурентів).
 *
 * Порядок не випадковий, а заміряний на вибірці з 8 захищених сайтів:
 *
 *   1. прямий запит   ~0.3 с   4/8   найшвидший і найввічливіший
 *   2. браузер        ~4 с     +2    JS-сайти та захист від автоматизації
 *   3. архів          ~2 с     +2    те, що не береться нічим іншим
 *
 * Разом стратегії покрили всі 8. Жодна з них поодинці не дала більше 6/8,
 * тому саме каскад, а не одна «найкраща» стратегія.
 */
export async function acquirePage<T>(
  rawUrl: string,
  options: AcquireOptions,
  accept: (page: AcquiredPage) => Acceptance<T>,
): Promise<T> {
  const url = normalizeUrl(rawUrl);
  assertPublicHost(url, options.allowPrivateHosts);

  const attempts: Attempt[] = [];

  /**
   * true, коли ми вже отримали найповніший рендер, на який здатні, а статті
   * в ньому просто немає. Тоді архів безглуздий: там буде та сама сторінка.
   * Без цієї перевірки лістинг витрачав ~40 с на створення копії, яка
   * все одно виявиться такою самою.
   */
  let bestRenderReached = false;

  /** Пропускає контент через перевірку викликача; при відмові — далі каскадом. */
  const tryAccept = (page: AcquiredPage): T | null => {
    const verdict = accept(page);

    if (verdict.ok) return verdict.value;

    attempts.push({
      source: page.source,
      problem: "thin",
      detail: verdict.reason,
    });
    return null;
  };

  // --- Ступінь 1: прямий запит ---
  const direct = await fetchDirect(url, {
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    userAgent: options.userAgent,
  });

  if (direct.buffer) {
    const accepted = tryAccept({
      requestedUrl: url.href,
      finalUrl: direct.finalUrl,
      body: { kind: "buffer", value: direct.buffer, charset: direct.charset },
      source: "direct",
      archivedAt: null,
    });
    if (accepted) return accepted;

    // Без браузера прямий запит і є найповніший рендер.
    if (!options.browserEnabled) bestRenderReached = true;
  } else {
    const problem = direct.problem ?? "http_error";
    attempts.push({ source: "direct", problem, detail: direct.detail });

    // Не HTML — жодна наступна стратегія цього не змінить.
    if (!isWorthRetrying(problem)) throw toError(attempts, url.href);
  }

  const directWasMissing = direct.problem === "not_found";

  // --- Ступінь 2: справжній браузер ---
  // На 404 браузер піде за тією ж адресою й отримає той самий 404.
  if (options.browserEnabled && !directWasMissing) {
    const viaBrowser = await fetchWithBrowser(url, {
      timeoutMs: options.browserTimeoutMs,
      executablePath: options.browserPath,
      settleMs: options.browserSettleMs,
    });

    if (viaBrowser.html) {
      const accepted = tryAccept({
        requestedUrl: url.href,
        finalUrl: viaBrowser.finalUrl,
        body: { kind: "html", value: viaBrowser.html },
        source: "browser",
        archivedAt: null,
      });
      if (accepted) return accepted;

      // Браузер віддав сторінку повністю, а статті в ній немає.
      bestRenderReached = true;
    } else {
      attempts.push({
        source: "browser",
        problem: viaBrowser.problem ?? "http_error",
        detail: viaBrowser.detail,
      });
    }
  }

  // Сторінка доступна, просто це не стаття — далі каскадом іти нікуди.
  if (bestRenderReached) throw toError(attempts, url.href);

  // --- Ступінь 3: наявна копія в архіві ---
  if (options.archiveEnabled) {
    const archived = await fetchFromArchive(url, {
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
    });

    if (archived.buffer) {
      const accepted = tryAccept({
        requestedUrl: url.href,
        finalUrl: archived.finalUrl,
        body: { kind: "buffer", value: archived.buffer, charset: archived.charset },
        source: "archive",
        archivedAt: archived.archivedAt,
      });
      if (accepted) return accepted;
    } else {
      attempts.push({
        source: "archive",
        problem: archived.problem ?? "http_error",
        detail: archived.detail,
      });
    }
  }

  // --- Ступінь 4: попросити архів створити копію зараз ---
  // Найповільніша (~20–30 с) і звертається до безкоштовного публічного
  // сервісу, тому лише коли не лишилось інших варіантів.
  if (options.archiveOnDemandEnabled) {
    const fresh = await requestArchiveSnapshot(url, {
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      saveTimeoutMs: options.archiveSaveTimeoutMs,
    });

    if (fresh.buffer) {
      const accepted = tryAccept({
        requestedUrl: url.href,
        finalUrl: fresh.finalUrl,
        body: { kind: "buffer", value: fresh.buffer, charset: fresh.charset },
        source: "archive",
        archivedAt: fresh.archivedAt,
      });
      if (accepted) return accepted;
    } else {
      attempts.push({
        source: "archive",
        problem: fresh.problem ?? "http_error",
        detail: `створення копії — ${fresh.detail}`,
      });
    }
  }

  throw toError(attempts, url.href);
}

/**
 * Одна помилка з переліком усіх спроб. Користувачеві потрібно бачити,
 * що зробив сервіс, а не лише «403».
 */
function toError(attempts: readonly Attempt[], url: string): AppError {
  const summary = attempts
    .map((attempt) => `${SOURCE_LABEL[attempt.source]} — ${attempt.detail}`)
    .join("; ");

  const first = attempts[0]?.problem;

  if (first === "not_html") {
    return new AppError("not_html", attempts[0]?.detail ?? `не HTML: ${url}`);
  }

  // Контент дістався, але статті в ньому немає — типово для сторінок-лістингів
  // і головних. Це інша проблема, ніж блокування, і порада тут інша.
  if (attempts.length > 0 && attempts.every((a) => a.problem === "thin")) {
    return new AppError(
      "no_article_content",
      `На сторінці немає суцільного тексту статті — схоже, це лістинг ` +
        `або головна. Вкажіть URL конкретної статті. Спроби: ${summary}`,
      422,
    );
  }

  if (attempts.some((a) => a.problem === "blocked")) {
    return new AppError(
      "access_blocked",
      `Сайт закритий від автоматичного доступу. Спроби: ${summary}`,
      502,
    );
  }

  if (attempts.every((attempt) => attempt.problem === "not_found")) {
    return new AppError("not_found", `Сторінку не знайдено: ${url}`, 404);
  }

  return new AppError(
    "fetch_failed",
    `Не вдалося отримати сторінку. Спроби: ${summary}`,
    502,
  );
}
