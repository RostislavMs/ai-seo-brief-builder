import { marked } from "marked";

/**
 * Складання HTML із відповіді сервісу читання (див. reader.ts).
 *
 * Сервіс віддає markdown, а весь пайплайн нижче працює з HTML: cheerio дістає
 * заголовки, списки й таблиці саме з розмітки. Тому markdown повертається в
 * HTML — і це не втрата, а навпаки: у markdown уже немає ні меню, ні банерів,
 * ні скриптів, тобто рівно того, що parser/clean.ts інакше вирізав би сам.
 *
 * Розбираємо не власним регулярним виразом, а marked: у вихлопі трапляються
 * і GFM-таблиці, і вкладені списки, і код у блоках, і для SEO-аналізу
 * структура важлива до дрібниць — саморобний конвертер тут ламався б тихо.
 */

/** Метадані сторінки, які сервіс читання повертає окремо від тексту. */
export interface ReaderDocument {
  title: string | null;
  description: string | null;
  /** Адреса, з якої сервіс насправді читав сторінку. */
  canonical: string | null;
  /**
   * Мова сторінки, якщо сервіс її назвав. r.jina.ai не повертає нічого,
   * Firecrawl віддає значення з розмітки самої сторінки — тобто те саме, що
   * ступінь 1 прочитала б із `<html lang>`.
   */
  lang?: string | null;
  markdown: string;
}

/**
 * Службова «шапка», яку сервіс додає до тексту, коли його просять віддати
 * markdown, а не JSON. У режимі JSON її немає, але покладатися на це не варто:
 * потрапивши в контент, вона пішла б до AI як текст конкурента.
 */
const PREAMBLE =
  /^(?:(?:Title|URL Source|Published Time|Description|Warning|Image Description|Links\/Buttons):.*(?:\r?\n|$)|\r?\n)*(?:Markdown Content:\s*(?:\r?\n)?)?/;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Збирає мінімальний, але повноцінний для парсера документ.
 *
 * Контент обгортається в <article> навмисно: parser/index.ts бачить
 * семантичний контейнер, довіряє йому напряму й не запускає Readability —
 * найдорожчий крок пайплайна, який тут не має чого робити.
 */
export function buildReaderHtml(doc: ReaderDocument): string {
  const body = marked.parse(doc.markdown.replace(PREAMBLE, ""), {
    gfm: true,
    // Переніс рядка в markdown — не <br>: інакше кожен абзац сервісу
    // розсипався б на рядки й ламав підрахунок структури.
    breaks: false,
    async: false,
  });

  const head = [
    '<meta charset="utf-8">',
    doc.title ? `<title>${escapeAttribute(doc.title)}</title>` : "",
    doc.description
      ? `<meta name="description" content="${escapeAttribute(doc.description)}">`
      : "",
    doc.canonical
      ? `<link rel="canonical" href="${escapeAttribute(doc.canonical)}">`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // Атрибут lang ставиться лише тоді, коли сервіс назвав мову сам: вигадана
  // мова гірша за відсутню, а без неї мову визначає окремий детектор за
  // текстом. Порожній рядок для нього — те саме, що відсутній атрибут.
  const lang = doc.lang?.trim()
    ? ` lang="${escapeAttribute(doc.lang.trim())}"`
    : "";

  return `<!doctype html><html${lang}><head>${head}</head><body><article>${body}</article></body></html>`;
}
