/**
 * Приведення JSON Schema до підмножини, яку приймає Anthropic.
 *
 * Обмеження на число, рядок чи масив (minimum, maxLength, maxItems) Claude не
 * розуміє: у строгому режимі вони повертають 400 ще до генерації, а у схемі
 * інструмента просто витрачають токени, нічого не додаючи до інструкції.
 * Схеми ТЗ пишуться один раз на трьох провайдерів, і Gemini з OpenAI ці ключі
 * приймають, тому підганяємо не схему, а запит — тут, в адаптері, де й мають
 * жити особливості провайдера.
 *
 * Найчастіше сюди потрапляє не рукописне обмеження, а автоматичне:
 * z.number().int() у Zod 4 дописує minimum/maximum на межах безпечного
 * цілого, і в схемі ТЗ таких пар пів сотні — по дві на кожен діапазон.
 */

import type Anthropic from "@anthropic-ai/sdk";

/**
 * Ключі, яких немає в підмножині.
 *
 * Обмеження просто прибираються, а не переносяться в description: усе, що
 * модель має знати про межі, у цих схемах уже написано словами в .describe()
 * («Up to 60 characters», «140-160 characters»), і машинний дублікат лише
 * сперечався б із ним.
 */
const UNSUPPORTED = new Set([
  // Числа
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  // Рядки
  "minLength",
  "maxLength",
  "pattern",
  // Масиви (minItems частково дозволений — див. нижче)
  "maxItems",
  "uniqueItems",
  "prefixItems",
  "contains",
  // Об'єкти
  "minProperties",
  "maxProperties",
  "patternProperties",
  "propertyNames",
  // Композиція, якої немає в підмножині
  "not",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "dependentRequired",
  // Метадані: зайві ключі в корені деякі перевірки теж відхиляють
  "$schema",
  "$id",
]);

/** Формати рядків із підмножини. Решта — 400. */
const FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

/**
 * Ключі, значення яких — не схема, а словник «ім'я → схема». Спускатися в них
 * потрібно обережно: там ключі задає автор схеми, і поле з назвою "pattern"
 * прибирати не можна.
 */
const SCHEMA_MAPS = new Set(["properties", "$defs", "definitions"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Схема без ключів, які Anthropic відхиляє.
 *
 * Корінь схеми відповіді — завжди об'єкт, тому type проставляємо явно:
 * саме його вимагає тип input_schema у SDK, і провайдер обходиться без
 * приведення типів.
 */
export function toAnthropicSchema(schema: unknown): Anthropic.Tool.InputSchema {
  const cleaned = clean(schema);

  return { ...(isRecord(cleaned) ? cleaned : {}), type: "object" };
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!isRecord(node)) return node;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED.has(key)) continue;
    // З minItems дозволені лише 0 і 1: усе інше — таке саме обмеження довжини.
    if (key === "minItems" && value !== 0 && value !== 1) continue;
    if (key === "format" && !FORMATS.has(String(value))) continue;

    result[key] = SCHEMA_MAPS.has(key) && isRecord(value)
      ? cleanMap(value)
      : clean(value);
  }

  // Об'єкт без additionalProperties: false Anthropic не приймає. Zod ставить
  // його сам, але схему може складати й не Zod, а забутий ключ дає ту саму
  // помилку, що й заборонений.
  if (result["type"] === "object" || isRecord(result["properties"])) {
    result["additionalProperties"] = false;
  }

  return result;
}

function cleanMap(map: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(map).map(([name, schema]) => [name, clean(schema)]),
  );
}
