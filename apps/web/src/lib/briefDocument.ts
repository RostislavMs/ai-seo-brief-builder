import type {
  BriefBlock,
  BriefBlockKind,
  BriefH2,
  BriefH3,
  BriefIntro,
  BriefKeyword,
  BriefOptionalAddition,
  BriefRecommendations,
  Range,
  SeoBrief,
} from "@brief/shared";
import { formatRange } from "@brief/shared";
import { plural } from "./format";

/**
 * ТЗ як документ для вставки в текстовий редактор.
 *
 * Тут збирається те, що копіюється кнопкою — цілком або шматком: розділ,
 * список, таблиця ключів. Розмітка навмисно не повторює інтерфейс: замість
 * карток і flex-рядків — <h1>…<h5>, голі <ul>/<ol> і справжні <table>, майже
 * без стилів. Чим менше стилів приходить із буфера, тим більше лишається від
 * стилів самого документа.
 *
 * Виділення мишею йде іншим шляхом — [copySelection.ts](./copySelection.ts):
 * там немає структури ТЗ, є лише DOM, тому й правила інші. Спільне в них —
 * теги на виході.
 *
 * Проміжна модель (`Node`) потрібна, щоб HTML і текст не розʼїхалися:
 * структура описується один раз, а рендерів у неї два.
 */

/** Назви типів блоків. Тут, а не в BlockView: їх бачить і документ, і екран. */
export const BLOCK_LABEL: Record<BriefBlockKind, string> = {
  list: "список",
  ordered_list: "нумерований список",
  table: "таблиця",
  pros_cons: "плюси та мінуси",
  questions: "питання",
  highlight: "виділити головне",
  links: "посилання",
  template: "шаблон опису",
};

/** Де порядок пунктів несе зміст, а де це просто перелік. */
export const ORDERED_KINDS: ReadonlySet<BriefBlockKind> =
  new Set<BriefBlockKind>(["ordered_list", "questions", "template"]);

/** Куди стає необовʼязкове доповнення — розгорнутим текстом, а не кодом. */
const PLACEMENT: Record<
  BriefOptionalAddition["placement"],
  { what: string; where: string }
> = {
  h2: { what: "новий розділ H2", where: "після розділу" },
  h3: { what: "підрозділ H3", where: "у розділ" },
  block: { what: "блок", where: "у розділ" },
};

interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

interface Cell {
  text: string;
  /** Непорожньо — клітинка стає посиланням. */
  href?: string;
}

type Node =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5; text: string }
  | { kind: "para"; spans: Span[]; lang?: string }
  | {
      kind: "list";
      ordered: boolean;
      items: readonly string[];
      /** Пункти англійською — курсивом, як і решта інструкцій. */
      italic?: boolean;
      lang?: string;
    }
  | { kind: "table"; head: string[]; rows: Cell[][] };

/** Те, що лягає в буфер: два представлення одного й того самого фрагмента. */
export interface CopyPayload {
  html: string;
  text: string;
}

const plain = (text: string): Span => ({ text });
const bold = (text: string): Span => ({ text, bold: true });
const italic = (text: string): Span => ({ text, italic: true });

