import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../../../http/errors";
import type { AiJsonRequest, AiJsonResponse, AiProvider } from "../types";

const ERROR_PREVIEW_CHARS = 300;

/**
 * Стеля відповіді. ТЗ на велику статтю — це кілька десятків тисяч токенів
 * JSON, плюс адаптивне мислення рахується в цей самий ліміт.
 */
const MAX_TOKENS = 32_000;

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async generateJson(request: AiJsonRequest): Promise<AiJsonResponse> {
    let text: string | undefined;
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
          thinking: { type: "adaptive", display: "omitted" },
          output_config: {
            format: {
              type: "json_schema",
              schema: request.responseSchema as Record<string, unknown>,
            },
          },
          // temperature свідомо не передається: Opus 5, Opus 4.8 і Sonnet 5
          // відхиляють параметри семплінгу з 400. Формат тут і так жорстко
          // заданий схемою, тож керувати «творчістю» нема потреби.
        })
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

      text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toAiError(error);
    }

    if (!text.trim()) {
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

  // Структуровану відповідь підтримують не всі моделі Claude. Каталог
  // пропонує лише сумісні, але користувач міг обрати модель зі списку,
  // отриманого від API, — тоді підказка має бути конкретною.
  if (/output_config|json_schema|structured/i.test(message)) {
    return new AppError(
      "ai_schema_unsupported",
      "Ця модель Claude не підтримує строгий JSON-формат відповіді. " +
        "Оберіть модель із міткою в налаштуваннях (Opus 5, Sonnet 5, Haiku 4.5).",
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
