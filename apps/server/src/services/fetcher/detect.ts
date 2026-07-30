/**
 * Розпізнавання блокувань і заслонок.
 *
 * Тут вирішується, чи переходити до наступної стратегії каскаду.
 * Найважливіше: код 200 ще не означає успіх — WAF часто віддає 200 разом зі
 * сторінкою челенджу, а SPA — порожній каркас без тексту.
 */

/**
 * Заголовки <title> сторінок-заслонок найпоширеніших WAF.
 *
 * Cloudflare перекладає заслонку за локаллю браузера, а ступінь 2 ходить
 * із `uk-UA`, тому українські варіанти тут не екзотика, а щоденність:
 * заміряно на glassdoor.com і crunchbase.com — «Трохи зачекайте…».
 */
const BLOCK_TITLES =
  /just a moment|attention required|access denied|access to this page has been denied|pardon our interruption|are you a robot|security check|verify you are human|verifying connection|forbidden|blocked|bot detection|перевірка|трохи зачекайте|доступ заборонено/i;

/** Скрипти й cookie-маркери систем захисту. */
const CHALLENGE_MARKERS =
  /challenges\.cloudflare\.com|_cf_chl_opt|__cf_chl|perimeterx|px-captcha|datadome|incapsula|_Incapsula_Resource|hcaptcha\.com|recaptcha\/api\.js|queue-it\.net/i;

/** Ознаки того, що контент домальовує JavaScript. */
const SPA_MARKERS =
  /<div[^>]+id=["'](?:root|app|__next|__nuxt|q-app)["']|ng-app|data-reactroot/i;

export type AccessProblem =
  /** Мережа не відповіла або таймаут. */
  | "network"
  /** Явне блокування: 403/429/503, заслонка, скрипт челенджу. */
  | "blocked"
  | "not_found"
  | "http_error"
  /** Код 200, але змістовного тексту немає. */
  | "thin"
  /** Не HTML — наступні стратегії не допоможуть. */
  | "not_html";

export interface Diagnosis {
  /** null — контент придатний до розбору. */
  problem: AccessProblem | null;
  words: number;
  /** Заголовок сторінки — потрапляє в повідомлення про помилку. */
  title: string;
}

/** Менше цього — майже завжди каркас SPA або заслонка. */
const MIN_WORDS = 150;

/** Для сторінок з ознаками SPA поріг вищий: каркас може містити меню. */
const MIN_WORDS_SPA = 500;

/** Груба оцінка обсягу видимого тексту — саме це отримав би парсер. */
export function countVisibleWords(html: string): number {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");

  let count = 0;
  for (const token of stripped.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count += 1;
  }
  return count;
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Оцінює, чи отриманий HTML справді містить контент сторінки.
 * `headers` потрібні для cf-mitigated, який Cloudflare ставить,
 * навіть коли віддає 200.
 */
export function diagnose(
  status: number,
  html: string,
  headers?: Record<string, string>,
): Diagnosis {
  const title = extractTitle(html);
  const words = countVisibleWords(html);
  const base = { words, title };

  if (status === 0) return { ...base, problem: "network" };

  if (status === 404 || status === 410) return { ...base, problem: "not_found" };

  /**
   * Код відповіді — не вердикт. Заміряно на trustpilot.com: браузер отримує
   * 403 разом із повною сторінкою — справжній заголовок і 4247 слів тексту.
   * Стара перевірка викидала цей контент через код і йшла аж до архіву.
   *
   * Тому спершу дивимо в тіло: якщо там повноцінний матеріал без ознак
   * челенджу, беремо його попри код. Поріг високий (той самий, що для SPA),
   * бо заслонки бувають балакучі: у Wayback її боілерплейт — 583 слова.
   */
  if (status >= 400) {
    const contentDespiteStatus =
      words >= MIN_WORDS_SPA &&
      !BLOCK_TITLES.test(title) &&
      !CHALLENGE_MARKERS.test(html);

    if (!contentDespiteStatus) {
      if (status === 403 || status === 429 || status === 503) {
        return { ...base, problem: "blocked" };
      }
      return { ...base, problem: "http_error" };
    }

    return { ...base, problem: null };
  }

  if (headers && "cf-mitigated" in headers) {
    return { ...base, problem: "blocked" };
  }

  if (BLOCK_TITLES.test(title)) return { ...base, problem: "blocked" };

  // Скрипт захисту сам по собі ще не блокування: він є і на робочих
  // сторінках. Показник — скрипт разом із відсутністю тексту.
  if (CHALLENGE_MARKERS.test(html) && words < MIN_WORDS_SPA) {
    return { ...base, problem: "blocked" };
  }

  if (words < MIN_WORDS) return { ...base, problem: "thin" };

  if (words < MIN_WORDS_SPA && SPA_MARKERS.test(html)) {
    return { ...base, problem: "thin" };
  }

  return { ...base, problem: null };
}

/** Чи має сенс пробувати наступну стратегію каскаду. */
export function isWorthRetrying(problem: AccessProblem): boolean {
  return problem !== "not_html";
}
