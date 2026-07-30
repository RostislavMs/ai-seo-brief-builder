import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AiProviderId } from "@brief/shared";
import { AppError } from "../../http/errors";

/**
 * Живий перелік моделей провайдера.
 *
 * Каталог у @brief/shared описує ціни й мітки, але не доступність: набір
 * моделей залежить від ключа, тарифу й регіону. Тому інтерфейс завжди
 * питає самого провайдера, а каталог лише збагачує відповідь.
 *
 * Цей самий виклик слугує перевіркою ключа: якщо перелік прийшов —
 * ключ живий, і немає сенсу дізнаватися про помилку вже після хвилини
 * очікування першого ТЗ.
 */

/**
 * Провайдери віддають упереміш усе, що вміють: озвучення, зображення,
 * ембединги, робототехніку. Для генерації ТЗ це шум, і в списку вибору
 * його бути не має.
 */
const NON_TEXT = [
  "tts",
  "image",
  "audio",
  "realtime",
  "transcribe",
  "embedding",
  "moderation",
  "robotics",
  "computer-use",
  "lyria",
  "veo",
  "imagen",
  "banana",
  "dall-e",
  "whisper",
  "codex",
  "instruct",
  "search",
  "deep-research",
  "antigravity",
];

function isTextModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_TEXT.some((marker) => lower.includes(marker));
}

interface GeminiModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

async function listGemini(apiKey: string): Promise<string[]> {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
    { headers: { "x-goog-api-key": apiKey } },
  );

  if (!response.ok) {
    throw statusError("Gemini", response.status);
  }

  const body = (await response.json()) as { models?: GeminiModel[] };

  return (body.models ?? [])
    .filter((model) =>
      (model.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((model) => (model.name ?? "").replace(/^models\//, ""))
    .filter((id) => id.length > 0 && isTextModel(id))
    // Gemma — відкриті моделі без підтримки JSON-схеми у відповіді.
    .filter((id) => !id.startsWith("gemma"));
}

async function listOpenAi(apiKey: string): Promise<string[]> {
  const client = new OpenAI({ apiKey });
  const ids: string[] = [];

  for await (const model of client.models.list()) {
    // Список OpenAI містить і чужі сімейства (whisper, dall-e, tts).
    // Лишаємо лише чатові gpt-* та reasoning-моделі o*.
    if (!/^(gpt-|o\d)/.test(model.id)) continue;
    if (!isTextModel(model.id)) continue;
    // Датовані знімки на кшталт gpt-4.1-2025-04-14 дублюють аліас
    // і роблять список утричі довшим без користі.
    if (/-\d{4}-\d{2}-\d{2}$/.test(model.id)) continue;
    ids.push(model.id);
  }

  return ids;
}

async function listAnthropic(apiKey: string): Promise<string[]> {
  const client = new Anthropic({ apiKey });
  const ids: string[] = [];

  for await (const model of client.models.list()) {
    if (isTextModel(model.id)) ids.push(model.id);
  }

  return ids;
}

function statusError(provider: string, status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(
      "ai_auth_error",
      `${provider} відхилив ключ. Перевірте, що скопіювали його повністю.`,
      400,
    );
  }

  if (status === 429) {
    return new AppError(
      "ai_rate_limited",
      `${provider} обмежив частоту запитів. Спробуйте за хвилину.`,
      429,
    );
  }

  return new AppError(
    "ai_unavailable",
    `${provider} відповів помилкою ${status}.`,
    502,
  );
}

function toListError(provider: AiProviderId, error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (
    error instanceof OpenAI.APIError ||
    error instanceof Anthropic.APIError
  ) {
    return statusError(provider, error.status ?? 502);
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[models:${provider}] не вдалося отримати перелік:`, error);

  return new AppError(
    "ai_unavailable",
    `Не вдалося отримати перелік моделей ${provider}: ${message}`,
    502,
  );
}

/**
 * Перелік моделей, доступних за цим ключем.
 * Кидає AppError із людською причиною — виклик у /api/keys покладається
 * на це, щоб не зберегти неробочий ключ.
 */
export async function listModels(
  provider: AiProviderId,
  apiKey: string,
): Promise<string[]> {
  try {
    switch (provider) {
      case "gemini":
        return await listGemini(apiKey);
      case "openai":
        return await listOpenAi(apiKey);
      case "anthropic":
        return await listAnthropic(apiKey);
    }
  } catch (error) {
    throw toListError(provider, error);
  }
}
