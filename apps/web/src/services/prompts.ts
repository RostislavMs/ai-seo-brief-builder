import type {
  PromptHistoryResponse,
  PromptListResponse,
  PromptResponse,
  PromptTemplate,
  PromptVersion,
  UpdatePromptRequest,
} from "@brief/shared";
import { api } from "../lib/api";

/**
 * Промпти до моделі. Компоненти не знають ні шляхів, ні форми запитів.
 *
 * Перелік допустимих вставок приходить разом із текстом, а не зашитий у
 * компоненті: підстановку робить сервер, і про те, що можна написати в
 * конкретному промпті, має розповідати саме він.
 */

export function fetchPrompts(signal?: AbortSignal): Promise<PromptTemplate[]> {
  return api
    .get<PromptListResponse>("/prompts", signal)
    .then((response) => response.prompts);
}

/** Історія правок одного промпта — лише для адміна. */
export function fetchPromptHistory(
  key: string,
  signal?: AbortSignal,
): Promise<PromptVersion[]> {
  return api
    .get<PromptHistoryResponse>(
      `/prompts/${encodeURIComponent(key)}/history`,
      signal,
    )
    .then((response) => response.versions);
}

/**
 * Зберігає новий текст промпта. Текст, що дослівно дорівнює початковому,
 * сервер приймає як скидання — клієнту цю різницю розрізняти не треба.
 */
export async function savePrompt(
  key: string,
  body: string,
  note: string | null,
): Promise<PromptTemplate> {
  const request: UpdatePromptRequest = { body, note };
  const response = await api.put<PromptResponse>(
    `/prompts/${encodeURIComponent(key)}`,
    request,
  );

  return response.prompt;
}

/** Повертає промпт до початкового тексту з коду. */
export async function resetPrompt(key: string): Promise<PromptTemplate> {
  const response = await api.delete<PromptResponse>(
    `/prompts/${encodeURIComponent(key)}`,
  );

  return response.prompt;
}
