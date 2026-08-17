import { Buffer } from "node:buffer";
import { buildReaderHtml } from "./markdown";
import { diagnose, type AccessProblem } from "./detect";

/**
 * Платна ступінь каскаду за ключем самого користувача: Firecrawl.
 *
 * Робить те саме, що ступінь 7 (зовнішній API рендерингу): відкриває сторінку
 * своїм браузером із своєї резидентної адреси й віддає готовий текст одним
 * запитом. Тобто це і зміна IP, і рендеринг JS, і обхід челенджу разом — рівно
 * ті сайти, які не беруться ні нашим браузером, ні нашим проксі, ні сервісом
 * читання.
 *
 * Різниця з ступенем 7 не в можливостях, а в тому, чий рахунок: там ключ
 * серверний і за всіх користувачів платить власник сервера, тут ключ належить
 * акаунту (таблиця user_fetch_keys). Тому ця ступінь іде першою з двох —
 * витрачати чужі кредити раніше за власні неправильно.
 *
 * Заміряно на двох сторінках, де прямий запит віддає 403 (числа — вже після
 * парсера, тобто те, що справді пішло б до AI):
 *   forbes.com/advisor/…/what-is-crm     3684 слова, 23 H, 5 FAQ, 1 кредит
 *   trustpilot.com/review/www.amazon.com 2379 слів, 25 H, 1 кредит
 * Свіжий скрейп forbes — 5.1 с, копія з кешу сервісу — 1 с.
 *
 * Порожній ключ — ступінь просто не виконується, і це нормальний стан: без
 * жодного платного ключа каскад обходиться безкоштовними ступенями й архівом.
 *
 * Сервіс не завжди справний і на частині сторінок віддає `500 An unexpected
 * error occurred` — заміряно, після 12–36 с. Каскад це не ламає: 5xx стає
 * `http_error`, і наступні ступені працюють як завжди.
 */

const SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const CREDITS_ENDPOINT = "https://api.firecrawl.dev/v2/team/credit-usage";

/**
 * Наскільки старою може бути копія в кеші сервісу, щоб її прийняти.
 *
 * Це дефолт сервісу (дві доби), заданий явно — щоб із коду було видно, що кеш
 * тут узагалі є, і що він не наш: заміряно, перший у житті запит на сторінку
 * повернувся з `cacheState: "hit"` і копією віком 19 годин, бо кеш спільний для
 * всіх клієнтів сервісу.
 *
 * Спроба зробити свіжіше вийшла гіршою, і це теж заміряно. З `maxAge` в годину
 * на trustpilot.com замість 2599 слів приходить заслонка на 23: сторінка
 * закрита челенджем, і сервіс бере її не завжди. Причина видна в метаданих —
 * ключ кешу враховує режим проксі, тому годинне вікно не побачило успішної
 * копії, знятої `basic`, піднялося до `stealth` і влучило в **закешовану
 * невдачу** попередньої такої ж спроби. Тобто сервіс кешує не лише успіхи, і
 * коротке вікно тут не свіжість, а зайвий шанс наступити на власну невдачу.
 *
 * Нуль не годиться з тієї ж причини й ще однієї: він вимикає кеш цілком, а
 * сервіс попереджає, що такий запит і довший, і частіше падає — на шостій
 * ступені каскаду, з уже підточеним бюджетом часу, це найгірший з обмінів.
 *
 * Дві доби не конфліктують із тим, що застаріла копія в каскаді стоїть останньою
 * й показує свою дату: там ідеться про архів, а його копії бувають місячної й
 * річної давнини. Стаття конкурента за дві доби — та сама стаття.
 *
 * На ціну не впливає: кредит списується однаково, і за влучання в кеш теж.
 */
const MAX_AGE_MS = 172_800_000;

export interface FirecrawlFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Ключ користувача. Порожньо — ступінь вимкнена. */
  apiKey: string;
}

export interface FirecrawlFetchResult {
  html: string | null;
  finalUrl: string;
  problem: AccessProblem | null;
  detail: string;
}

