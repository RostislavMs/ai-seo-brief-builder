import Anthropic from "@anthropic-ai/sdk";
import { abortedError, AppError } from "../../../http/errors";
import type { AiDeadline } from "../deadline";
import type { AiJsonRequest, AiJsonResponse, AiProvider } from "../types";
import { toAnthropicSchema } from "./anthropicSchema";

const ERROR_PREVIEW_CHARS = 300;

/**
 * Стеля відповіді. ТЗ на велику статтю — це кілька десятків тисяч токенів
 * JSON, плюс адаптивне мислення рахується в цей самий ліміт.
 *
 * Запас навмисно щедрий: платимо за фактично згенероване, а на конкурентах
 * із великим обсягом (зведена таблиця ключів — рядок на 20-40 слів статті)
 * тісний ліміт обривав відповідь на середині. Sonnet 5 і Opus 5 тримають
 * до 128K, тож 64K — усе ще половина.
 */
const MAX_TOKENS = 64_000;

/**
 * Інструмент, яким модель віддає результат. Ім'я бачить лише вона сама.
 *
 * Схема йде інструментом, а не через output_config.format, бо строгий JSON
 * у Claude — це компіляція схеми в граматику для constrained decoding, і
 * схема ТЗ у неї не влазить: «The compiled grammar is too large». Дерево
 * H2→H3→H4, десятки діапазонів і шість необов'язкових полів у кожному блоці
 * дають надто багато варіантів, і спрощувати схему заради одного провайдера
 * означало б зіпсувати ТЗ для решти.
 *
 * Виклик інструмента граматику не компілює, а результат приходить уже
 * розібраним об'єктом — надійніше за розбір тексту, бо обрізаний JSON тут
 * неможливий. Відповідність схемі перевіряє zod у викликачі — так само, як
 * для OpenAI, де strict вимкнений з тієї ж причини.
 */
const RESULT_TOOL = "emit_result";

/**
 * Чи розуміє модель adaptive-мислення.
 *
 * Воно з'явилося в 4.6, і старіші моделі — Haiku 4.5 з каталогу, Sonnet 4.5,
 * уся лінійка 3.x — цей параметр відхиляють, а не ігнорують. Номер покоління
 * розбираємо з id, а не тримаємо перелік тих, хто вміє: перелік старих моделей
 * більше не зростає, а нових додавали б щоразу вручну.
 */