/** «5500-5800 слів» — обсяг у ТЗ завжди діапазон. */
function words(range: Range): string {
  return `${formatRange(range)} ${plural(range.max, "слово", "слова", "слів")}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ── Збірка документа ────────────────────────────────────────────────────────

function pushInstruction(doc: Node[], text: string | undefined): void {
  // Інструкції — англійською, і в документі вони стоять поряд з контентом
  // мовою статті. Курсив тут те саме, що кольорова смуга в інтерфейсі:
  // єдина ознака, що це вказівка райтеру, а не текст, який треба написати.
  if (text?.trim()) {
    doc.push({ kind: "para", spans: [italic(text.trim())], lang: "en" });
  }
}

function pushLabeledList(
  doc: Node[],
  keywords: readonly string[],
  label: string,
): void {
  if (keywords.length === 0) return;

  doc.push({ kind: "para", spans: [bold(label)], lang: "en" });
  doc.push({ kind: "list", ordered: true, items: keywords });
}

function pushBlock(doc: Node[], block: BriefBlock): void {
  const notes: string[] = [];

  if (block.itemWordCount) {
    notes.push(`${formatRange(block.itemWordCount)} сл. на опис`);
  }
  // Знаки «+» і «−» поруч із числами: у документі немає кольору, яким їх
  // розрізняє інтерфейс.
  if (block.prosCount) {
    const { max } = block.prosCount;
    notes.push(
      `+${formatRange(block.prosCount)} ${plural(max, "перевага", "переваги", "переваг")}`,
    );
  }
  if (block.consCount) {
    const { max } = block.consCount;
    notes.push(
      `−${formatRange(block.consCount)} ${plural(max, "недолік", "недоліки", "недоліків")}`,
    );
  }

  const label = capitalize(BLOCK_LABEL[block.kind]);

  doc.push({
    kind: "para",
    spans:
      notes.length > 0
        ? [bold(label), plain(` — ${notes.join(" · ")}`)]
        : [bold(label)],
  });

  pushInstruction(doc, block.instruction);

  if (block.itemTemplate?.trim()) {
    doc.push({
      kind: "para",
      spans: [plain("Шаблон: "), bold(block.itemTemplate.trim())],
    });
  }

  // kind="highlight" — саме речення, яке має бути в тексті: жирним, бо це
  // єдиний блок, вміст якого райтер переносить дослівно.
  if (block.text?.trim()) {
    doc.push({ kind: "para", spans: [bold(block.text.trim())] });
  }

  if (block.items.length > 0) {
    doc.push({
      kind: "list",
      ordered: ORDERED_KINDS.has(block.kind),
      items: block.items,
    });
  }

  // Каркас таблиці: підписи рядків є, решту клітинок заповнює райтер.
  if (block.columns.length > 0) {
    doc.push({
      kind: "table",
      head: block.columns,
      rows: block.rows.map((row) => [
        { text: row },
        ...block.columns.slice(1).map(() => ({ text: "" })),
      ]),
    });
  }

  if (block.links?.length) {
    doc.push({
      kind: "table",
      head: ["Anchor Text", "URL"],
      rows: block.links.map((link) => [
        { text: link.anchor },
        { text: link.url, href: link.url },
      ]),
    });
  }
}

function pushSubsection(doc: Node[], h3: BriefH3, number: string): void {
  doc.push({ kind: "heading", level: 4, text: `${number}. ${h3.title}` });
  doc.push({ kind: "para", spans: [plain(`H3 · ${words(h3.wordCount)}`)] });

  pushInstruction(doc, h3.instruction);
  pushLabeledList(
    doc,
    h3.keywords,
    "Use the following keywords in this paragraph:",
  );
  h3.blocks.forEach((block) => pushBlock(doc, block));

  h3.children.forEach((h4, index) => {
    doc.push({
      kind: "heading",
      level: 5,
      text: `${number}.${index + 1}. ${h4.title}`,
    });
    doc.push({ kind: "para", spans: [plain(`H4 · ${words(h4.wordCount)}`)] });
    pushInstruction(doc, h4.instruction);
  });
}

function pushSection(doc: Node[], h2: BriefH2, index: number): void {
  const number = String(index + 1);

  doc.push({ kind: "heading", level: 3, text: `${number}. ${h2.title}` });
  doc.push({ kind: "para", spans: [plain(`H2 · ${words(h2.wordCount)}`)] });

  pushInstruction(doc, h2.instruction);
  pushLabeledList(
    doc,
    h2.keywords,
    "Use the following keywords in this section:",
  );
  h2.blocks.forEach((block) => pushBlock(doc, block));

  h2.children.forEach((h3, h3Index) =>
    pushSubsection(doc, h3, `${number}.${h3Index + 1}`),
  );
}

function pushIntro(doc: Node[], intro: BriefIntro): void {
  doc.push({ kind: "heading", level: 2, text: "Вступ після H1" });
  doc.push({
    kind: "para",
    spans: [
      plain(
        `${words(intro.wordCount)} · ${formatRange(intro.paragraphs)} ` +
          plural(intro.paragraphs.max, "абзац", "абзаци", "абзаців"),
      ),
    ],
  });
  pushInstruction(doc, intro.instruction);

  if (intro.mainPoints.length > 0) {
    doc.push({
      kind: "para",
      spans: [bold("Main points of the introduction:")],
      lang: "en",
    });
    doc.push({ kind: "list", ordered: true, items: intro.mainPoints });
  }

  pushLabeledList(
    doc,
    intro.keywords,
    "Use these keywords once in the introduction:",
  );
}

function pushKeywordTable(
  doc: Node[],
  keywords: readonly BriefKeyword[],
): void {
  if (keywords.length === 0) return;

  // Той самий порядок, що в інтерфейсі: найчастіші ключі згори, нулі
  // (заборонені форми) — в кінці.
  const sorted = [...keywords].sort((a, b) => b.usage.max - a.usage.max);

  doc.push({ kind: "heading", level: 2, text: "Ключові слова" });
  doc.push({
    kind: "para",
    spans: [
      plain(
        `${sorted.length} ${plural(sorted.length, "ключ", "ключі", "ключів")} · ` +
          "кількість вживань у всій статті, разом із заголовками, таблицями " +
          "й входженнями у складі довших ключів",
      ),
    ],
  });
  doc.push({
    kind: "table",
    head: ["Keyword", "Total usage"],
    rows: sorted.map((keyword) => [
      { text: keyword.keyword },
      { text: formatRange(keyword.usage) },
    ]),
  });
}

function pushAddition(doc: Node[], addition: BriefOptionalAddition): void {
  const placement = PLACEMENT[addition.placement];
  const where = addition.section
    ? ` · ${placement.where} «${addition.section}»`
    : "";

  doc.push({ kind: "heading", level: 4, text: addition.title });
  doc.push({
    kind: "para",
    spans: [plain(`${placement.what}${where} · +${words(addition.wordCount)}`)],
  });
  pushInstruction(doc, addition.instruction);
}

function pushRecommendations(
  doc: Node[],
  recommendations: BriefRecommendations,
): void {
  const { optionalAdditions, structureNotes } = recommendations;

  if (optionalAdditions.length === 0 && structureNotes.length === 0) return;

  doc.push({ kind: "heading", level: 2, text: "Додаткові рекомендації" });

  if (optionalAdditions.length > 0) {
    doc.push({ kind: "heading", level: 3, text: "Можна додати" });
    doc.push({
      kind: "para",
      spans: [
        plain(
          "Необовʼязкові заголовки й блоки понад структуру — з місцем і обсягом.",
        ),
      ],
    });

    optionalAdditions.forEach((addition) => pushAddition(doc, addition));
  }

  if (structureNotes.length > 0) {
    doc.push({
      kind: "heading",
      level: 3,
      text: "Загальні поради щодо структури",
    });
    doc.push({
      kind: "list",
      ordered: false,
      items: structureNotes,
      italic: true,
      lang: "en",
    });
  }
}

function buildDocument(brief: SeoBrief): Node[] {
  const doc: Node[] = [];

  // Заголовок документа — рекомендований H1: у Docs він стає «Заголовок 1»
  // і одразу дає файлу назву в панелі структури.
  doc.push({ kind: "heading", level: 1, text: brief.recommendedH1 });
  doc.push({
    kind: "para",
    spans: [
      plain("Мова контенту: "),
      bold(brief.contentLanguage),
      plain(" · Обсяг статті: "),
      bold(words(brief.totalWordCount)),
    ],
  });
  pushInstruction(doc, brief.instruction);

  doc.push({ kind: "heading", level: 2, text: "Основна інформація" });
  doc.push({
    kind: "para",
    spans: [
      bold(`Title (${brief.recommendedTitle.length} симв.)`),
      plain(` — ${brief.recommendedTitle}`),
    ],
  });
  doc.push({
    kind: "para",
    spans: [
      bold(
        `Meta Description (${brief.recommendedMetaDescription.length} симв.)`,
      ),
      plain(` — ${brief.recommendedMetaDescription}`),
    ],
  });
  doc.push({
    kind: "para",
    spans: [bold("H1"), plain(` — ${brief.recommendedH1}`)],
  });

  pushIntro(doc, brief.intro);

  doc.push({ kind: "heading", level: 2, text: "Структура статті" });
  brief.structure.forEach((h2, index) => pushSection(doc, h2, index));

  pushKeywordTable(doc, brief.keywords);
  pushRecommendations(doc, brief.recommendations);

  return doc;
}

// ── HTML ────────────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Межі клітинок задані інлайном: клас із буфера не приїде, а таблиця без
 * ліній у Docs читається як суцільний текст.
 */
export const CELL_STYLE =
  "border:1px solid #b7b7b7;padding:5px 8px;vertical-align:top";

export const HEAD_STYLE = `${CELL_STYLE};background:#f1f1f1;text-align:left`;

function spanHtml(span: Span): string {
  let html = escapeHtml(span.text);

  if (span.italic) html = `<i>${html}</i>`;
  if (span.bold) html = `<b>${html}</b>`;

  return html;
}

function langAttribute(lang: string | undefined): string {
  return lang ? ` lang="${escapeHtml(lang)}"` : "";
}

function nodeHtml(node: Node): string {
  switch (node.kind) {
    case "heading":
      return `<h${node.level}>${escapeHtml(node.text)}</h${node.level}>`;

    case "para":
      return `<p${langAttribute(node.lang)}>${node.spans.map(spanHtml).join("")}</p>`;

    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const items = node.items
        .map((item) => {
          const text = escapeHtml(item);
          return `<li>${node.italic ? `<i>${text}</i>` : text}</li>`;
        })
        .join("");

      return `<${tag}${langAttribute(node.lang)}>${items}</${tag}>`;
    }

    case "table": {
      const head = node.head
        .map((column) => `<th style="${HEAD_STYLE}">${escapeHtml(column)}</th>`)
        .join("");

      const rows = node.rows
        .map((row) => {
          const cells = row
            .map((cell) => {
              const text = escapeHtml(cell.text);
              const content = cell.href
                ? `<a href="${escapeHtml(cell.href)}">${text}</a>`
                : text;

              return `<td style="${CELL_STYLE}">${content}</td>`;
            })
            .join("");

          return `<tr>${cells}</tr>`;
        })
        .join("");

      return (
        `<table style="border-collapse:collapse">` +
        `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
      );
    }
  }
}

// ── Звичайний текст ─────────────────────────────────────────────────────────

function spanText(span: Span): string {
  let text = span.text;

  if (span.italic) text = `_${text}_`;
  if (span.bold) text = `**${text}**`;

  return text;
}

/** Переноси й вертикальні риски всередині клітинки ламають рядок таблиці. */
function cellText(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function nodeText(node: Node): string {
  switch (node.kind) {
    case "heading":
      return `${"#".repeat(node.level)} ${node.text}`;

    case "para":
      return node.spans.map(spanText).join("");

    case "list":
      return node.items
        .map((item, index) => {
          const text = node.italic ? `_${item}_` : item;
          return node.ordered ? `${index + 1}. ${text}` : `- ${text}`;
        })
        .join("\n");

    case "table": {
      const head = `| ${node.head.map(cellText).join(" | ")} |`;
      const divider = `| ${node.head.map(() => "---").join(" | ")} |`;
      const rows = node.rows.map(
        (row) =>
          `| ${row
            .map((cell) =>
              cell.href
                ? `[${cellText(cell.text)}](${cell.href})`
                : cellText(cell.text),
            )
            .join(" | ")} |`,
      );

      return [head, divider, ...rows].join("\n");
    }
  }
}

/**
 * `<meta charset>` на початку обовʼязковий: у Windows HTML із буфера проходить
 * через CF_HTML, і без явного кодування кирилиця та діакритика приїжджають
 * у редактор бітими.
 */
export function toPayload(nodes: Node[]): CopyPayload {
  return {
    html: `<meta charset="utf-8">\n${nodes.map(nodeHtml).join("\n")}`,
    text: `${nodes.map(nodeText).join("\n\n")}\n`,
  };
}

// ── Що можна скопіювати кнопкою ─────────────────────────────────────────────

function fragment(fill: (doc: Node[]) => void): CopyPayload {
  const doc: Node[] = [];
  fill(doc);
  return toPayload(doc);
}

export function briefPayload(brief: SeoBrief): CopyPayload {
  return toPayload(buildDocument(brief));
}

export function introPayload(intro: BriefIntro): CopyPayload {
  return fragment((doc) => pushIntro(doc, intro));
}

export function sectionPayload(h2: BriefH2, index: number): CopyPayload {
  return fragment((doc) => pushSection(doc, h2, index));
}

export function subsectionPayload(h3: BriefH3, number: string): CopyPayload {
  return fragment((doc) => pushSubsection(doc, h3, number));
}

export function blockPayload(block: BriefBlock): CopyPayload {
  return fragment((doc) => pushBlock(doc, block));
}

export function labeledListPayload(
  keywords: readonly string[],
  label: string,
): CopyPayload {
  return fragment((doc) => pushLabeledList(doc, keywords, label));
}

export function keywordTablePayload(
  keywords: readonly BriefKeyword[],
): CopyPayload {
  return fragment((doc) => pushKeywordTable(doc, keywords));
}

export function additionPayload(
  addition: BriefOptionalAddition,
): CopyPayload {
  return fragment((doc) => pushAddition(doc, addition));
}

export function notesPayload(notes: readonly string[]): CopyPayload {
  return fragment((doc) =>
    doc.push({
      kind: "list",
      ordered: false,
      items: notes,
      italic: true,
      lang: "en",
    }),
  );
}

/**
 * Одне значення — Title, Meta Description, H1. Без обгортки в <p>: такий
 * рядок вставляється всередину абзацу, а не окремим блоком.
 */
export function valuePayload(value: string): CopyPayload {
  return { html: `<meta charset="utf-8">${escapeHtml(value)}`, text: value };
}
