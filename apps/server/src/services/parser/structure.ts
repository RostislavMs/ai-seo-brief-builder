import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type {
  ContentList,
  ContentTable,
  Heading,
  HeadingLevel,
} from "@brief/shared";
import { countWords, isMeaningful, normalizeText } from "./text";

/** Максимум елементів одного типу — захист від сторінок-каталогів. */
const MAX_ITEMS = 400;

/**
 * Заголовки H1–H4 у порядку появи в документі.
 * Порядок зберігає реальну вкладеність структури конкурента.
 */
export function extractHeadings($: CheerioAPI, scope: string): Heading[] {
  const headings: Heading[] = [];

  $(scope)
    .first()
    .find("h1, h2, h3, h4")
    .each((_, el) => {
      if (headings.length >= MAX_ITEMS) return false;

      const tag = el.tagName?.toLowerCase() ?? "";
      const level = Number(tag.slice(1)) as HeadingLevel;
      if (level < 1 || level > 4) return;

      const text = normalizeText($(el).text());
      if (!text) return;

      // Той самий заголовок підряд — це, як правило, дубль розмітки
      // (мобільна та десктопна версії).
      const previous = headings.at(-1);
      if (previous?.level === level && previous.text === text) return;

      headings.push({ level, text });
      return;
    });

  return headings;
}

/** Змістовні абзаци основного контенту. */
export function extractParagraphs($: CheerioAPI, scope: string): string[] {
  const paragraphs: string[] = [];
  const seen = new Set<string>();

  const push = (text: string): void => {
    if (paragraphs.length >= MAX_ITEMS) return;
    if (seen.has(text)) return;
    seen.add(text);
    paragraphs.push(text);
  };

  $(scope)
    .first()
    .find("p")
    .each((_, el) => {
      const node = $(el);

      // Абзаци всередині списків і таблиць збираються окремо —
      // інакше той самий текст потрапить у результат двічі.
      if (node.closest("li, td, th, figcaption").length > 0) return;

      const text = normalizeText(node.text());
      if (isMeaningful(text)) push(text);
    });

  // Багато сайтів верстає абзаци через <div>. Якщо <p> майже немає —
  // добираємо листові <div>, у яких лежить лише текст.
  if (paragraphs.length < 3) {
    $(scope)
      .first()
      .find("div")
      .each((_, el) => {
        const node = $(el);
        if (
          node.children("div, p, ul, ol, table, section, article, h1, h2, h3, h4")
            .length > 0
        ) {
          return;
        }

        const text = normalizeText(node.text());
        if (isMeaningful(text, 8)) push(text);
      });
  }

  return paragraphs;
}

/**
 * Списки основного контенту.
 * Навігаційні списки (майже суцільні посилання) відкидаються.
 */
export function extractLists($: CheerioAPI, scope: string): ContentList[] {
  const lists: ContentList[] = [];

  $(scope)
    .first()
    .find("ul, ol")
    .each((_, el) => {
      if (lists.length >= 100) return false;

      const node = $(el);

      // Вкладений список уже врахований у тексті пунктів батьківського.
      if (node.parents("ul, ol").length > 0) return;

      const items: string[] = [];
      let linkOnlyCount = 0;

      node.children("li").each((_, li) => {
        const liNode = $(li);
        const text = normalizeText(liNode.text());
        if (!text) return;

        const linkText = normalizeText(liNode.find("a").first().text());
        if (linkText && linkText === text) linkOnlyCount += 1;

        items.push(text);
      });

      if (items.length < 2) return;

      const averageWords =
        items.reduce((sum, item) => sum + countWords(item), 0) / items.length;

      // Ознака меню: майже всі пункти — суцільні посилання й дуже короткі.
      const linkRatio = linkOnlyCount / items.length;
      if (linkRatio > 0.7 && averageWords < 5) return;

      lists.push({
        kind: el.tagName?.toLowerCase() === "ol" ? "ordered" : "unordered",
        items,
      });
      return;
    });

  return lists;
}

/** Таблиці даних. Верстальні таблиці (без заголовків, в один стовпець) відкидаються. */
export function extractTables($: CheerioAPI, scope: string): ContentTable[] {
  const tables: ContentTable[] = [];

  $(scope)
    .first()
    .find("table")
    .each((_, el) => {
      if (tables.length >= 50) return false;

      const node = $(el);
      if (node.parents("table").length > 0) return;

      const caption = normalizeText(node.find("caption").first().text()) || null;

      // Рядок заголовків — це <thead> або перший рядок, у якому ВСІ клітинки <th>.
      // У таблицях-специфікаціях <th> стоїть у першій колонці кожного рядка;
      // там це частина даних, а не шапка, і headers має лишитися порожнім.
      let headerRow: Element | null = null;
      const theadRow = node.find("thead tr").first();

      if (theadRow.length > 0) {
        headerRow = theadRow[0] ?? null;
      } else {
        const firstRow = node.find("tr").first();
        const cells = firstRow.find("td, th").toArray();
        const allHeaderCells =
          cells.length > 0 &&
          cells.every((cell) => cell.tagName?.toLowerCase() === "th");

        if (allHeaderCells) headerRow = firstRow[0] ?? null;
      }

      const headers = headerRow
        ? $(headerRow)
            .find("td, th")
            .map((_, cell) => normalizeText($(cell).text()))
            .get()
        : [];

      const rows: string[][] = [];

      node.find("tr").each((_, tr) => {
        if (rows.length >= 200) return false;
        if (tr === headerRow) return;

        // find() дістає і рядки вкладених таблиць — беремо лише свої.
        if ($(tr).closest("table")[0] !== el) return;

        const cells = $(tr).find("td, th");
        if (cells.length === 0) return;

        const values = cells.map((_, cell) => normalizeText($(cell).text())).get();
        if (values.some((value) => value.length > 0)) rows.push(values);
        return;
      });

      if (rows.length === 0) return;
      if (headers.length === 0 && rows.every((row) => row.length <= 1)) return;

      // Рядок з однієї клітинки серед багатоклітинних — це, як правило,
      // картинка або підзаголовок на всю ширину, а не дані.
      const widestRow = Math.max(...rows.map((row) => row.length));
      const dataRows =
        widestRow > 1 ? rows.filter((row) => row.length > 1) : rows;

      if (dataRows.length === 0) return;

      tables.push({ caption, headers, rows: dataRows });
      return;
    });

  return tables;
}