/** Відповідь сервісу. Перевіряється вручну — потрібні лише кілька полів. */
interface ScrapePayload {
  success?: unknown;
  error?: unknown;
  markdown?: unknown;
  data?: {
    markdown?: unknown;
    metadata?: {
      title?: unknown;
      description?: unknown;
      language?: unknown;
      /** Адреса після редиректів. */
      url?: unknown;
      sourceURL?: unknown;
      /** Код, який віддав сам сайт, — не код відповіді сервісу. */
      statusCode?: unknown;
      creditsUsed?: unknown;
    };
  };
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Повідомлення сервісу буває довгим — у помилку йде лише суть. */
function serviceMessage(payload: ScrapePayload): string {
  const raw = asText(payload.error);
  return raw ? raw.replace(/\s+/g, " ").slice(0, 120) : "";
}

export async function fetchWithFirecrawl(
  url: URL,
  options: FirecrawlFetchOptions,
): Promise<FirecrawlFetchResult> {
  const failure = (
    problem: AccessProblem,
    detail: string,
  ): FirecrawlFetchResult => ({
    html: null,
    finalUrl: url.href,
    problem,
    detail,
  });

  let response: Response;

  try {
    response = await fetch(SCRAPE_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: url.href,
        // Markdown, а не HTML: у ньому вже немає ні меню, ні банерів, ні
        // скриптів — рівно того, що parser/clean.ts інакше вирізав би сам, —
        // а метадані сервіс віддає окремими полями. Далі markdown повертається
        // в HTML (markdown.ts), бо весь пайплайн нижче працює з розміткою.
        formats: ["markdown"],
        onlyMainContent: true,
        maxAge: MAX_AGE_MS,
        // Хай сервіс здасться раніше, ніж обірве зʼєднання наш таймаут: тоді
        // ми отримаємо його пояснення, а не безлике «не відповів».
        timeout: Math.max(5000, options.timeoutMs - 2000),
        // Стратегія проксі не задається навмисно: дефолт `auto` сам вирішує,
        // коли підняти запит до посиленої адреси, і після зміни тарифів це
        // коштує той самий один кредит.
      }),
    });
  } catch {
    return failure(
      "network",
      `Firecrawl не відповів за ${Math.round(options.timeoutMs / 1000)} с`,
    );
  }

  const raw = await response.arrayBuffer();

  if (raw.byteLength > options.maxBytes) {
    return failure("http_error", "відповідь Firecrawl завелика");
  }

  let payload: ScrapePayload;
  try {
    payload = JSON.parse(Buffer.from(raw).toString("utf8")) as ScrapePayload;
  } catch {
    return failure("http_error", `Firecrawl відповів ${response.status}`);
  }

  if (!response.ok || payload.success === false) {
    const message = serviceMessage(payload);

    // Ключ користувача, а не сервера, тому формулювання мають вести саме до
    // його налаштувань: інакше він шукатиме проблему в чужому сайті.
    if (response.status === 401 || response.status === 403) {
      return failure(
        "blocked",
        `ключ Firecrawl не приймається${message ? ` — ${message}` : ""}`,
      );
    }

    if (response.status === 402) {
      return failure("blocked", "на ключі Firecrawl закінчилися кредити");
    }

    if (response.status === 429) {
      return failure("blocked", "Firecrawl обмежив частоту запитів");
    }

    return failure(
      response.status >= 500 ? "http_error" : "blocked",
      `Firecrawl відповів ${response.status}${message ? ` — ${message}` : ""}`,
    );
  }

  const metadata = payload.data?.metadata ?? {};
  const markdown = asText(payload.data?.markdown) ?? asText(payload.markdown);

  if (!markdown) {
    return failure("thin", "Firecrawl не знайшов на сторінці тексту");
  }

  const html = buildReaderHtml({
    title: asText(metadata.title),
    description: asText(metadata.description),
    canonical: asText(metadata.url) ?? asText(metadata.sourceURL),
    lang: asText(metadata.language),
    markdown,
  });

  /**
   * Код сайту, а не сервісу. Це важливо: сервіс вважає роботу успішною, навіть
   * коли сайт його не пустив, — заміряно, HTTP 200 і `success: true`, а в
   * `statusCode` 403, а в тексті «Verifying your connection…». Без цієї
   * перевірки шість слів заслонки пішли б до AI як контент конкурента, ще й
   * обірвавши каскад на ступені, яка нічого не дала.
   */
  const status =
    typeof metadata.statusCode === "number" ? metadata.statusCode : 200;

  const diagnosis = diagnose(status, html);

  if (diagnosis.problem !== null) {
    return failure(
      diagnosis.problem,
      `Firecrawl віддав ${diagnosis.words} слів${
        diagnosis.title ? ` («${diagnosis.title}»)` : ""
      }${status >= 400 ? `, сайт відповів ${status}` : ""}`,
    );
  }

  return {
    html,
    // Сторінку читав сервіс, і його редиректи нам не видні: найточніше, що ми
    // знаємо про кінцеву адресу, — та, яку він назвав сам.
    finalUrl: asText(metadata.url) ?? asText(metadata.sourceURL) ?? url.href,
    problem: null,
    detail: "",
  };
}

/* ── Перевірка ключа ──────────────────────────────────────────────────────── */

export interface FirecrawlCredits {
  remainingCredits: number | null;
  planCredits: number | null;
  periodEnd: string | null;
}

interface CreditsPayload {
  success?: unknown;
  error?: unknown;
  data?: {
    remainingCredits?: unknown;
    planCredits?: unknown;
    billingPeriodEnd?: unknown;
  };
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Залишок кредитів за ключем. Використовується двічі: як перевірка щойно
 * введеного ключа перед збереженням і як показник стану рахунку в
 * налаштуваннях.
 *
 * Саме цей запит, а не пробний scrape: він безкоштовний і не витрачає кредит
 * лише на те, щоб дізнатися, чи ключ узагалі робочий. Кидає `Error` — рішення,
 * як показати причину, лишається за викликачем.
 */
export async function fetchFirecrawlCredits(
  apiKey: string,
  timeoutMs: number,
): Promise<FirecrawlCredits> {
  let response: Response;

  try {
    response = await fetch(CREDITS_ENDPOINT, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new Error(`Firecrawl не відповів за ${Math.round(timeoutMs / 1000)} с`);
  }

  let payload: CreditsPayload;
  try {
    payload = (await response.json()) as CreditsPayload;
  } catch {
    throw new Error(`Firecrawl відповів ${response.status} без даних`);
  }

  if (!response.ok || payload.success === false) {
    const message = asText(payload.error);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Firecrawl не приймає цей ключ${message ? ` — ${message}` : ""}`,
      );
    }

    throw new Error(
      `Firecrawl відповів ${response.status}${message ? ` — ${message}` : ""}`,
    );
  }

  return {
    remainingCredits: asCount(payload.data?.remainingCredits),
    planCredits: asCount(payload.data?.planCredits),
    periodEnd: asText(payload.data?.billingPeriodEnd),
  };
}
