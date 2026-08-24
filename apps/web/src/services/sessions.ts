import type {
  AnalysisResponse,
  ChatMessage,
  CreateMessageRequest,
  CreateSessionRequest,
  ImportSessionsResponse,
  PageAnalysis,
  SaveBriefRequest,
  SaveBriefResponse,
  SeoBrief,
  Session,
  SessionListResponse,
  SessionResponse,
  SessionSummary,
  SetOwnPageRequest,
  UpdateAnalysisRequest,
  UpdateSessionRequest,
} from "@brief/shared";
import { api } from "../lib/api";

/**
 * Робота із сесіями (розділ 5 ТЗ) через API акаунта.
 *
 * Раніше сесії жили в localStorage — тепер у Supabase, тому кожна функція
 * асинхронна. Розкладка операцій дрібна навмисно: спарсена сторінка важить
 * сотні кілобайт, і надсилати всю сесію щоразу, коли завершився один URL,
 * означало б гнати мегабайти на кожну дію.
 */

export type CreateSessionInput = CreateSessionRequest;

export async function listSessions(
  signal?: AbortSignal,
): Promise<SessionSummary[]> {
  const response = await api.get<SessionListResponse>("/sessions", signal);
  return response.sessions;
}

export async function loadSession(
  id: string,
  signal?: AbortSignal,
): Promise<Session> {
  const response = await api.get<SessionResponse>(`/sessions/${id}`, signal);
  return response.session;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<Session> {
  const response = await api.post<SessionResponse>("/sessions", input);
  return response.session;
}

export async function updateSession(
  id: string,
  patch: UpdateSessionRequest,
): Promise<Session> {
  const response = await api.patch<SessionResponse>(`/sessions/${id}`, patch);
  return response.session;
}

export function deleteSession(id: string): Promise<void> {
  return api.delete(`/sessions/${id}`);
}

/**
 * Ручна правка ТЗ.
 *
 * Окремо від updateSession, бо викликається інакше: не раз на дію
 * користувача, а сама, під час набору. У відповіді тому лише час запису —
 * updateSession віддавав би всю сесію разом із розібраними сторінками,
 * тобто сотні кілобайт на кожну паузу в наборі.
 *
 * `original` — машинна версія, і надсилається вона лише для сесій, ТЗ яких
 * зберегла версія до її появи: сервер запише її один раз, у порожню колонку.
 */
export async function saveBrief(
  sessionId: string,
  brief: SeoBrief,
  original?: SeoBrief,
): Promise<string> {
  const request: SaveBriefRequest = {
    brief,
    ...(original ? { original } : {}),
  };

  const response = await api.put<SaveBriefResponse>(
    `/sessions/${sessionId}/brief`,
    request,
  );

  return response.savedAt;
}

export async function saveAnalysis(
  sessionId: string,
  analysisId: string,
  patch: UpdateAnalysisRequest,
): Promise<PageAnalysis> {
  const response = await api.patch<AnalysisResponse>(
    `/sessions/${sessionId}/analyses/${analysisId}`,
    patch,
  );
  return response.analysis;
}

/**
 * Виключає сторінку з основи для ТЗ або повертає її в роботу.
 *
 * Той самий маршрут, що й збереження результату парсингу, але без `page`:
 * гнати в базу сотні кілобайт розібраного контенту заради одного прапорця
 * немає сенсу.
 */
export function setAnalysisExcluded(
  sessionId: string,
  analysisId: string,
  excluded: boolean,
): Promise<PageAnalysis> {
  return saveAnalysis(sessionId, analysisId, { excluded });
}

/**
 * Задає або замінює власну сторінку сесії. Разом із нею сервер скидає звіт
 * порівняння: він прив'язаний до конкретної адреси.
 */
export async function setOwnPage(
  sessionId: string,
  url: string,
): Promise<PageAnalysis> {
  const request: SetOwnPageRequest = { url };
  const response = await api.put<AnalysisResponse>(
    `/sessions/${sessionId}/own-page`,
    request,
  );

  return response.analysis;
}

export function clearOwnPage(sessionId: string): Promise<void> {
  return api.delete(`/sessions/${sessionId}/own-page`);
}

export async function addMessage(
  sessionId: string,
  input: CreateMessageRequest,
): Promise<ChatMessage> {
  const response = await api.post<{ message: ChatMessage }>(
    `/sessions/${sessionId}/messages`,
    input,
  );
  return response.message;
}

export function removeMessage(
  sessionId: string,
  messageId: string,
): Promise<void> {
  return api.delete(`/sessions/${sessionId}/messages/${messageId}`);
}

export function importSessions(
  sessions: readonly Session[],
): Promise<ImportSessionsResponse> {
  return api.post<ImportSessionsResponse>("/sessions/import", { sessions });
}
