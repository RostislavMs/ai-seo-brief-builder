import type { Buffer } from "node:buffer";
import type { ContentSource } from "@brief/shared";
import { AppError } from "../../http/errors";
import { fetchFromArchive, requestArchiveSnapshot } from "./archive";
import { fetchWithBrowser } from "./browser";
import { fetchDirect } from "./fetchHtml";
import { isWorthRetrying, type AccessProblem } from "./detect";
import { getProxy } from "./proxy";
import { fetchWithReader } from "./reader";
import { fetchWithScraper } from "./scraper";
import { assertPublicHost, normalizeUrl } from "./url";

export interface AcquireOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  allowPrivateHosts: boolean;
  /**
   * Стеля часу на весь каскад для однієї сторінки.
   *
   * Ступеней багато, і сума їхніх таймаутів давно перевищує будь-яке розумне
   * очікування — а на serverless ще й ліміт тривалості функції, після якого
   * користувач не отримує навіть повідомлення про причину. Тому час спільний:
   * кожна наступна ступінь бере не більше, ніж лишилося.
   */
  budgetMs: number;
  /** Ступінь 2 можна вимкнути — вона найдорожча. */
  browserEnabled: boolean;
  browserTimeoutMs: number;
  browserPath: string;
  browserSettleMs: number;
  /** Ступінь 3: зовнішній сервіс читання. Безкоштовний, з лімітом частоти. */
  readerEnabled: boolean;
  readerTimeoutMs: number;
  /** Ключ сервісу читання: знімає ліміт частоти й відкриває його проксі. */
  readerKey: string;
  /**
   * Ступінь 4: той самий запит з іншого IP. Порожньо — вимкнено.
   * Трафік платний, тому ступінь запускається лише після безкоштовних.
   */
  proxyUrl: string;
  proxyTimeoutMs: number;
  /** Ступінь 6: зовнішній API рендерингу. Шаблон із {url}; порожньо — вимкнено. */
  scraperUrl: string;
  scraperKey: string;
  scraperTimeoutMs: number;
  /** Ступінь 8: читання наявної копії. */
  archiveEnabled: boolean;
  /** Ступінь 9: створення копії на вимогу. Повільна, тому остання. */
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
  reader: "сервіс читання",
  proxy: "проксі",
  scraper: "API рендерингу",
  archive: "архів",
};

/**
 * Менше цього ступінь не отримує: за одну-дві секунди не встигає навіть
 * рукостискання TLS, тому обрізана спроба лише псує повідомлення про помилку
 * рядком «не відповів», за яким користувач шукатиме проблему в чужому сайті.
 */
const MIN_STAGE_MS = 3000;

/**
 * Чи може зміна IP виправити саме цю проблему.
 *
 * `thin` не може: сервер віддав повний HTML, просто контент домальовує
 * JavaScript — з іншого IP прийде той самий каркас. `not_found` теж:
 * сторінки немає ні для кого. А от 403, 429 і обриви з'єднання майже завжди
 * стосуються діапазону, а не запиту.
 */
function ipMightHelp(problem: AccessProblem | null): boolean {
  return problem === "blocked" || problem === "http_error" || problem === "network";
}

