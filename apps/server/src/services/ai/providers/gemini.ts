import { GoogleGenAI } from "@google/genai";
import { abortedError, AppError } from "../../../http/errors";
import type { AiDeadline } from "../deadline";
import type { AiJsonRequest, AiJsonResponse, AiProvider } from "../types";

/** Скільки символів відповіді показувати в помилці розбору. */
const ERROR_PREVIEW_CHARS = 300;

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    /**
     * Стеля часу разом із сигналом розриву — як і в решти провайдерів
     * (deadline.ts).
     *
     * Google про свій abortSignal попереджає прямо: він скасовує лише
     * очікування на боці клієнта, а не роботу сервісу, і токени спишуться
     * повністю. Передаємо все одно — звільнити зʼєднання й не тримати
     * функцію Nitro теж варто.
     */
    readonly deadline?: AiDeadline,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /** Решта класу працює з сигналом, а не з бюджетом — він її не стосується. */
  private get signal(): AbortSignal | undefined {
    return this.deadline?.signal;
  }

  async generateJson(request: AiJsonRequest): Promise<AiJsonResponse> {
    let text: string | undefined;
    let usage: AiJsonResponse["usage"] = { inputTokens: null, outputTokens: null };

    // SDK Google підписується на майбутній обрив, але вже обірваний сигнал
    // не перевіряє — і надсилає запит попри нього. Помітно це в другій спробі
    // requestJson(), якщо скасувати між спробами: у Anthropic і OpenAI їхні
    // SDK такий запит навіть не відправляють, а тут заплатили б за нього.
    if (this.signal?.aborted) throw abortedError();

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.messages.map((message) => ({
          // У Gemini відповідь моделі має роль "model", а не "assistant".
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: request.responseSchema,
          temperature: request.temperature ?? 0.4,
          ...(this.signal ? { abortSignal: this.signal } : {}),
        },
      });

      text = response.text;
      usage = {
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      };
    } catch (error) {
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

/** Перекладає помилки SDK у зрозумілі користувачеві повідомлення. */
function toAiError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);

  // Типізованого класу для обриву в цьому SDK немає, тому по імені винятку:
  // AbortError кидає сам fetch, коли signal спрацював.
  if (error instanceof Error && error.name === "AbortError") {
    return abortedError();
  }

  if (/api[_ ]?key|API_KEY_INVALID|permission|401|403/i.test(message)) {
    return new AppError(
      "ai_auth_error",
      "Gemini відхилив ключ. Перевірте NITRO_GEMINI_API_KEY.",
      502,
    );
  }

  if (/quota|rate limit|RESOURCE_EXHAUSTED|429/i.test(message)) {
    return new AppError(
      "ai_rate_limited",
      "Перевищено ліміт запитів до Gemini. Спробуйте за хвилину.",
      429,
    );
  }

  if (/not found|NOT_FOUND|404/i.test(message)) {
    return new AppError(
      "ai_model_not_found",
      `Модель недоступна за цим ключем. Перевірте NITRO_GEMINI_MODEL. (${message})`,
      502,
    );
  }

  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    return new AppError(
      "ai_unavailable",
      "Не вдалося звʼязатися з Gemini. Перевірте мережу.",
      504,
    );
  }

  console.error("[ai:gemini] непередбачена помилка:", error);
  return new AppError("ai_error", `Помилка Gemini: ${message}`, 502);
}
