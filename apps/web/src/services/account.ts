import type {
  AiKeySummary,
  AiProviderId,
  MeResponse,
  ModelsResponse,
  UpdateSettingsRequest,
  UserProfile,
  UserSettings,
} from "@brief/shared";
import { api } from "../lib/api";

/**
 * Профіль, ключі провайдерів і налаштування.
 * Компоненти працюють лише через ці функції — шляхи /api живуть тут.
 */

export function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  return api.get<MeResponse>("/me", signal);
}

export async function saveDisplayName(
  displayName: string | null,
): Promise<UserProfile> {
  const response = await api.patch<{ profile: UserProfile }>("/me", {
    displayName,
  });
  return response.profile;
}

export async function saveApiKey(
  provider: AiProviderId,
  apiKey: string,
  model: string,
): Promise<AiKeySummary> {
  const response = await api.put<{ key: AiKeySummary }>(`/keys/${provider}`, {
    apiKey,
    model,
  });
  return response.key;
}

export async function changeKeyModel(
  provider: AiProviderId,
  model: string,
): Promise<AiKeySummary[]> {
  const response = await api.patch<{ keys: AiKeySummary[] }>(
    `/keys/${provider}`,
    { model },
  );
  return response.keys;
}

export function removeApiKey(provider: AiProviderId): Promise<void> {
  return api.delete(`/keys/${provider}`);
}

export async function saveSettings(
  patch: UpdateSettingsRequest,
): Promise<UserSettings> {
  const response = await api.patch<{ settings: UserSettings }>(
    "/settings",
    patch,
  );
  return response.settings;
}

/** Моделі, доступні за вже збереженим ключем. */
export function fetchModels(
  provider: AiProviderId,
  signal?: AbortSignal,
): Promise<ModelsResponse> {
  return api.get<ModelsResponse>(`/models/${provider}`, signal);
}

/**
 * Моделі за щойно введеним ключем — до того, як його збережено.
 * Дає обрати модель одразу, а не наосліп із каталогу.
 */
export function previewModels(
  provider: AiProviderId,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelsResponse> {
  return api.post<ModelsResponse>(
    `/models/${provider}/preview`,
    { apiKey },
    signal,
  );
}