/**
 * Отримує HTML сторінки, послідовно пробуючи стратегії, поки одна не дасть
 * придатний контент (розділ 6 ТЗ — доступ до сторінок конкурентів).
 *
 * Порядок — від безкоштовного й швидкого до платного й повільного, а застаріла
 * копія з архіву стоїть після всього: вона майже завжди щось віддає, і якби
 * стояла раніше, каскад закінчувався б на ній, не пробуючи свіжий контент.
 *
 *   БЕЗКОШТОВНО
 *     1. прямий запит        ~0.3 с   найшвидший і найввічливіший
 *     2. власний браузер     ~2–7 с   JS-сайти та захист від автоматизації
 *     3. сервіс читання      ~1–7 с   чужий браузер із чужих адрес
 *   ПЛАТНО (лише якщо налаштовано)
 *     4. прямий через проксі ~2 с     блокування за діапазоном IP
 *     5. браузер через проксі ~6 с    челендж + чужа адреса
 *     6. API рендерингу      ~5–10 с  чужий браузер із чужої резидентної адреси
 *     7. сервіс читання з його проксі — те саме, але їхніми адресами
 *   РЕЗЕРВ
 *     8. наявна копія в архіві ~2 с   те, що не береться нічим іншим
 *     9. копія на вимогу     ~20–40 с коли копії ще не існує
 *
 * Заміряно на вибірці з 8 захищених сайтів: жодна стратегія поодинці не дала
 * більше 6/8, а безкоштовні ступені 1–3 разом покрили 6/8 — рівно ті сторінки,
 * за які раніше платив проксі або віддавав застарілу копію архів.
 *
 * Ступені 4–7 упорядковані за заміряною результативністю, а не за ціною: на
 * шести сторінках із гейтом Turnstile ступінь 6 узяла чотири, а 4, 5 і 7 —
 * жодної. Дешевші спроби все одно стоять раніше, бо вони швидші, але з двох
 * платних першою йде та, що справді відкриває сторінки.
 */
