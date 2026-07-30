import { existsSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { diagnose, type AccessProblem } from "./detect";

/**
 * Друга ступінь каскаду: справжній Chrome.
 *
 * Виграш дають не «людські» заголовки, а приховування ознак автоматизації.
 * Заміряно на вибірці з 8 сайтів: звичайний headless — 3/8,
 * headless із прапорцями нижче — 5/8. Саме це відкрило rozetka.com.ua
 * (403 → 5237 слів) і reddit (26 → 1311 слів).
 * Видимий режим переваги не дав, тому працюємо headless.
 */

/** Прибирає ознаку автоматизації з рушія Blink. */
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
];

/** Chrome сам додає цей прапорець, і він видає керований браузер. */
const IGNORED_DEFAULT_ARGS = ["--enable-automation"];

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export interface BrowserFetchOptions {
  timeoutMs: number;
  /** Порожній рядок — шукати встановлений браузер автоматично. */
  executablePath: string;
  /** Скільки чекати після завантаження, щоб челендж пройшов сам. */
  settleMs: number;
  /**
   * Проксі для цього одного контексту; відсутній — прямий доступ.
   *
   * Саме на контекст, а не на запуск: екземпляр браузера спільний для всього
   * процесу, а платний трафік потрібен лише тим сторінкам, які без нього
   * не беруться.
   */
  proxy?: { server: string; username?: string; password?: string };
}

export interface BrowserFetchResult {
  html: string | null;
  finalUrl: string;
  problem: AccessProblem | null;
  detail: string;
}

/** Знаходить встановлений Chrome або Edge. */
export function findBrowserExecutable(configured: string): string | null {
  if (configured) return existsSync(configured) ? configured : null;
  return CHROME_PATHS.find((path) => existsSync(path)) ?? null;
}

/**
 * Один екземпляр браузера на весь процес: запуск коштує ~300 мс,
 * а сторінки ізолюються окремими контекстами.
 */
let shared: Promise<Browser> | null = null;

async function getBrowser(executablePath: string): Promise<Browser> {
  if (!shared) {
    shared = import("playwright-core").then(({ chromium }) =>
      chromium.launch({
        executablePath,
        headless: true,
        args: STEALTH_ARGS,
        ignoreDefaultArgs: IGNORED_DEFAULT_ARGS,
      }),
    );

    // Якщо запуск не вдався — не кешуємо відмову назавжди.
    shared.catch(() => {
      shared = null;
    });
  }

  const browser = await shared;

  // Браузер міг впасти між запитами.
  if (!browser.isConnected()) {
    shared = null;
    return getBrowser(executablePath);
  }

  return browser;
}

let cachedUserAgent: string | null = null;

/**
 * Headless Chrome повідомляє про себе рядком `HeadlessChrome/150.0.0.0` —
 * найпрямішим маркером автоматизації, який тільки може бути.
 * Заміряно: з власним UA reddit віддає 26 слів, rozetka — 403;
 * після заміни на `Chrome` — 3949 слів і 200 відповідно.
 *
 * UA беремо в самого браузера, а не хардкодимо: інакше рядок застаріє
 * після кожного оновлення Chrome і сам стане підозрілим.
 */
async function resolveUserAgent(browser: Browser): Promise<string> {
  if (cachedUserAgent) return cachedUserAgent;

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const native = await page.evaluate(() => navigator.userAgent);
    cachedUserAgent = native.replace("HeadlessChrome", "Chrome");
    return cachedUserAgent;
  } finally {
    await context.close().catch(() => {});
  }
}

/** Крок опитування сторінки та стеля очікування, поки вона домальовується. */
const POLL_STEP_MS = 400;
const GROWTH_MAX_MS = 5000;

/** Заслонки, які можуть зникнути самі, якщо дати сторінці час. */
const CHALLENGE_TITLE =
  /just a moment|verifying|checking your browser|зачекайте|ci siamo quasi|un attimo|attendere|security check/i;

