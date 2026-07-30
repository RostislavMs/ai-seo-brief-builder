import type { AiProviderId } from "@brief/shared";
import type { AppConfig } from "../../config";
import { AppError } from "../../http/errors";
import { resolveActiveKey } from "../account/repository";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OpenAiProvider } from "./providers/openai";
import type { AiProvider } from "./types";

export type { AiProvider, AiJsonRequest, AiJsonResponse, AiMessage } from "./types";

/** Збірка провайдера за розшифрованим ключем користувача. */
export function createProvider(
  provider: AiProviderId,
  apiKey: string,
  model: string,
): AiProvider {
  switch (provider) {
    case "gemini":
      return new GeminiProvider(apiKey, model);
    case "openai":
      return new OpenAiProvider(apiKey, model);
    case "anthropic":
      return new AnthropicProvider(apiKey, model);
  }
}

export interface EffectiveProvider {
  provider: string;
  model: string;
  source: "user" | "none";
}

/** Що саме зараз обслуговує запити — без створення клієнта провайдера. */
export async function describeEffectiveProvider(
  config: AppConfig,
  userId: string,
): Promise<EffectiveProvider> {
  const key = await resolveActiveKey(config, userId);

  return key
    ? { provider: key.provider, model: key.model, source: "user" }
    : { provider: "—", model: "—", source: "none" };
}

/**
 * Провайдер для конкретного користувача — завжди його власним ключем.
 * Спільного серверного ключа немає: він означав би спільний ліміт і чужий
 * рахунок за токени. Уся решта коду (generateBrief, editBrief) працює
 * з готовим AiProvider і про це рішення не знає.
 */
export async function providerForUser(
  config: AppConfig,
  userId: string,
): Promise<AiProvider> {
  const key = await resolveActiveKey(config, userId);

  if (!key) {
    throw new AppError(
      "ai_not_configured",
      "Не додано ключа AI. Додайте свій ключ Gemini, OpenAI або Claude " +
        "у налаштуваннях.",
      503,
    );
  }

  return createProvider(key.provider, key.apiKey, key.model);
}
