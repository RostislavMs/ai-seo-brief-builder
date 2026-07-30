import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { countWords, normalizeText } from "./text";

/** Теги, які ніколи не несуть основного контенту. Видаляються безумовно. */
const JUNK_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "form",
  "dialog",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "audio",
  "video",
  "map",
  "nav",
  "aside",
].join(",");

/** ARIA-орієнтири, які за визначенням не є основним контентом. */
const JUNK_ROLES = [
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "search",
  "dialog",
  "alertdialog",
  "menu",
  "menubar",
  "toolbar",
  "tablist",
]
  .map((role) => `[role="${role}"]`)
  .join(",");

/**
 * Класи, які треба матчити цілим рядком, а не сегментами:
 * розбиття `sr-only` на сегменти дало б надто загальні «sr» і «only».
 */
const JUNK_CLASS_PATTERNS = [
  '[class*="sr-only"]',
  '[class*="visually-hidden"]',
  '[class*="screen-reader"]',
  '[class*="table-of-contents"]',
  '[class*="skip-link"]',
  '[class*="back-to-top"]',
].join(",");

/**
 * Сегменти класів та id, що майже завжди означають службовий блок.
 * Порівняння йде по сегментах: `site-footer` → ["site","footer"] → збіг.
 * Тому працює і з BEM, і з kebab-case, і з snake_case.
 */
const JUNK_TOKENS = new Set([
  "nav",
  "navbar",
  "navigation",
  "breadcrumb",
  "breadcrumbs",
  "sidebar",
  "sidenav",
  "footer",
  "subfooter",
  "copyright",
  "comment",
  "comments",
  "disqus",
  "advert",
  "adverts",
  "advertisement",
  "advertising",
  "ads",
  "adsense",
  "adsbygoogle",
  "popup",
  "modal",
  "overlay",
  "cookie",
  "cookies",
  "gdpr",
  "consent",
  "newsletter",
  "subscribe",
  "subscription",
  "social",
  "share",
  "sharing",
  "pagination",
  "pager",
  "offcanvas",
  "related",
  "recommended",
  "recommendations",
  "widget",
  "toc",
]);

/**
 * Сегменти, які збігаються і з контентом: `.menu` на сайті ресторану — це
 * справжнє меню страв, а не навігація. Такі блоки видаляються лише якщо вони
 * короткі: справжній контент довгий.
 */
const WEAK_JUNK_TOKENS = new Set([
  "menu",
  "promo",
  "banner",
  "teaser",
  "sticky",
  "tags",
  "tag",
  "author",
  "byline",
  "meta",
  "toolbar",
  "utility",
]);

const WEAK_MAX_WORDS = 60;

function tokensOf(element: Element): string[] {
  const attribs = element.attribs ?? {};
  const raw = `${attribs["class"] ?? ""} ${attribs["id"] ?? ""}`.toLowerCase();
  return raw.split(/[\s_\-.:]+/).filter(Boolean);
}

/**
 * Прибирає службовий контент: хедери, футери, навігацію, сайдбари, рекламу,
 * коментарі (розділ 6 ТЗ). Мутує переданий документ, викликається до Readability.
 *
 * Readability теж фільтрує сторінку, але покладатися лише на нього не варто:
 * на нестандартній розмітці він залишає сайдбари й банери.
 */