/**
 * Пауза власним таймером, а не `page.waitForTimeout`.
 *
 * Різниця принципова: будь-яке очікування, реалізоване всередині сторінки,
 * залежить від самої сторінки — а нам потрібна межа, якої сторінка не здатна
 * порушити (див. waitForChallenge нижче).
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Чекає, поки заслонка челенджу зникне з заголовка — але не більше `maxMs`.
 *
 * Тут навмисно свій цикл, а не `page.waitForFunction`, і причина заміряна:
 * на сторінці з віджетом Turnstile той висить рівно 30 с — стільки, скільки
 * усталений таймаут Playwright, — **не зважаючи** ні на переданий `timeout: 8000`,
 * ні на `polling: 500`. Тобто наша межа очікування просто не діяла, і кожна
 * заблокована сторінка коштувала 30 с у ступені 2 і ще 30 с у ступені 5.
 * Заміряно на premiumtimesng.com: 31.7 → 9.0 с.
 *
 * `page.title()` при цьому відповідає миттєво навіть на такій сторінці, тому
 * опитування дешеве.
 */
async function waitForChallenge(page: Page, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    const title = await page.title().catch(() => null);

    // Сторінка зникла з-під нас (редирект, закритий контекст) — вердикт по ній
    // усе одно винесе diagnose нижче.
    if (title === null) return;
    if (!CHALLENGE_TITLE.test(title)) return;

    await delay(POLL_STEP_MS);
  }
}

/**
 * Чекає, поки обсяг тексту перестане рости.
 *
 * Фіксована пауза після завантаження хибна з обох боків: готовій сторінці вона
 * марно додає час до кожного запиту, а JS-сайт, що підтягує контент запитом,
 * за неї не встигає — і ми віддаємо каскаду порожній каркас, після чого справу
 * доводить архів застарілою копією.
 *
 * Тому пауза не фіксована, а за фактом: щойно текст двічі підряд однаковий,
 * сторінка домалювалася. Стеля потрібна для нескінченних лічильників і
 * карусельних заголовків — ті не стабілізуються ніколи.
 */
async function waitForStableText(page: Page, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  let previous = -1;

  while (Date.now() < deadline) {
    const length = await page
      .evaluate(() => document.body?.innerText.length ?? 0)
      .catch(() => -1);

    if (length < 0) return;
    if (length > 0 && length === previous) return;

    previous = length;
    await delay(POLL_STEP_MS);
  }
}

/** Викликається під час зупинки сервера, щоб не лишати процес Chrome. */
export async function closeBrowser(): Promise<void> {
  cachedUserAgent = null;

  if (!shared) return;

  const pending = shared;
  shared = null;

  try {
    const browser = await pending;
    await browser.close();
  } catch {
    /* браузер уже мертвий */
  }
}

export async function fetchWithBrowser(
  url: URL,
  options: BrowserFetchOptions,
): Promise<BrowserFetchResult> {
  const executablePath = findBrowserExecutable(options.executablePath);

  if (!executablePath) {
    return {
      html: null,
      finalUrl: url.href,
      problem: "network",
      detail: "браузер не знайдено — встановіть Chrome або задайте NITRO_BROWSER_PATH",
    };
  }

  let browser: Browser;
  try {
    browser = await getBrowser(executablePath);
  } catch (error) {
    return {
      html: null,
      finalUrl: url.href,
      problem: "network",
      detail: `не вдалося запустити браузер: ${error instanceof Error ? error.message : "невідома причина"}`,
    };
  }

  const context = await browser.newContext({
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    userAgent: await resolveUserAgent(browser),
    ...(options.proxy ? { proxy: options.proxy } : {}),
  });

  // navigator.webdriver — найпростіший і найпоширеніший маркер автоматизації.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  try {
    const page = await context.newPage();

    // Картинки й шрифти не потрібні: вони лише сповільнюють завантаження.
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") {
        return route.abort();
      }
      return route.continue();
    });

    const response = await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });

    // Челендж може пройти сам, але фіксована пауза погана з двох боків:
    // сторінки без челенджу чекають марно, а справжній челендж інколи
    // не встигає. Тому чекаємо саме на зникнення заслонки із заголовка.
    await waitForChallenge(page, options.settleMs);

    await waitForStableText(page, GROWTH_MAX_MS);

    const html = await page.content();
    const status = response?.status() ?? 0;
    const diagnosis = diagnose(status, html);

    return {
      html: diagnosis.problem === null ? html : null,
      finalUrl: page.url(),
      problem: diagnosis.problem,
      detail: diagnosis.problem
        ? `браузер: ${diagnosis.title || `код ${status}`}, ${diagnosis.words} слів`
        : "",
    };
  } catch (error) {
    return {
      html: null,
      finalUrl: url.href,
      problem: "network",
      detail: `браузер не завантажив сторінку: ${error instanceof Error ? error.name : "помилка"}`,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
