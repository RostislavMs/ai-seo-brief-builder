import { AppError } from "../../http/errors";
import type { PromptDefinition } from "./registry";

/**
 * Підстановка значень у текст промпта й перевірка правки перед збереженням.
 *
 * Перевірка тут — головний запобіжник цієї частини. Промпт не проходить
 * розгляду, як правило для мови: адмін пише текст, і він одразу йде в модель.
 * Тому те, що можна перевірити машинно, перевіряється до збереження, а не
 * після першої зламаної генерації:
 *
 * - вставка з опискою (`{{pagesJSON}}`) відхиляється, а не тихо зникає
 *   з промпта, лишивши модель без даних;
 * - обовʼязкову вставку не можна прибрати — саме нею в промпт потрапляють
 *   дані конкурентів, чинні правила й мовний поділ.
 *
 * Чого перевірка не робить: не судить сам текст. Промпт, який просить
 * дурницю осмисленою англійською, — ризик, який лишається за адміном,
 * і рівно для нього поряд є історія змін і кнопка скидання.
 */

/**
 * `{{name}}` або `{{ name }}`. Пробіли всередині допускаються навмисно:
 * текст пишуть руками, і `{{ topic }}` це та сама вставка, а не описка.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** Які вставки згадані в тексті — у порядку появи, без повторів. */
export function placeholders(body: string): string[] {
  const found = new Set<string>();

  for (const match of body.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name) found.add(name);
  }

  return [...found];
}

/**
 * Підставляє значення. Невідома вставка стає порожнім рядком: сюди вона може
 * дійти лише з тексту, збереженого до появи змінної в реєстрі, і показати
 * моделі буквальне `{{oldVar}}` було б гірше, ніж нічого.
 */
export function renderPrompt(
  body: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return body.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name];

    if (value === undefined) {
      console.warn(`[prompts] у промпті лишилася невідома вставка {{${name}}}`);
      return "";
    }

    return String(value);
  });
}

/**
 * Звіряє текст із описом промпта. Кидає AppError із поясненням, яке видно
 * в інтерфейсі, — тому в повідомленнях назви вставок, а не коди помилок.
 */
export function assertValidBody(
  definition: PromptDefinition,
  body: string,
): void {
  const allowed = new Set(definition.variables.map((variable) => variable.name));
  const used = placeholders(body);

  const unknown = used.filter((name) => !allowed.has(name));

  if (unknown.length > 0) {
    throw new AppError(
      "prompt_unknown_variable",
      `У цьому промпті немає вставок ${unknown.map((name) => `{{${name}}}`).join(", ")}. ` +
        `Доступні: ${[...allowed].map((name) => `{{${name}}}`).join(", ")}.`,
      422,
    );
  }

  const missing = definition.variables
    .filter((variable) => variable.required && !used.includes(variable.name))
    .map((variable) => variable.name);

  if (missing.length > 0) {
    throw new AppError(
      "prompt_missing_variable",
      `Без ${missing.map((name) => `{{${name}}}`).join(", ")} промпт втратить сенс — ` +
        "саме цими вставками в нього потрапляють дані. Поверніть їх у текст.",
      422,
    );
  }
}
