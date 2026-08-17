import type { AiProviderId } from "@brief/shared";
import type { AppConfig } from "../../config";
import { AppError } from "../../http/errors";
import { resolveActiveKey } from "../account/repository";
import { aiDeadline, type AiDeadline } from "./deadline";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OpenAiProvider } from "./providers/openai";
import type { AiProvider } from "./types";

export type { AiProvider, AiJsonRequest, AiJsonResponse, AiMessage } from "./types";
export { requestJson } from "./request";
export type { ValidatedResponse } from "./request";
export { aiDeadline } from "./deadline";
export type { AiDeadline } from "./deadline";

/**
 * Збірка провайдера за розшифрованим ключем користувача.
 *
 * `deadline` — стеля часу разом із сигналом розриву HTTP-запиту (deadline.ts).
 * Вона в провайдері, а не в кожному виклику generateJson, бо провайдер і так
 * створюється на один запит: так і скасування, і вичерпаний бюджет доходять до
 * SDK, а generateBrief, editBrief і comparePage лишаються без жодного знання
 * про HTTP.
 */
export function createProvider(
  provider: AiProviderId,
  apiKey: string,
  model: string,
  deadline?: AiDeadline,
): AiProvider {
  switch (provider) {
    case "gemini":
      return new GeminiProvider(apiKey, model, deadline);
    case "openai":
      return new OpenAiProvider(apiKey, model, deadline);
    case "anthropic":
      return new AnthropicProvider(apiKey, model, deadline);
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
 *
 * `signal` варто передавати всюди, де запит довгий: без нього кнопка
 * «Скасувати» в інтерфейсі звільняє лише браузер, а модель доробляє відповідь
 * у нікуди за гроші користувача.
 *
 * Стеля часу збирається тут же, з config.aiBudgetMs: маршрутам не треба знати
 * ні про бюджет, ні про те, що їх колись уб'є ліміт функції.
 *
 * Спільного серверного ключа немає: він означав би спільний ліміт і чужий
 * рахунок за токени. Уся решта коду (generateBrief, editBrief) працює
 * з готовим AiProvider і про це рішення не знає.
 */
export async function providerForUser(
  config: AppConfig,
  userId: string,
  signal?: AbortSignal,
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

  return createProvider(
    key.provider,
    key.apiKey,
    key.model,
    aiDeadline(config.aiBudgetMs, signal),
  );
}
