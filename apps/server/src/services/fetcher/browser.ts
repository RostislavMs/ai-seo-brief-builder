import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
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
    await page
      .waitForFunction(
        () =>
          !/just a moment|verifying|checking your browser|зачекайте|ci siamo quasi|un attimo|attendere|security check/i.test(
            document.title,
          ),
        { timeout: options.settleMs },
      )
      .catch(() => {
        /* не пройшов — вирішить diagnose нижче */
      });

    // Коротка пауза, щоб JS-сайт домалював контент після завантаження.
    await page.waitForTimeout(1500);

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