export async function acquirePage<T>(
  rawUrl: string,
  options: AcquireOptions,
  accept: (page: AcquiredPage) => Acceptance<T>,
): Promise<T> {
  const url = normalizeUrl(rawUrl);
  assertPublicHost(url, options.allowPrivateHosts);

  const attempts: Attempt[] = [];
  const startedAt = Date.now();

  /** Скільки часу дати ступені; null — бюджет вичерпано, ступінь пропускаємо. */
  let ranOutOfTime = false;
  const slice = (stageMs: number): number | null => {
    const left = options.budgetMs - (Date.now() - startedAt);

    if (left < MIN_STAGE_MS) {
      ranOutOfTime = true;
      return null;
    }

    return Math.min(stageMs, left);
  };

  /**
   * true, коли ми вже отримали найповніший рендер, на який здатні, а статті
   * в ньому просто немає. Тоді решта каскаду безглузда: і чужий браузер, і
   * архів побачать ту саму сторінку. Без цієї перевірки лістинг витрачав
   * ~40 с на створення копії, яка все одно виявиться такою самою.
   */
  let bestRenderReached = false;

  /** Сервіс читання недоступний як такий — його друга ступінь безглузда. */
  let readerUnreachable = false;

  /** Пропускає контент через перевірку викликача; при відмові — далі каскадом. */
  const tryAccept = (page: AcquiredPage): T | null => {
    const verdict = accept(page);

    if (verdict.ok) {
      logOutcome(url.href, page.source, attempts);
      return verdict.value;
    }

    attempts.push({
      source: page.source,
      problem: "thin",
      detail: verdict.reason,
    });
    return null;
  };

  const fail = (source: ContentSource, problem: AccessProblem, detail: string) => {
    attempts.push({ source, problem, detail });
  };

  /** Чи бачив каскад проблему, яку може виправити саме інша адреса. */
  const sawAccessProblem = (): boolean =>
    attempts.some((attempt) => ipMightHelp(attempt.problem));

  // ═══ БЕЗКОШТОВНО ═══

  // --- Ступінь 1: прямий запит ---
  const directBudget = slice(options.timeoutMs);
  const direct = directBudget
    ? await fetchDirect(url, {
        timeoutMs: directBudget,
        maxBytes: options.maxBytes,
        userAgent: options.userAgent,
      })
    : null;

  if (direct?.buffer) {
    const accepted = tryAccept({
      requestedUrl: url.href,
      finalUrl: direct.finalUrl,
      body: { kind: "buffer", value: direct.buffer, charset: direct.charset },
      source: "direct",
      archivedAt: null,
    });
    if (accepted) return accepted;

    // Коли рендерити сторінку нікому, прямий запит і є найповніший рендер.
    if (!options.browserEnabled && !options.readerEnabled) {
      bestRenderReached = true;
    }
  } else if (direct) {
    const problem = direct.problem ?? "http_error";
    fail("direct", problem, direct.detail);

    // Не HTML — жодна наступна стратегія цього не змінить.
    if (!isWorthRetrying(problem)) throw toError(attempts, url.href, ranOutOfTime);
  }

  /** Сторінки немає ні для кого — наступним ступеням шукати нічого. */
  let pageMissing = direct?.problem === "not_found";

  // --- Ступінь 2: справжній браузер ---
  // На 404 браузер піде за тією ж адресою й отримає той самий 404.
  if (options.browserEnabled && !pageMissing && !bestRenderReached) {
    const budget = slice(options.browserTimeoutMs);

    if (budget) {
      const viaBrowser = await fetchWithBrowser(url, {
        timeoutMs: budget,
        executablePath: options.browserPath,
        settleMs: Math.min(options.browserSettleMs, budget),
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
        fail("browser", viaBrowser.problem ?? "http_error", viaBrowser.detail);
      }
    }
  }

  // --- Ступінь 3: зовнішній сервіс читання ---
  //
  // Чужий браузер із чужих адрес, і для нас це один HTTP-запит. Саме ця
  // ступінь закриває сайти, де наш власний браузер отримує челендж, а на
  // serverless вона взагалі єдина, хто вміє рендерити JS.
  if (options.readerEnabled && !pageMissing && !bestRenderReached) {
    const budget = slice(options.readerTimeoutMs);

    if (budget) {
      const viaReader = await fetchWithReader(url, {
        timeoutMs: budget,
        maxBytes: options.maxBytes,
        apiKey: options.readerKey,
        useProxy: false,
      });

      if (viaReader.html) {
        const accepted = tryAccept({
          requestedUrl: url.href,
          finalUrl: viaReader.finalUrl,
          body: { kind: "html", value: viaReader.html },
          source: "reader",
          archivedAt: null,
        });
        if (accepted) return accepted;
      } else {
        const problem = viaReader.problem ?? "http_error";
        fail("reader", problem, viaReader.detail);

        // Сервіс не відповів або відмовив нам як клієнту — ступінь 7 звертається
        // до нього ж, тому вона теж не відповість. Заміряно: коли сервіс під
        // навантаженням тримає зʼєднання до таймауту, ці дві ступені з'їдали
        // 60 с бюджету на один і той самий безнадійний виклик.
        if (problem === "network" || problem === "http_error") readerUnreachable = true;
      }
    }
  }

  // Сторінка доступна, просто це не стаття — далі каскадом іти нікуди.
  if (bestRenderReached) throw toError(attempts, url.href, ranOutOfTime);

  // ═══ ПЛАТНО ═══
  //
  // Усе нижче витрачає гроші: гігабайти резидентного трафіку або кредити
  // чужого сервісу. Тому кожна ступінь тут ще й перевіряє, чи справді її
  // інструмент відповідає проблемі, яку ми бачили вище.

  // --- Ступінь 4: той самий запит з іншого IP ---
  //
  // WAF закриває діапазони дата-центрів цілком, тому резидентний IP знімає
  // блокування без браузера й без архіву.
  if (!pageMissing && sawAccessProblem()) {
    const state = await getProxy(options.proxyUrl);

    if (state.kind === "broken") {
      // Проксі заданий, але непридатний. Тиха відмова тут найгірша: користувач
      // платить за трафік і не розуміє, чому сайти й далі блокують.
      fail("proxy", "network", `не налаштований: ${state.reason}`);
    } else if (state.kind === "ready") {
      const budget = slice(options.proxyTimeoutMs);

      if (budget) {
        const viaProxy = await fetchDirect(url, {
          timeoutMs: budget,
          maxBytes: options.maxBytes,
          userAgent: options.userAgent,
          dispatcher: state.proxy.dispatcher,
        });

        if (viaProxy.buffer) {
          const accepted = tryAccept({
            requestedUrl: url.href,
            finalUrl: viaProxy.finalUrl,
            body: {
              kind: "buffer",
              value: viaProxy.buffer,
              charset: viaProxy.charset,
            },
            source: "proxy",
            archivedAt: null,
          });
          if (accepted) return accepted;
        } else {
          const problem = viaProxy.problem ?? "http_error";

          fail(
            "proxy",
            problem,
            // Обрив на цьому шляху найчастіше означає сам шлюз, а не сайт,
            // тому називаємо його: інакше повідомлення звинувачує чужий хост.
            problem === "network"
              ? `${viaProxy.detail} (шлюз ${state.proxy.label})`
              : viaProxy.detail,
          );

          // Буває, що з нашого IP сайт віддає 403, а з чужого — чесний 404.
          if (problem === "not_found") pageMissing = true;
          if (!isWorthRetrying(problem)) {
            throw toError(attempts, url.href, ranOutOfTime);
          }
        }
      }
    }
  }

  // --- Ступінь 5: браузер через проксі ---
  //
  // Найдорожча спроба з наших власних: браузер тягне через платний трафік ще
  // й скрипти зі стилями. Тому лише проти челенджу — там, де потрібні
  // одночасно й виконання JavaScript, і чужа адреса.
  //
  // Власна адреса для челенджу краща за спільну проксі-адресу (ступінь 2 йде
  // саме з неї): челендж вірить спільному IP менше. Тому ця ступінь має сенс
  // тільки після того, як власна адреса вже не спрацювала.
  if (
    options.browserEnabled &&
    !pageMissing &&
    attempts.some((attempt) => attempt.problem === "blocked")
  ) {
    const state = await getProxy(options.proxyUrl);
    const budget = state.kind === "ready" ? slice(options.browserTimeoutMs) : null;

    if (state.kind === "ready" && budget) {
      const viaBrowser = await fetchWithBrowser(url, {
        timeoutMs: budget,
        executablePath: options.browserPath,
        settleMs: Math.min(options.browserSettleMs, budget),
        proxy: state.proxy.browser,
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

        bestRenderReached = true;
      } else {
        fail(
          "browser",
          viaBrowser.problem ?? "http_error",
          `через проксі — ${viaBrowser.detail}`,
        );
      }
    }
  }

  // --- Ступінь 6: зовнішній API рендерингу ---
  //
  // Єдина ступінь, що дає одночасно й резидентну адресу, й рендеринг, і обхід
  // челенджу, тому працює проти будь-якої проблеми — включно з `thin`, бо
  // рендеринг тут теж чужий.
  //
  // Стоїть перед ступенем 7, хоч обидві платні, і це заміряно: на шести
  // захищених сторінках цей API узяв чотири за 5–10 с, а читання резидентними
  // адресами сервісу — жодної, витрачаючи по 30 с. Коли API спрацював,
  // за ступінь 7 ми взагалі не платимо.
  if (options.scraperUrl && !pageMissing && !bestRenderReached) {
    const budget = slice(options.scraperTimeoutMs);

    if (budget) {
      const viaScraper = await fetchWithScraper(url, {
        timeoutMs: budget,
        maxBytes: options.maxBytes,
        userAgent: options.userAgent,
        urlTemplate: options.scraperUrl,
        apiKey: options.scraperKey,
      });

      if (viaScraper.buffer) {
        const accepted = tryAccept({
          requestedUrl: url.href,
          finalUrl: viaScraper.finalUrl,
          body: {
            kind: "buffer",
            value: viaScraper.buffer,
            charset: viaScraper.charset,
          },
          source: "scraper",
          archivedAt: null,
        });
        if (accepted) return accepted;
      } else {
        fail("scraper", viaScraper.problem ?? "http_error", viaScraper.detail);
      }
    }
  }

  // --- Ступінь 7: сервіс читання його ж резидентними адресами ---
  // Платна можливість сервісу, тому лише з ключем і лише проти блокування.
  if (
    options.readerEnabled &&
    options.readerKey &&
    !readerUnreachable &&
    !pageMissing &&
    !bestRenderReached &&
    sawAccessProblem()
  ) {
    const budget = slice(options.readerTimeoutMs);

    if (budget) {
      const viaReader = await fetchWithReader(url, {
        timeoutMs: budget,
        maxBytes: options.maxBytes,
        apiKey: options.readerKey,
        useProxy: true,
      });

      if (viaReader.html) {
        const accepted = tryAccept({
          requestedUrl: url.href,
          finalUrl: viaReader.finalUrl,
          body: { kind: "html", value: viaReader.html },
          source: "reader",
          archivedAt: null,
        });
        if (accepted) return accepted;
      } else {
        fail(
          "reader",
          viaReader.problem ?? "http_error",
          `через проксі сервісу — ${viaReader.detail}`,
        );
      }
    }
  }

  if (bestRenderReached) throw toError(attempts, url.href, ranOutOfTime);

  // ═══ РЕЗЕРВ ═══

  // --- Ступінь 8: наявна копія в архіві ---
  if (options.archiveEnabled) {
    const budget = slice(options.timeoutMs);

    if (budget) {
      const archived = await fetchFromArchive(url, {
        timeoutMs: budget,
        maxBytes: options.maxBytes,
      });

      if (archived.buffer) {
        const accepted = tryAccept({
          requestedUrl: url.href,
          finalUrl: archived.finalUrl,
          body: {
            kind: "buffer",
            value: archived.buffer,
            charset: archived.charset,
          },
          source: "archive",
          archivedAt: archived.archivedAt,
        });
        if (accepted) return accepted;
      } else {
        fail("archive", archived.problem ?? "http_error", archived.detail);
      }
    }
  }

  // --- Ступінь 9: попросити архів створити копію зараз ---
  // Найповільніша (~20–40 с) і звертається до безкоштовного публічного
  // сервісу, тому лише коли не лишилось інших варіантів.
  if (options.archiveOnDemandEnabled) {
    const budget = slice(options.archiveSaveTimeoutMs);

    if (budget) {
      // Ступінь робить два запити — створення копії й читання створеного, —
      // тому залишок бюджету треба поділити між ними, інакше сама лише пауза
      // на створення зʼїла б його цілком.
      const readMs = Math.min(options.timeoutMs, Math.ceil(budget / 3));

      const fresh = await requestArchiveSnapshot(url, {
        timeoutMs: readMs,
        maxBytes: options.maxBytes,
        saveTimeoutMs: budget - readMs,
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
        fail("archive", fresh.problem ?? "http_error", `створення копії — ${fresh.detail}`);
      }
    }
  }

  throw toError(attempts, url.href, ranOutOfTime);
}

/**
 * Пише в лог, чим закінчився каскад, якщо якась ступінь відмовила.
 *
 * Без цього діагностика зникає саме там, де вона найпотрібніша: перелік спроб
 * потрапляє лише в текст помилки, тому коли пізніша ступінь усе-таки дала
 * результат, причина відмови попередніх нікуди не пишеться. А питання
 * «чому знову архів, я ж підключив проксі» відповіді потребує щоразу.
 */
function logOutcome(
  url: string,
  winner: ContentSource,
  attempts: readonly Attempt[],
): void {
  if (attempts.length === 0) return;

  console.warn(
    `[fetch] ${url} → ${SOURCE_LABEL[winner]}; до того: ${summarize(attempts)}`,
  );
}

function summarize(attempts: readonly Attempt[]): string {
  return attempts
    .map((attempt) => `${SOURCE_LABEL[attempt.source]} — ${attempt.detail}`)
    .join("; ");
}

/**
 * Одна помилка з переліком усіх спроб. Користувачеві потрібно бачити,
 * що зробив сервіс, а не лише «403».
 */
function toError(
  attempts: readonly Attempt[],
  url: string,
  ranOutOfTime: boolean,
): AppError {
  // Обрізаний каскад і каскад, що дійшов до кінця, — різні історії, і порада
  // в них різна: у першому випадку сторінку варто просто спробувати ще раз.
  const summary =
    summarize(attempts) + (ranOutOfTime ? "; далі не пробували — вичерпано час" : "");

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

  if (
    attempts.length > 0 &&
    attempts.every((attempt) => attempt.problem === "not_found")
  ) {
    return new AppError("not_found", `Сторінку не знайдено: ${url}`, 404);
  }

  return new AppError(
    "fetch_failed",
    `Не вдалося отримати сторінку. Спроби: ${summary}`,
    502,
  );
}
