import type {
  AnalysisResponse,
  ChatMessage,
  CreateMessageRequest,
  CreateSessionRequest,
  ImportSessionsResponse,
  PageAnalysis,
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
