import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ParsedPage } from "@brief/shared";
import {
  acquirePage,
  type AcquiredPage,
  type AcquireOptions,
} from "../fetcher/acquire";
import { cleanDocument, findContentScope } from "./clean";
import { extractFaqFromContent, extractFaqFromJsonLd, mergeFaq } from "./faq";
import { extractMeta } from "./metadata";
import { extractMainContent } from "./readability";
import {
  extractHeadings,
  extractLists,
  extractParagraphs,
  extractTables,
} from "./structure";
import { countWords, normalizeText } from "./text";

/** Звідки в результаті взялася структура — корисно для діагностики. */
type ExtractionSource = "semantic-container" | "readability" | "fallback-scope";

interface ContentSource {
  $: CheerioAPI;
  scope: string;
  source: ExtractionSource;
  /** Заголовок статті за версією Readability, якщо він її розібрав. */
  articleTitle: string | null;
}

/**
 * Вибирає, з чого діставати структуру.
 *
 * Readability чудово відкидає обвіс, але агресивно ріже саму розмітку:
 * на сторінках, де заголовки обгорнуті в div (Wikipedia і будь-який MediaWiki),
 * він вирізає всі H2/H3 і таблиці. Для SEO-аналізу це фатально — структура
 * конкурента і є головним результатом.
 *
 * Тому: якщо сторінка має семантичний контейнер (<article>, <main>, role=main),
 * довіряємо йому напряму й Readability не запускаємо взагалі — це ще й
 * найдорожчий крок пайплайна. Readability залишається для сторінок
 * без семантичної розмітки, де інакше довелося б брати весь <body>.
 */
function selectContentSource($raw: CheerioAPI, finalUrl: string): ContentSource {
  const scope = findContentScope($raw);

  if (scope.kind === "semantic") {
    return {
      $: $raw,
      scope: scope.selector,
      source: "semantic-container",
      articleTitle: null,
    };
  }

  const main = extractMainContent($raw.html(), finalUrl);

  if (main) {
    return {
      $: cheerio.load(main.contentHtml),
      scope: "body",
      source: "readability",
      articleTitle: main.title,
    };
  }

  return {
    $: $raw,
    scope: scope.selector,
    source: "fallback-scope",
    articleTitle: null,
  };
}

/**
 * Повний пайплайн однієї сторінки:
 *
 *   fetch → метадані та JSON-LD із сирого HTML
 *         → очищення службових блоків
 *         → вибір джерела основного контенту
 *         → Cheerio дістає структуру
 *         → ParsedPage
 *
 * На виході — чистий JSON. HTML далі по системі не йде і до AI не потрапляє.
 */
/**
 * Мінімум слів, щоб сторінка мала сенс як матеріал для ТЗ.
 * Нижче цього — це лістинг, головна або заслонка, і краще перейти
 * до наступної стратегії каскаду, ніж віддати AI порожнечу.
 * Орієнтир: коротка словникова стаття MDN — 182 слова.
 */
const MIN_USABLE_WORDS = 120;

export async function parsePage(
  rawUrl: string,
  options: AcquireOptions,
): Promise<ParsedPage> {
  return acquirePage(rawUrl, options, (fetched) => {
    const page = parseAcquired(fetched);

    if (page.wordCount < MIN_USABLE_WORDS) {
      return {
        ok: false,
        reason: `розібрано лише ${page.wordCount} слів основного тексту`,
      };
    }

    return { ok: true, value: page };
  });
}

/** Розбирає вже отриманий HTML. Чиста функція — без мережі. */
export function parseAcquired(fetched: AcquiredPage): ParsedPage {
  const $raw =
    fetched.body.kind === "buffer"
      ? cheerio.loadBuffer(fetched.body.value, {
          encoding: {
            // charset із HTTP-заголовка має пріоритет за стандартом.
            transportLayerEncodingLabel: fetched.body.charset ?? undefined,
            // Дефолт cheerio — windows-1252, і це давало кракозябри:
            // італійська сторінка без явного charset читалася як latin1
            // («velocitÃ » замість «velocità»). У сучасному вебі сторінка
            // без оголошеного кодування — майже завжди UTF-8, а справжній
            // windows-1251 його оголошує, і sniffer це побачить.
            defaultEncoding: "utf-8",
            // <meta charset> не завжди вміщується в перші 1024 байти.
            maxBytes: 4096,
          },
        })
      : // Від браузера контент приходить уже декодованим.
        cheerio.load(fetched.body.value);

  // Порядок критичний: і метадані, і JSON-LD живуть у розмітці,
  // яку cleanDocument зараз видалить.
  const meta = extractMeta($raw, fetched);
  const structuredFaq = extractFaqFromJsonLd($raw);

  cleanDocument($raw);

  const content = selectContentSource($raw, meta.finalUrl);
  const $content = content.$;
  const scope = content.scope;

  const headings = extractHeadings($content, scope);

  // Readability прибирає H1, якщо він дублює заголовок сторінки.
  // Повертаємо його — структура без H1 для SEO-аналізу неповна.
  if (!headings.some((heading) => heading.level === 1)) {
    const h1 = normalizeText(content.articleTitle ?? meta.title ?? "");
    if (h1) headings.unshift({ level: 1, text: h1 });
  }

  const faq = mergeFaq(
    structuredFaq,
    extractFaqFromContent($content, scope),
    // Акордеони й <details> Readability часто вирізає, тому на його шляху
    // додатково дивимо на очищений документ.
    content.source === "readability" ? extractFaqFromContent($raw, "body") : [],
  );

  return {
    meta,
    headings,
    paragraphs: extractParagraphs($content, scope),
    lists: extractLists($content, scope),
    tables: extractTables($content, scope),
    faq,
    wordCount: countWords(normalizeText($content(scope).first().text())),
  };
}
