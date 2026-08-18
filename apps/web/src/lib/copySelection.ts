import type { ClipboardEvent } from "react";
import { CELL_STYLE, HEAD_STYLE, escapeHtml } from "./briefDocument";

/**
 * Копіювання виділеного мишею.
 *
 * За замовчуванням браузер кладе в буфер розмітку разом з обчисленими
 * стилями — саме тому вставка в Google Docs дає 11-пікселеві сірі абзаци,
 * кольорові плашки, рамки карток і поламані відступи. Стилі інтерфейсу
 * розраховані на щільний екран, а не на сторінку A4, і в документі вони
 * заважають завжди.
 *
 * Тому подія copy перехоплюється, а виділення збирається заново: ті самі
 * заголовки, абзаци, списки й таблиці, але без жодного класу та стилю.
 * Далі документ форматує їх власними стилями — чого від вставки й чекають.
 *
 * Що чим вважати, підказує сама розмітка:
 *
 * - `data-copy-heading="2".."5"` — рядок стає заголовком цього рівня.
 *   Потрібне тому, що заголовки статті в інтерфейсі — це <span> у flex-рядку
 *   поряд з бейджем обсягу, а не <h2>: на екрані вони не мають і не повинні
 *   мати вигляду заголовків сторінки.
 * - `data-copy-strong` / `data-copy-em` — жирний / курсивний фрагмент.
 * - `data-copy-unwrap` — <ul>, який тримає верстку дерева, а не перелік:
 *   його пункти йдуть у документ як звичайні блоки.
 * - `data-copy-skip` — службове: лічильники символів, нумерація карток.
 */

interface Inline {
  html: string;
  text: string;
}

type Piece =
  | { kind: "heading"; level: number; inline: Inline }
  | { kind: "para"; inline: Inline }
  | { kind: "list"; ordered: boolean; items: Inline[] }
  | { kind: "table"; rows: { header: boolean; cells: Inline[] }[] };

/**
 * Куди збирається вміст.
 *
 * `blocks` — верхній рівень: межа блоку закриває абзац. `break` — усередині
 * <li> чи клітинки: там абзацу нема куди подітися, тому межа стає <br>.
 * `space` — усередині рядка-заголовка: там і переносу бути не може.
 */
type Mode = "blocks" | "break" | "space";

interface Ctx {
  range: Range;
  mode: Mode;
  pieces: Piece[];
  buffer: Inline;
}

/** Елементи, яких у документі не має бути взагалі. */
const SKIP_TAGS: ReadonlySet<string> = new Set([
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "SCRIPT",
  "STYLE",
  "SVG",
]);

const BOLD_TAGS: ReadonlySet<string> = new Set(["B", "STRONG"]);
const ITALIC_TAGS: ReadonlySet<string> = new Set(["I", "EM"]);

// ── Буфер рядка ─────────────────────────────────────────────────────────────

function pushInline(ctx: Ctx, html: string, text: string): void {
  ctx.buffer = {
    html: ctx.buffer.html + html,
    text: ctx.buffer.text + text,
  };
}

function endsOpen(ctx: Ctx): boolean {
  return ctx.buffer.text.length === 0 || /\s$/.test(ctx.buffer.text);
}

function appendSpace(ctx: Ctx): void {
  if (!endsOpen(ctx)) pushInline(ctx, " ", " ");
}

function appendBreak(ctx: Ctx): void {
  if (ctx.buffer.text.trim().length > 0 && !ctx.buffer.html.endsWith("<br>")) {
    ctx.buffer = {
      html: `${ctx.buffer.html.replace(/\s+$/, "")}<br>`,
      text: `${ctx.buffer.text.replace(/\s+$/, "")}\n`,
    };
  }
}

function takeInline(ctx: Ctx): Inline {
  const inline = {
    html: ctx.buffer.html.trim(),
    text: ctx.buffer.text.trim(),
  };

  ctx.buffer = { html: "", text: "" };
  return inline;
}

function flushParagraph(ctx: Ctx): void {
  const inline = takeInline(ctx);
  if (inline.text) ctx.pieces.push({ kind: "para", inline });
}

/** Межа блоку — те, що робить із неї поточний режим. */
function boundary(ctx: Ctx): void {
  if (ctx.mode === "blocks") flushParagraph(ctx);
  else if (ctx.mode === "break") appendBreak(ctx);
  else appendSpace(ctx);
}

// ── Обхід виділення ─────────────────────────────────────────────────────────

function isBlock(display: string): boolean {
  return !(
    display === "inline" ||
    display === "inline-block" ||
    display === "inline-flex" ||
    display === "inline-grid" ||
    display === "contents"
  );
}

