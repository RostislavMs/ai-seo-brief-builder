import type {
  AiKeySummary,
  AiProviderId,
  FetchKeyStatus,
  FetchKeySummary,
  FetchServiceId,
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

/* ── Платні сервіси доступу до сторінок ───────────────────────────────────── */

/**
 * Ключ сервісу доступу перевіряється на сервері живим запитом, тому у відповіді
 * одразу приходить і стан рахунку — окремого запиту після збереження не треба.
 */
export async function saveFetchKey(
  service: FetchServiceId,
  apiKey: string,
): Promise<{ key: FetchKeySummary; status: FetchKeyStatus }> {
  return api.put<{ key: FetchKeySummary; status: FetchKeyStatus }>(
    `/fetch-keys/${service}`,
    { apiKey },
  );
}

export function removeFetchKey(service: FetchServiceId): Promise<void> {
  return api.delete(`/fetch-keys/${service}`);
}

/** Залишок кредитів за вже збереженим ключем. */
export function fetchKeyStatus(
  service: FetchServiceId,
  signal?: AbortSignal,
): Promise<FetchKeyStatus> {
  return api.get<FetchKeyStatus>(`/fetch-keys/${service}/status`, signal);
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
