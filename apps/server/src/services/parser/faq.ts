import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { FaqItem } from "@brief/shared";
import { normalizeBlock, normalizeText } from "./text";

const MAX_ANSWER_CHARS = 1500;
const MAX_ITEMS = 60;

/** Значення в JSON-LD часто містять HTML — прибираємо теги й декодуємо сутності. */
function stripHtml(value: string): string {
  if (!value.includes("<") && !value.includes("&")) return normalizeBlock(value);
  return normalizeBlock(cheerio.load(`<div>${value}</div>`)("div").text());
}

function truncate(value: string): string {
  return value.length > MAX_ANSWER_CHARS
    ? `${value.slice(0, MAX_ANSWER_CHARS).trimEnd()}…`
    : value;
}

/** Значення @type буває рядком або масивом. */
function hasType(value: Record<string, unknown>, type: string): boolean {
  const raw = value["@type"];
  if (typeof raw === "string") return raw.toLowerCase() === type.toLowerCase();
  if (Array.isArray(raw)) {
    return raw.some(
      (item) => typeof item === "string" && item.toLowerCase() === type.toLowerCase(),
    );
  }
  return false;
}

function readAnswer(value: unknown): string | null {
  if (typeof value === "string") return stripHtml(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const answer = readAnswer(item);
      if (answer) return answer;
    }
    return null;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const text = record["text"] ?? record["name"];
    if (typeof text === "string") return stripHtml(text);
  }

  return null;
}

/**
 * Рекурсивно обходить будь-яку структуру JSON-LD і збирає всі Question.
 * Розмітка буває вкладена в @graph, у масиви, в itemListElement — тому
 * простіше обійти все дерево, ніж вгадувати конкретну форму.
 */
function collectQuestions(node: unknown, into: FaqItem[]): void {
  if (into.length >= MAX_ITEMS) return;

  if (Array.isArray(node)) {
    for (const item of node) collectQuestions(item, into);
    return;
  }

  if (typeof node !== "object" || node === null) return;

  const record = node as Record<string, unknown>;

  if (hasType(record, "Question")) {
    const question = typeof record["name"] === "string" ? stripHtml(record["name"]) : "";
    const answer = readAnswer(record["acceptedAnswer"] ?? record["suggestedAnswer"]);

    if (question && answer) {
      into.push({ question: normalizeText(question), answer: truncate(answer) });
    }
  }

  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) collectQuestions(value, into);
  }
}

/**
 * FAQ зі структурованої розмітки Schema.org — найнадійніше джерело.
 * Викликати ДО cleanDocument: очищення видаляє теги <script>.
 */
export function extractFaqFromJsonLd($: CheerioAPI): FaqItem[] {
  const items: FaqItem[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    if (items.length >= MAX_ITEMS) return false;

    const raw = $(el).text().trim();
    if (!raw) return;

    try {
      collectQuestions(JSON.parse(raw) as unknown, items);
    } catch {
      // Битий JSON-LD трапляється часто — просто пропускаємо цей блок.
    }
    return;
  });

  return items;
}

/**
 * Ознака питання. Без цієї перевірки в FAQ потрапляють акордеони й глосарії:
 * список визначень на MDN дав 10 «питань» на кшталт «Shared cache».
 * Хибний FAQ засмічує промпт гірше, ніж кілька втрачених питань.
 */
function isQuestion(text: string): boolean {
  return text.endsWith("?");
}

/**
 * FAQ із самої розмітки: <details>/<summary>, списки визначень
 * та заголовки, що є питанням.
 *
 * Розмітка Schema.org (extractFaqFromJsonLd) цієї перевірки не проходить —
 * там FAQPage заявлений явно, тому формулювання може бути будь-яким.
 */
export function extractFaqFromContent($: CheerioAPI, scope: string): FaqItem[] {
  const items: FaqItem[] = [];
  const root = $(scope).first();

  const push = (question: string, answer: string): void => {
    if (items.length >= MAX_ITEMS) return;
    if (!question || !answer || !isQuestion(question)) return;
    items.push({ question: normalizeText(question), answer: truncate(answer) });
  };

  // 1. Акордеони.
  root.find("details").each((_, el) => {
    const node = $(el);
    const question = normalizeText(node.find("summary").first().text());

    const withoutSummary = node.clone();
    withoutSummary.find("summary").remove();

    push(question, normalizeBlock(withoutSummary.text()));
  });

  // 2. Списки визначень.
  root.find("dl").each((_, el) => {
    $(el)
      .children("dt")
      .each((_, dt) => {
        const question = normalizeText($(dt).text());
        const answer = normalizeBlock($(dt).nextUntil("dt", "dd").text());
        push(question, answer);
      });
  });

  // 3. Заголовок-питання: відповідь — усе до наступного заголовка.
  root.find("h2, h3, h4").each((_, el) => {
    const question = normalizeText($(el).text());
    if (!isQuestion(question)) return;

    const answer = normalizeBlock(
      $(el)
        .nextUntil("h1, h2, h3, h4")
        .map((_, sibling) => normalizeText($(sibling).text()))
        .get()
        .filter(Boolean)
        .join("\n"),
    );

    push(question, answer);
  });

  return items;
}

/** Обʼєднує джерела FAQ, прибираючи дублі за текстом питання. */
export function mergeFaq(...sources: FaqItem[][]): FaqItem[] {
  const byQuestion = new Map<string, FaqItem>();

  for (const source of sources) {
    for (const item of source) {
      const key = item.question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!key) continue;

      const existing = byQuestion.get(key);
      // Перше джерело (JSON-LD) точніше, але порожню відповідь варто замінити.
      if (!existing || existing.answer.length < item.answer.length) {
        byQuestion.set(key, item);
      }
    }
  }

  return [...byQuestion.values()].slice(0, MAX_ITEMS);
}