/** Flex і grid розсувають дітей проміжком, якого в тексті немає. */
function hasGap(display: string): boolean {
  return (
    display === "flex" ||
    display === "grid" ||
    display === "inline-flex" ||
    display === "inline-grid"
  );
}

function sliceText(node: Text, range: Range): string {
  const start = node === range.startContainer ? range.startOffset : 0;
  const end = node === range.endContainer ? range.endOffset : node.data.length;

  // Той самий результат, що на екрані: у всьому ТЗ white-space звичайний,
  // тому переноси й відступи розмітки схлопуються в один пробіл.
  return node.data.slice(start, end).replace(/\s+/g, " ");
}

function childContext(ctx: Ctx, mode: Mode): Ctx {
  return { range: ctx.range, mode, pieces: [], buffer: { html: "", text: "" } };
}

/**
 * Вміст елемента одним рядком — для заголовків, пунктів списку й клітинок.
 * Блоки всередині не створюють абзаців: у режимах `break` і `space` вони
 * перетворюються на <br> або пробіл.
 */
function collectInline(el: Element, ctx: Ctx, mode: "break" | "space"): Inline {
  const sub = childContext(ctx, mode);
  visitChildren(el, sub);
  return takeInline(sub);
}

function visitChildren(el: Element, ctx: Ctx): void {
  const gap = hasGap(displayOf(el));

  for (const child of Array.from(el.childNodes)) {
    // Проміжок flex-контейнера доводиться відтворювати вручну: між
    // <span>H2</span> і заголовком у розмітці немає жодного символа.
    if (gap && child.nodeType === Node.ELEMENT_NODE) appendSpace(ctx);
    visit(child, ctx);
  }
}

function displayOf(el: Element): string {
  return window.getComputedStyle(el).display;
}

function emitHeading(el: Element, ctx: Ctx, level: number): void {
  const inline = collectInline(el, ctx, "space");
  if (!inline.text) return;

  if (ctx.mode !== "blocks") {
    boundary(ctx);
    pushInline(ctx, inline.html, inline.text);
    boundary(ctx);
    return;
  }

  flushParagraph(ctx);
  ctx.pieces.push({ kind: "heading", level, inline });
}

function emitList(el: Element, ctx: Ctx): void {
  const ordered = el.tagName === "OL";
  const items: Inline[] = [];

  for (const li of Array.from(el.children)) {
    if (li.tagName !== "LI") continue;
    if (!ctx.range.intersectsNode(li)) continue;
    if (li.hasAttribute("data-copy-skip")) continue;

    const inline = collectInline(li, ctx, "break");
    if (inline.text) items.push(inline);
  }

  if (items.length === 0) return;

  if (ctx.mode !== "blocks") {
    items.forEach((item) => {
      boundary(ctx);
      pushInline(ctx, item.html, item.text);
    });
    return;
  }

  flushParagraph(ctx);
  ctx.pieces.push({ kind: "list", ordered, items });
}

function emitTable(el: Element, ctx: Ctx): void {
  const rows: { header: boolean; cells: Inline[] }[] = [];

  for (const tr of Array.from(el.querySelectorAll("tr"))) {
    if (!ctx.range.intersectsNode(tr)) continue;

    const cells: Inline[] = [];
    // Рядок вважається шапкою, лише якщо всі його клітинки — <th>. У таблиці
    // блоку перша колонка теж <th> (підпис рядка), і без цієї умови кожен
    // рядок каркаса ставав би шапкою.
    let header = true;

    for (const cell of Array.from(tr.children)) {
      if (cell.tagName !== "TD" && cell.tagName !== "TH") continue;
      if (cell.hasAttribute("data-copy-skip")) continue;
      if (cell.tagName === "TD") header = false;

      cells.push(collectInline(cell, ctx, "break"));
    }

    if (cells.length > 0) rows.push({ header, cells });
  }

  if (rows.length === 0) return;

  if (ctx.mode !== "blocks") {
    rows.forEach((row) => {
      boundary(ctx);
      pushInline(
        ctx,
        row.cells.map((cell) => cell.html).join(" — "),
        row.cells.map((cell) => cell.text).join(" — "),
      );
    });
    return;
  }

  flushParagraph(ctx);
  ctx.pieces.push({ kind: "table", rows });
}

function emitWrapped(el: Element, ctx: Ctx, tag: "b" | "i"): void {
  const block = isBlock(displayOf(el));
  const inline = collectInline(el, ctx, block ? "break" : "space");
  if (!inline.text) return;

  if (block) boundary(ctx);
  pushInline(ctx, `<${tag}>${inline.html}</${tag}>`, inline.text);
  if (block) boundary(ctx);
}

