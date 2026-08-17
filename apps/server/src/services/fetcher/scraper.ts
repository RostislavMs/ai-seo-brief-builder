import type { Buffer } from "node:buffer";
import { fetchDirect } from "./fetchHtml";
import type { AccessProblem } from "./detect";

/**
 * Ступінь 7 каскаду: зовнішній API рендерингу спільним серверним ключем.
 *
 * Це те, чим торгують ScraperAPI, ScrapingBee, ZenRows і подібні: сторінку
 * відкриває їхній браузер із їхньої резидентної адреси, а нам віддає готовий
 * HTML. Тобто це і зміна IP, і рендеринг JS, і обхід челенджу в одному запиті —
 * рівно ті сайти, які не беруться ні нашим браузером, ні нашим проксі.
 *
 * Те саме робить ступінь 6 (firecrawl.ts), і вона стоїть раніше — там ключ
 * належить користувачеві. Ця ступінь працює спільним ключем сервера, тому
 * дістається тим, хто власного не додавав.
 *
 * Провайдер не зашитий: у кожного свій формат адреси, а різниця між ними —
 * лише порядок параметрів. Тому налаштування — шаблон URL із двома
 * підстановками, `{url}` і `{key}`:
 *
 *   https://api.scraperapi.com/?api_key={key}&render=true&url={url}
 *   https://app.scrapingbee.com/api/v1/?api_key={key}&render_js=true&url={url}
 *   https://api.zenrows.com/v1/?apikey={key}&js_render=true&url={url}
 *
 * Вимога одна: сервіс має віддавати HTML сторінки як тіло відповіді, а не
 * JSON із полем. Провайдери з JSON-відповіддю тут не працюють — для них
 * ступінь просто не задають.
 *
 * Запит платний і тарифікується покредитно, тому ступінь стоїть після всього
 * безкоштовного й після власного проксі.
 */

export interface ScraperFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  /** Шаблон адреси з {url}. Порожньо — ступінь вимкнена. */
  urlTemplate: string;
  /** Значення для {key}. Порожньо, якщо ключ уже вписаний у шаблон. */
  apiKey: string;
}

export interface ScraperFetchResult {
  buffer: Buffer | null;
  charset: string | null;
  finalUrl: string;
  problem: AccessProblem | null;
  detail: string;
}

/** Хост сервісу — усе, що можна писати в логи та помилки без ключа в них. */
function serviceLabel(template: string): string {
  try {
    return new URL(template.replace(/\{key\}/g, "x").replace(/\{url\}/g, "x"))
      .hostname;
  } catch {
    return "сервіс рендерингу";
  }
}

export async function fetchWithScraper(
  url: URL,
  options: ScraperFetchOptions,
): Promise<ScraperFetchResult> {
  const failure = (problem: AccessProblem, detail: string): ScraperFetchResult => ({
    buffer: null,
    charset: null,
    finalUrl: url.href,
    problem,
    detail,
  });

  // Шаблон без {url} — найпоширеніша помилка налаштування, і мовчати про неї
  // не можна: користувач платить за сервіс, який ніколи не викликається.
  if (!options.urlTemplate.includes("{url}")) {
    return failure("network", "у шаблоні NITRO_SCRAPER_URL немає {url}");
  }

  const endpoint = options.urlTemplate
    .replace(/\{key\}/g, encodeURIComponent(options.apiKey))
    .replace(/\{url\}/g, encodeURIComponent(url.href));

  let target: URL;
  try {
    target = new URL(endpoint);
  } catch {
    return failure("network", "NITRO_SCRAPER_URL не є коректною адресою");
  }

  const label = serviceLabel(options.urlTemplate);

  // Читання, ліміт розміру, кодування й розпізнавання заслонок у нас уже є —
  // сервіс віддає такий самий HTML, як і сам сайт, тому шлях той самий.
  const result = await fetchDirect(target, {
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
    userAgent: options.userAgent,
  });

  if (!result.buffer) {
    return failure(
      result.problem ?? "http_error",
      // Код помилки тут майже завжди про сам сервіс (немає кредитів, невірний
      // ключ, вичерпано ліміт), а не про сайт. Не назвати його — означає
      // звинуватити чужий хост у чужій проблемі.
      `${label} — ${result.detail}`,
    );
  }

  return {
    buffer: result.buffer,
    charset: result.charset,
    // Кінцева адреса сервісу — це адреса самого сервісу, і в метаданих
    // сторінки їй місця немає.
    finalUrl: url.href,
    problem: null,
    detail: "",
  };
}