function supportsAdaptiveThinking(model: string): boolean {
  // Дата знімка тільки заплутує розбір: claude-haiku-4-5-20251001 → 4.5.
  const version = /(\d+)(?:[.-](\d+))?/.exec(model.replace(/-\d{8}$/, ""));

  // Ім'я без номера — це прев'ю на кшталт claude-mythos-preview, тобто
  // завжди свіжа модель.
  if (!version) return true;

  const major = Number(version[1]);
  const minor = Number(version[2] ?? 0);

  return major > 4 || (major === 4 && minor >= 6);
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    /**
     * Стеля часу на запит разом із сигналом розриву (deadline.ts).
     *
     * У конструкторі, а не в generateJson: провайдер створюється на один
     * запит, тому термін життя сигналу рівно той самий — а бізнес-логіка
     * (generateBrief і решта) лишається без жодного знання про HTTP.
     *
     * Сигнал звідси справді обриває генерацію, а не лише очікування: відповідь
     * приймається стрімом, тож закрите зʼєднання зупиняє модель, і токени
     * за ненадіслану решту не списуються.
     */
    readonly deadline?: AiDeadline,
  ) {
    // Ні timeout, ні maxRetries тут не задаються навмисно: перший SDK повторює
    // (тобто межа виходить утричі більша за задану), а другий лишається
    // корисним проти 429 і 529 — загальний час усе одно обмежує сигнал, і він
    // обриває будь-яку спробу, хоч першу, хоч третю.
    this.client = new Anthropic({ apiKey });
  }

  /** Решта класу працює з сигналом, а не з бюджетом — він її не стосується. */
  private get signal(): AbortSignal | undefined {
    return this.deadline?.signal;
  }

  async generateJson(request: AiJsonRequest): Promise<AiJsonResponse> {
    let data: unknown;
    let usage: AiJsonResponse["usage"] = { inputTokens: null, outputTokens: null };

    try {
      // Стрім, а не звичайний запит: на 32K токенах відповідь іде хвилину
      // й довше, і нестримінговий виклик встигає впертися в HTTP-таймаут SDK.
      // finalMessage() усе одно віддає зібране повідомлення цілком.
      const message = await this.client.messages
        .stream({
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: request.messages.map((item) => ({
            role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: item.content,
          })),
          // Адаптивне мислення: моделі 4.6+ самі вирішують глибину.
          // display: "omitted" — міркування нам не потрібні, а їх текст
          // помітно роздуває відповідь.
          ...(supportsAdaptiveThinking(this.model)
            ? { thinking: { type: "adaptive" as const, display: "omitted" as const } }
            : {}),
          tools: [
            {
              name: RESULT_TOOL,
              // Про порожні поля сказано прямо: без граматики модель радше
              // пропустить поле, яке в цьому місці ні до чого (items у блоці
              // highlight), ніж надішле його порожнім.
              description:
                "Return the result. Call this tool exactly once and include " +
                "every field the schema lists as required — where a field " +
                "does not apply, send an empty array or an empty string " +
                "instead of omitting it.",
              // Схему чистимо від обмежень, яких Anthropic не приймає:
              // вони нічого не додають (z.number().int() дописує межі
              // безпечного цілого), лише витрачають токени — і зламали б
              // запит, якби строгий режим колись увімкнули.
              input_schema: toAnthropicSchema(request.responseSchema),
            },
          ],
          // Без примусу модель могла б відповісти текстом замість виклику.
          tool_choice: { type: "tool", name: RESULT_TOOL },
          // temperature свідомо не передається: Opus 5, Opus 4.8 і Sonnet 5
          // відхиляють параметри семплінгу з 400. Форму відповіді задає схема
          // інструмента, тож керувати «творчістю» нема потреби.
        }, { signal: this.signal })
        .finalMessage();

      if (message.stop_reason === "refusal") {
        throw new AppError(
          "ai_refused",
          "Claude відмовився обробляти цей запит. Спробуйте іншу тему " +
            "або іншу модель у налаштуваннях.",
          422,
        );
      }

      if (message.stop_reason === "max_tokens") {
        throw new AppError(
          "ai_truncated",
          "Відповідь не помістилася в ліміт. Заберіть частину URL зі списку " +
            "або оберіть модель із коротшим міркуванням.",
          502,
        );
      }

      const result = message.content.find(
        (block) => block.type === "tool_use" && block.name === RESULT_TOOL,
      );

      if (!result || result.type !== "tool_use") {
        throw new AppError(
          "ai_empty_response",
          "Модель не повернула результат. Спробуйте ще раз.",
          502,
        );
      }

      // Аргументи інструмента SDK віддає вже розібраними — розбирати текст,
      // як для інших провайдерів, тут не доводиться.
      data = result.input;

      usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAiError(error);
    }

    return { data, usage, model: this.model };
  }
}

function toAiError(error: unknown): AppError {
  // Обрив із боку клієнта — перший, бо це не помилка провайдера й ні логів,
  // ні поради користувачеві не потребує.
  if (error instanceof Anthropic.APIUserAbortError) return abortedError();

  if (error instanceof Anthropic.AuthenticationError) {
    return new AppError(
      "ai_auth_error",
      "Anthropic відхилив ключ. Перевірте його в налаштуваннях.",
      502,
    );
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(
      "ai_rate_limited",
      "Перевищено ліміт запитів до Anthropic. Спробуйте за хвилину.",
      429,
    );
  }

  if (error instanceof Anthropic.NotFoundError) {
    return new AppError(
      "ai_model_not_found",
      "Модель недоступна за цим ключем. Оберіть іншу в налаштуваннях.",
      502,
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  // Окремої підказки про формат відповіді тут навмисно немає. Виклик
  // інструмента вміють усі моделі, які взагалі варто вибирати, а правило
  // «згадано json_schema — значить, змініть модель» ловило й 400 через нашу
  // власну схему: користувач бачив пораду, яка нічого не змінювала, а
  // справжня причина не доходила ні сюди, ні в логи.
  //
  // Тому будь-який 400 повертаємо як є: це майже завжди наш запит, а не
  // вибір користувача, і причина потрібна одразу — ТЗ уже не згенерувалося.
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[ai:anthropic] Anthropic відхилив запит:", error);
    return new AppError(
      "ai_bad_request",
      `Anthropic відхилив запит: ${message.slice(0, ERROR_PREVIEW_CHARS)}`,
      502,
    );
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError(
      "ai_unavailable",
      "Не вдалося звʼязатися з Anthropic. Перевірте мережу.",
      504,
    );
  }

  console.error("[ai:anthropic] непередбачена помилка:", error);
  return new AppError("ai_error", `Помилка Anthropic: ${message}`, 502);
}