function visit(node: Node, ctx: Ctx): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = sliceText(node as Text, ctx.range);
    if (text) pushInline(ctx, escapeHtml(text), text);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;

  if (!ctx.range.intersectsNode(el)) return;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (el.hasAttribute("data-copy-skip")) return;
  if (el.getAttribute("aria-hidden") === "true") return;

  const display = displayOf(el);
  if (display === "none") return;

  if (el.tagName === "BR") {
    appendBreak(ctx);
    return;
  }

  const heading = el.getAttribute("data-copy-heading");
  if (heading) {
    emitHeading(el, ctx, Number(heading));
    return;
  }

  if (el.hasAttribute("data-copy-strong")) {
    emitWrapped(el, ctx, "b");
    return;
  }

  if (el.hasAttribute("data-copy-em")) {
    emitWrapped(el, ctx, "i");
    return;
  }

  if (BOLD_TAGS.has(el.tagName)) {
    emitWrapped(el, ctx, "b");
    return;
  }

  if (ITALIC_TAGS.has(el.tagName)) {
    emitWrapped(el, ctx, "i");
    return;
  }

  if (/^H[1-6]$/.test(el.tagName)) {
    emitHeading(el, ctx, Number(el.tagName.slice(1)));
    return;
  }

  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    const inline = collectInline(el, ctx, "space");
    if (!inline.text) return;

    pushInline(
      ctx,
      href ? `<a href="${escapeHtml(href)}">${inline.html}</a>` : inline.html,
      inline.text,
    );
    return;
  }

  if (
    (el.tagName === "UL" || el.tagName === "OL") &&
    !el.hasAttribute("data-copy-unwrap")
  ) {
    emitList(el, ctx);
    return;
  }

  if (el.tagName === "TABLE") {
    emitTable(el, ctx);
    return;
  }

  const block = isBlock(display);

  if (block) boundary(ctx);
  visitChildren(el, ctx);
  if (block) boundary(ctx);
}

// ── Вивід ───────────────────────────────────────────────────────────────────

function pieceHtml(piece: Piece): string {
  switch (piece.kind) {
    case "heading":
      return `<h${piece.level}>${piece.inline.html}</h${piece.level}>`;

    case "para":
      return `<p>${piece.inline.html}</p>`;

    case "list": {
      const tag = piece.ordered ? "ol" : "ul";
      const items = piece.items
        .map((item) => `<li>${item.html}</li>`)
        .join("");

      return `<${tag}>${items}</${tag}>`;
    }

    case "table": {
      const rows = piece.rows
        .map((row) => {
          const cells = row.cells
            .map((cell) =>
              row.header
                ? `<th style="${HEAD_STYLE}">${cell.html}</th>`
                : `<td style="${CELL_STYLE}">${cell.html}</td>`,
            )
            .join("");

          return `<tr>${cells}</tr>`;
        })
        .join("");

      return `<table style="border-collapse:collapse">${rows}</table>`;
    }
  }
}

function pieceText(piece: Piece): string {
  switch (piece.kind) {
    case "heading":
      return `${"#".repeat(piece.level)} ${piece.inline.text}`;

    case "para":
      return piece.inline.text;

    case "list":
      return piece.items
        .map((item, index) =>
          piece.ordered ? `${index + 1}. ${item.text}` : `- ${item.text}`,
        )
        .join("\n");

    case "table":
      // Табуляція, а не markdown-таблиця: так рядки лягають у Sheets і Excel
      // по колонках, а в звичайному тексті лишаються читабельними.
      return piece.rows
        .map((row) =>
          row.cells.map((cell) => cell.text.replace(/\n/g, " ")).join("\t"),
        )
        .join("\n");
  }
}

/**
 * Обробник події copy. Вішається на контейнер ТЗ; якщо виділення вийшло за
 * його межі, подія до нас не дійде і спрацює звичайне копіювання браузера.
 */
export function copySelection(event: ClipboardEvent<HTMLElement>): void {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const ctx: Ctx = {
    range,
    mode: "blocks",
    pieces: [],
    buffer: { html: "", text: "" },
  };

  visit(range.commonAncestorContainer, ctx);
  flushParagraph(ctx);

  // Порожній результат — привід не заважати браузеру: краще звичайна вставка,
  // ніж порожній буфер.
  if (ctx.pieces.length === 0) return;

  event.clipboardData.setData(
    "text/html",
    `<meta charset="utf-8">\n${ctx.pieces.map(pieceHtml).join("\n")}`,
  );
  event.clipboardData.setData(
    "text/plain",
    ctx.pieces.map(pieceText).join("\n\n"),
  );
  event.preventDefault();
}
