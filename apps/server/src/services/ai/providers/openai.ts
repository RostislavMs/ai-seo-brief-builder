import OpenAI from "openai";
import { abortedError, AppError } from "../../../http/errors";
import type { AiDeadline } from "../deadline";
import type { AiJsonRequest, AiJsonResponse, AiProvider } from "../types";

const ERROR_PREVIEW_CHARS = 300;

/** Reasoning-моделі витрачають частину ліміту на міркування — беремо запас. */
const MAX_COMPLETION_TOKENS = 32_000;

/**
 * Тільки лінійка gpt-4* приймає temperature. gpt-5 та o-series відхиляють
 * будь-яке значення, крім типового, тому їм параметр не надсилається.
 */
function acceptsTemperature(model: string): boolean {
  return model.startsWith("gpt-4");
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    /**
     * Стеля часу разом із сигналом розриву — як і в решти провайдерів
     * (deadline.ts).
     *
     * Тут сигнал звільняє користувача від очікування, але не рахунок: запит
     * нестримінговий, і OpenAI доводить генерацію до кінця незалежно від
     * того, чи хтось слухає. Обірвати саму генерацію можна лише стрімом.
     */
    readonly deadline?: AiDeadline,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  /** Решта класу працює з сигналом, а не з бюджетом — він її не стосується. */
  private get signal(): AbortSignal | undefined {
    return this.deadline?.signal;
  }

  async generateJson(request: AiJsonRequest): Promise<AiJsonResponse> {
    let text: string | null | undefined;
    let usage: AiJsonResponse["usage"] = { inputTokens: null, outputTokens: null };

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        // Роль system окремим повідомленням: у Chat Completions немає
        // окремого поля для системної інструкції.
        messages: [
          { role: "system", content: request.system },
          ...request.messages.map((item) => ({
            role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: item.content,
          })),
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "seo_brief",
            // strict: false навмисно. Строгий режим OpenAI вимагає
            // additionalProperties: false на кожному об'єкті й усі поля
            // в required — схема ТЗ має необов'язкові поля, і підганяти
            // її під один провайдер означало б зіпсувати для решти.
            strict: false,
            schema: request.responseSchema as Record<string, unknown>,
          },
        },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        ...(acceptsTemperature(this.model) && request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
      }, { signal: this.signal });

      const choice = response.choices[0];

      if (choice?.finish_reason === "length") {
        throw new AppError(
          "ai_truncated",
          "Відповідь не помістилася в ліміт токенів. Заберіть частину URL " +
            "зі списку або оберіть іншу модель.",
          502,
        );
      }

      if (choice?.finish_reason === "content_filter") {
        throw new AppError(
          "ai_refused",
          "OpenAI заблокував відповідь фільтром контенту.",
          422,
        );
      }

      text = choice?.message?.content;
      usage = {
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAiError(error);
    }

    if (!text || !text.trim()) {
      throw new AppError(
        "ai_empty_response",
        "Модель повернула порожню відповідь. Спробуйте ще раз.",
        502,
      );
    }

    try {
      return { data: JSON.parse(text) as unknown, usage, model: this.model };
    } catch {
      throw new AppError(
        "ai_invalid_json",
        `Модель повернула не JSON: ${text.slice(0, ERROR_PREVIEW_CHARS)}`,
        502,
      );
    }
  }
}

function toAiError(error: unknown): AppError {
  if (error instanceof OpenAI.APIUserAbortError) return abortedError();

  if (error instanceof OpenAI.AuthenticationError) {
    return new AppError(
      "ai_auth_error",
      "OpenAI відхилив ключ. Перевірте його в налаштуваннях.",
      502,
    );
  }

  if (error instanceof OpenAI.RateLimitError) {
    return new AppError(
      "ai_rate_limited",
      "Перевищено ліміт запитів до OpenAI (або вичерпано баланс). " +
        "Спробуйте за хвилину.",
      429,
    );
  }

  if (error instanceof OpenAI.NotFoundError) {
    return new AppError(
      "ai_model_not_found",
      "Модель недоступна за цим ключем. Оберіть іншу в налаштуваннях.",
      502,
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  // Найчастіша проблема сумісності: стара або надто мала модель
  // не підтримує json_schema. Підказка має вести до вибору моделі.
  if (/response_format|json_schema/i.test(message)) {
    return new AppError(
      "ai_schema_unsupported",
      "Ця модель OpenAI не підтримує відповідь за JSON-схемою. " +
        "Оберіть модель із міткою в налаштуваннях (GPT-5, GPT-4.1).",
      502,
    );
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return new AppError(
      "ai_unavailable",
      "Не вдалося звʼязатися з OpenAI. Перевірте мережу.",
      504,
    );
  }

  console.error("[ai:openai] непередбачена помилка:", error);
  return new AppError("ai_error", `Помилка OpenAI: ${message}`, 502);
}
