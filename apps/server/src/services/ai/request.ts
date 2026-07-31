import type { ZodType } from "zod";
import { AppError } from "../../http/errors";
import type { AiJsonRequest, AiProvider, AiUsage } from "./types";

/**
 * Запит до моделі з перевіркою схеми і однією спробою виправитися.
 *
 * Жоден провайдер не гарантує форму відповіді: Claude віддає результат
 * викликом інструмента, OpenAI працює зі strict: false, Gemini — з
 * responseJsonSchema. Схема для всіх трьох — інструкція, а не рейка, і на
 * великому обсязі модель із неї сходить: то пропустить необов'язкове поле,
 * то віддасть intro рядком замість об'єкта. Одиничний випадок, але коштує
 * він хвилини генерації, після якої користувач однаково натисне «ще раз».
 *
 * Тому другий запит робимо самі й дописуємо в нього, що саме було не так.
 * Помилку користувачеві показуємо лише коли й друга спроба не збіглася зі
 * схемою — тоді справа не в випадковості.
 *
 * Живе тут, а не в трьох викликачах, бо перевірка в них була однакова
 * дослівно — разом із текстом помилки.
 */

/** Скільки полів назвати моделі. Перших кількох досить, щоб зрозуміти шаблон. */
const NAMED_ISSUES = 5;

export interface ValidatedResponse<T> {
  data: T;
  /** Сума по всіх спробах: платить користувач і за невдалу. */
  usage: AiUsage;
  model: string;
  /** 2 означає, що перша відповідь схемі не відповідала. */
  attempts: number;
}

export async function requestJson<T>(
  provider: AiProvider,
  request: AiJsonRequest,
  schema: ZodType<T>,
): Promise<ValidatedResponse<T>> {
  const first = await provider.generateJson(request);
  const parsed = schema.safeParse(first.data);

  if (parsed.success) {
    return {
      data: parsed.data,
      usage: first.usage,
      model: first.model,
      attempts: 1,
    };
  }

  console.warn(
    `[ai:${provider.name}] відповідь не за схемою, повторюю запит:\n` +
      describe(parsed.error.issues),
  );

  const second = await provider.generateJson({
    ...request,
    // Попередню (неправильну) відповідь не додаємо: для ТЗ це десятки тисяч
    // токенів, а модель усе одно складає результат заново. Достатньо сказати,
    // де саме вона зійшла зі схеми.
    messages: [
      ...request.messages,
      { role: "user", content: correction(parsed.error.issues) },
    ],
  });

  const usage = addUsage(first.usage, second.usage);
  const retried = schema.safeParse(second.data);

  if (!retried.success) {
    const issue = retried.error.issues[0];
    throw new AppError(
      "ai_schema_mismatch",
      `Модель повернула структуру, що не відповідає схемі: ` +
        `${issue?.path.join(".") || "корінь"} — ${issue?.message ?? "невідома причина"}`,
      502,
    );
  }

  return { data: retried.data, usage, model: second.model, attempts: 2 };
}

interface SchemaIssue {
  path: readonly PropertyKey[];
  message: string;
}

function describe(issues: readonly SchemaIssue[]): string {
  return issues
    .slice(0, NAMED_ISSUES)
    .map((issue) => `- ${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("\n");
}

/** Англійською, як і описи полів у схемі: це текст для моделі. */
function correction(issues: readonly SchemaIssue[]): string {
  return (
    "Your previous answer was rejected: these fields did not match the " +
    "required structure.\n" +
    `${describe(issues)}\n` +
    "Return the complete result again, with those fields in exactly the " +
    "shape the schema describes — an object stays an object, an array stays " +
    "an array. Where a field does not apply, send an empty array or an empty " +
    "string; never omit it and never replace it with text."
  );
}

/** null означає «провайдер не сказав», і сума з ним — теж не число. */
function addUsage(first: AiUsage, second: AiUsage): AiUsage {
  return {
    inputTokens: addTokens(first.inputTokens, second.inputTokens),
    outputTokens: addTokens(first.outputTokens, second.outputTokens),
  };
}

function addTokens(first: number | null, second: number | null): number | null {
  return first === null || second === null ? null : first + second;
}
