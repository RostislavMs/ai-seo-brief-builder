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
  const startedAt = Date.now();
  const first = await withDeadline(provider, () => provider.generateJson(request));
  const firstMs = Date.now() - startedAt;
  const parsed = schema.safeParse(first.data);

  // Скільки часу пішло й скільки лишилося — у лог завжди, не лише на помилці.
  // Без цього рядка питання «чому те саме ТЗ то проходить, то ні» відповіді не
  // має: у вбитій платформою функції наших логів про причину немає взагалі.
  console.info(
    `[ai:${provider.name}] ${first.model}: ${Math.round(firstMs / 1000)} с, ` +
      `токенів ${first.usage.inputTokens ?? "?"}→${first.usage.outputTokens ?? "?"}` +
      budgetNote(provider),
  );

  if (parsed.success) {
    return {
      data: parsed.data,
      usage: first.usage,
      model: first.model,
      attempts: 1,
    };
  }

  /**
   * Друга спроба — це другий повний запит, тобто приблизно стільки ж часу, як
   * перший. Коли бюджету на неї вже не лишилося, починати її гірше, ніж не
   * починати: платформа вбиває функцію на півдорозі, і замість пояснення
   * користувач отримує 504 без тіла. Тому краще сказати правду одразу.
   *
   * Запас на 15% більший за перший запит: другий запит із дописаною поправкою
   * трохи довший, а обрізаний на останній секунді нічим не краще за необраний.
   */
  const needed = firstMs * 1.15;
  const left = provider.deadline?.remainingMs() ?? Number.POSITIVE_INFINITY;

  if (needed > left) {
    console.warn(
      `[ai:${provider.name}] відповідь не за схемою, але на другу спробу ` +
        `лишилося ${Math.round(left / 1000)} с проти потрібних ` +
        `${Math.round(needed / 1000)} — не починаю:\n` +
        describe(parsed.error.issues),
    );

    const issue = parsed.error.issues[0];

    throw new AppError(
      "ai_schema_mismatch",
      `Модель повернула структуру, що не відповідає схемі ` +
        `(${issue?.path.join(".") || "корінь"} — ${issue?.message ?? "невідома причина"}), ` +
        "а на повторну спробу вже не лишилося часу. Спробуйте ще раз — " +
        "розбіжність зі схемою випадкова. Якщо повторюється, заберіть частину " +
        "URL зі списку або оберіть модель із коротшим міркуванням.",
      502,
    );
  }

  console.warn(
    `[ai:${provider.name}] відповідь не за схемою, повторюю запит:\n` +
      describe(parsed.error.issues),
  );

  const second = await withDeadline(provider, () =>
    provider.generateJson({
      ...request,
      // Попередню (неправильну) відповідь не додаємо: для ТЗ це десятки тисяч
      // токенів, а модель усе одно складає результат заново. Достатньо сказати,
      // де саме вона зійшла зі схеми.
      messages: [
        ...request.messages,
        { role: "user", content: correction(parsed.error.issues) },
      ],
    }),
  );

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

/**
 * Позначка про бюджет для лога. Порожньо там, де бюджету немає — локально
 * писати «лишилося Infinity» немає сенсу.
 */
function budgetNote(provider: AiProvider): string {
  const deadline = provider.deadline;
  if (!deadline || !Number.isFinite(deadline.budgetMs)) return "";

  return `, у бюджеті лишилося ${Math.round(deadline.remainingMs() / 1000)} с`;
}

/**
 * Виконує запит і перекладає обрив за бюджетом у зрозумілу причину.
 *
 * Провайдери на будь-якому обриві кидають abortedError() — для них скасування
 * користувачем і вичерпаний бюджет виглядають однаково, і це правильно: сигнал
 * у них один. Різниця важлива лише тут: «Запит скасовано» на вичерпаному
 * бюджеті — неправда, за якою користувач шукатиме, що ж він натиснув.
 *
 * Саме цей переклад і є весь сенс бюджету. Без нього обрізав би не ми, а
 * платформа — на 60-й секунді, разом з усією функцією, і тілом відповіді був би
 * не наш JSON, а її сторінка помилки: фронт у такому разі показує лише
 * «Помилка запиту (504)».
 */
async function withDeadline<T>(
  provider: AiProvider,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const deadline = provider.deadline;

    if (!deadline?.expired()) throw error;

    // Не менше секунди: «не встигла за 0 с» читалося б як поломка, а не як межа.
    const seconds = Math.max(1, Math.round(deadline.budgetMs / 1000));

    console.warn(
      `[ai:${provider.name}] ${provider.model}: не вклався в бюджет ${seconds} с`,
    );

    throw new AppError(
      "ai_timeout",
      `Модель не встигла відповісти за ${seconds} с — стільки часу відведено ` +
        "на один запит. Заберіть частину URL зі списку або оберіть швидшу " +
        "модель у налаштуваннях.",
      504,
    );
  }
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
