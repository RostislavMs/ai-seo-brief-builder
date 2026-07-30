import type {
  ComparisonKeyword,
  ComparisonMetrics,
  ComparisonScore,
  ComparisonSection,
  MetricComparison,
  ParsedPage,
} from "@brief/shared";
import { median } from "@brief/shared";

/**
 * Арифметична частина порівняння: показники, входження ключів і бал.
 *
 * Усе це рахується тут, а не моделлю, з тієї ж причини, з якої
 * `normalizeBrief()` дораховує таблицю ключів: «скільки разів слово
 * трапляється в тексті» і «скільки відсотків розділів розкрито» — не
 * творчість. Модель відповіла б на око, витратила б на це токени й на
 * повторному запуску дала б інші числа.
 */

function headingCount(page: ParsedPage, level: 2 | 3): number {
  return page.headings.filter((heading) => heading.level === level).length;
}

function toMetric(
  own: number,
  competitors: readonly number[],
): MetricComparison {
  return {
    own,
    median: median(competitors),
    best: competitors.length > 0 ? Math.max(...competitors) : 0,
  };
}

export function buildMetrics(
  own: ParsedPage,
  competitors: readonly ParsedPage[],
): ComparisonMetrics {
  const metric = (count: (page: ParsedPage) => number): MetricComparison =>
    toMetric(count(own), competitors.map(count));

  return {
    wordCount: metric((page) => page.wordCount),
    h2: metric((page) => headingCount(page, 2)),
    h3: metric((page) => headingCount(page, 3)),
    paragraphs: metric((page) => page.paragraphs.length),
    lists: metric((page) => page.lists.length),
    tables: metric((page) => page.tables.length),
    faq: metric((page) => page.faq.length),
  };
}

/**
 * Увесь текст сторінки одним нормалізованим рядком — для пошуку ключів.
 *
 * Береться повний ParsedPage, а не скорочений payload, який бачила модель:
 * ключ може стояти в тридцять п'ятому абзаці, який у промпт не влучив, і
 * назвати його відсутнім було б неправдою.
 */
export function pageText(page: ParsedPage): string {
  const parts: string[] = [
    page.meta.title ?? "",
    page.meta.description ?? "",
    ...page.headings.map((heading) => heading.text),
    ...page.paragraphs,
    ...page.lists.flatMap((list) => list.items),
    ...page.tables.flatMap((table) => [
      table.caption ?? "",
      ...table.headers,
      ...table.rows.flat(),
    ]),
    ...page.faq.flatMap((item) => [item.question, item.answer]),
  ];

  return parts.join(" ").toLowerCase().replace(/\s+/g, " ");
}

/** Скільки разів підрядок трапляється в тексті, без урахування регістру. */
function countOccurrences(text: string, keyword: string): number {
  const needle = keyword.trim().toLowerCase().replace(/\s+/g, " ");

  // Один-два символи дали б сотні випадкових входжень у складі інших слів.
  if (needle.length < 3) return 0;

  let count = 0;
  let from = 0;

  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return count;

    count += 1;
    from = at + needle.length;
  }
}

/**
 * Ключі з відповіді моделі, доповнені числами.
 *
 * Модель віддає лише самі ключі — те, чого без неї не дістати: які запити
 * взагалі варті уваги. Скільком конкурентам вони належать і скільки разів
 * зустрічаються в нас — уже пошук підрядка.
 */
export function buildKeywords(
  keywords: readonly string[],
  own: ParsedPage,
  competitors: readonly ParsedPage[],
): ComparisonKeyword[] {
  const ownText = pageText(own);
  const competitorTexts = competitors.map(pageText);

  const seen = new Set<string>();
  const result: ComparisonKeyword[] = [];

  for (const raw of keywords) {
    const keyword = raw.trim().replace(/\s+/g, " ");
    const key = keyword.toLowerCase();

    if (keyword.length < 2 || seen.has(key)) continue;
    seen.add(key);

    result.push({
      keyword,
      competitors: competitorTexts.filter(
        (text) => countOccurrences(text, keyword) > 0,
      ).length,
      occurrences: countOccurrences(ownText, keyword),
    });
  }

  // Спершу найпоширеніші в конкурентів, і серед них — ті, яких у нас немає:
  // саме вони і є предметом звіту.
  return result.sort(
    (a, b) => b.competitors - a.competitors || a.occurrences - b.occurrences,
  );
}

/**
 * Ваги підсумкового балу. Структура важить найбільше, бо саме її бракує
 * найчастіше й саме вона вимагає найбільше роботи; обсяг — сам по собі
 * не мета, тому втричі дешевший за половину; ключі — найдешевша частина
 * виправлення, тому й вага найменша.
 */
const WEIGHTS = { structure: 0.5, volume: 0.3, keywords: 0.2 } as const;

/**
 * Частка. Порожній набір — це 1, а не 0: сторінка, для якої модель не назвала
 * жодного розділу конкурентів, нічого не «провалила», і давати їй нуль було б
 * покаранням за брак даних.
 */
function share(part: number, total: number): number {
  return total > 0 ? part / total : 1;
}

const percent = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 100);

export interface ScoreInput {
  sections: readonly ComparisonSection[];
  keywords: readonly ComparisonKeyword[];
  metrics: ComparisonMetrics;
}

export function buildScore(input: ScoreInput): ComparisonScore {
  // Слабкий розділ — половина: він є, але не тримає порівняння з конкурентами.
  const covered = input.sections.reduce(
    (sum, section) =>
      sum +
      (section.status === "covered" ? 1 : section.status === "weak" ? 0.5 : 0),
    0,
  );

  const structure = share(covered, input.sections.length);

  // Понад медіану — стеля. Довша за конкурентів сторінка не «краща за 100%»:
  // обсяг сам по собі не мета, а вийти за межі шкали означало б компенсувати
  // ним прогалини в структурі.
  const { own, median: medianWords } = input.metrics.wordCount;
  const volume = medianWords > 0 ? own / medianWords : 1;

  const keywords = share(
    input.keywords.filter((keyword) => keyword.occurrences > 0).length,
    input.keywords.length,
  );

  return {
    total: percent(
      WEIGHTS.structure * Math.min(1, structure) +
        WEIGHTS.volume * Math.min(1, volume) +
        WEIGHTS.keywords * Math.min(1, keywords),
    ),
    structure: percent(structure),
    volume: percent(volume),
    keywords: percent(keywords),
  };
}