export function cleanDocument($: CheerioAPI): void {
  $(JUNK_TAGS).remove();
  $(JUNK_ROLES).remove();
  $(JUNK_CLASS_PATTERNS).remove();

  // Приховане від користувача не має потрапляти в аналіз.
  $("[hidden], [aria-hidden='true']").remove();
  $("[style]")
    .filter((_, el) =>
      /display\s*:\s*none|visibility\s*:\s*hidden/i.test(
        el.attribs?.["style"] ?? "",
      ),
    )
    .remove();

  // <header>/<footer> сайту прибираємо, а такі ж теги всередині статті — ні:
  // там часто лежить H1 із підзаголовком.
  $("header, footer").each((_, el) => {
    const node = $(el);
    if (node.closest("article, main, [role='main']").length === 0) {
      node.remove();
    }
  });

  // Порядок перевірок тут важливий для швидкодії: спершу дешеве порівняння
  // сегментів класу, і лише при збігу — дорогі обходи DOM (.find/.text).
  // Інакше на сторінці з тисячами елементів виходить O(n²).
  $("[class], [id]").each((_, el) => {
    const tokens = tokensOf(el);
    if (tokens.length === 0) return;

    const isJunk = tokens.some((token) => JUNK_TOKENS.has(token));
    const isWeakJunk =
      !isJunk && tokens.some((token) => WEAK_JUNK_TOKENS.has(token));

    if (!isJunk && !isWeakJunk) return;

    const node = $(el);

    // Блок із H1 не чіпаємо: втратити головний заголовок гірше,
    // ніж залишити зайвий банер.
    if (el.tagName?.toLowerCase() === "h1" || node.find("h1").length > 0) {
      return;
    }

    if (isJunk || countWords(node.text()) <= WEAK_MAX_WORDS) {
      node.remove();
    }
  });

  unwrapHeadingWrappers($);
}

/**
 * Розгортає обгортки, у яких лежить лише заголовок:
 * `<div class="mw-heading"><h2>…</h2></div>` → `<h2>…</h2>`.
 *
 * Без цього Readability викидає такі блоки як «мало тексту, багато посилань»
 * і структура сторінки зникає повністю (перевірено на Wikipedia:
 * 13 H2 і 9 H3 → нуль заголовків).
 */
function unwrapHeadingWrappers($: CheerioAPI): void {
  const HEADINGS = "h1, h2, h3, h4, h5, h6";

  // Обгортки бувають вкладені одна в одну, тому кілька проходів.
  for (let pass = 0; pass < 3; pass += 1) {
    let unwrapped = 0;

    $("div, span, section").each((_, el) => {
      const node = $(el);
      const heading = node.children(HEADINGS);
      if (heading.length !== 1) return;

      // Поза заголовком в обгортці не має бути змістовного тексту,
      // інакше це звичайний контейнер розділу, а не декоративна обгортка.
      const rest = node.clone();
      rest.children(HEADINGS).remove();
      if (normalizeText(rest.text()).length > 40) return;

      node.replaceWith(heading.first());
      unwrapped += 1;
    });

    if (unwrapped === 0) return;
  }
}

/** Мінімум слів, щоб вважати контейнер основним контентом. */
const MIN_SCOPE_WORDS = 100;

/** Теги, семантика яких за стандартом означає «основний контент». */
const SEMANTIC_SCOPES = ["article", "main", "[role='main']"];

/** Здогадки за класами та id — менш надійні, ніж семантичні теги. */
const HEURISTIC_SCOPES = [
  "#content",
  ".content",
  "#main",
  ".main",
  ".post",
  ".entry",
  ".article",
];

export type ScopeKind = "semantic" | "heuristic" | "body";

export interface ContentScope {
  selector: string;
  kind: ScopeKind;
}

/**
 * Шукає контейнер основного контенту й повідомляє, наскільки він надійний.
 * Від цього залежить стратегія витягу: семантичному контейнеру
 * можна довіряти напряму, у решті випадків потрібен Readability.
 */
export function findContentScope($: CheerioAPI): ContentScope {
  const isBigEnough = (selector: string): boolean => {
    const found = $(selector).first();
    return found.length > 0 && countWords(found.text()) >= MIN_SCOPE_WORDS;
  };

  for (const selector of SEMANTIC_SCOPES) {
    if (isBigEnough(selector)) return { selector, kind: "semantic" };
  }

  for (const selector of HEURISTIC_SCOPES) {
    if (isBigEnough(selector)) return { selector, kind: "heuristic" };
  }

  return { selector: "body", kind: "body" };
}
