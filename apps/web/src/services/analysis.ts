import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BriefRequest,
  BriefResponse,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  CompareRequest,
  CompareResponse,
  PageAnalysis,
  PageComparison,
  ParsedPage,
  RequirementsResponse,
  SeoBrief,
} from "@brief/shared";
import { api } from "../lib/api";

/**
 * Звернення до бекенда. Компоненти не знають ні шляхів, ні форми запитів.
 *
 * Кожен URL відправляється окремим запитом, хоча /api/analyze приймає масив.
 * Так рядки в інтерфейсі заповнюються по мірі готовності, а не всі
 * одночасно після найповільнішої сторінки.
 */
export async function analyzeUrl(
  url: string,
  signal?: AbortSignal,
): Promise<PageAnalysis> {
  const request: AnalyzeRequest = { urls: [url] };
  const response = await api.post<AnalyzeResponse>("/analyze", request, signal);
  const result = response.results[0];

  if (!result) {
    throw new Error(`Сервер не повернув результат для ${url}`);
  }

  return result;
}

/**
 * `languageCode` передається лише тоді, коли користувач задав мову вручну.
 * Без нього сервер визначає її зі сторінок тією самою функцією, якою вкладка
 * «Аналіз» показує визначену мову.
 */
export async function requestBrief(
  topic: string,
  pages: readonly ParsedPage[],
  languageCode: string | null,
  signal?: AbortSignal,
): Promise<SeoBrief> {
  const request: BriefRequest = {
    topic,
    pages: [...pages],
    ...(languageCode ? { languageCode } : {}),
  };
  const response = await api.post<BriefResponse>("/brief", request, signal);

  return response.brief;
}

/**
 * Чинний текст постійних вимог до тексту.
 *
 * Не входить у відповідь генерації навмисно: вимоги однакові для всіх ТЗ і
 * від сесії не залежать, тому читаються один раз, а не приїжджають у кожній
 * відповіді моделі.
 */
export function fetchRequirements(signal?: AbortSignal): Promise<string> {
  return api
    .get<RequirementsResponse>("/brief/requirements", signal)
    .then((response) => response.requirements);
}

/**
 * Аналіз власної сторінки відносно конкурентів.
 * Наявне ТЗ у запит не входить — порівняння працює й без нього.
 */
export async function requestComparison(
  topic: string,
  page: ParsedPage,
  competitors: readonly ParsedPage[],
  languageCode: string | null,
  signal?: AbortSignal,
): Promise<PageComparison> {
  const request: CompareRequest = {
    topic,
    page,
    competitors: [...competitors],
    ...(languageCode ? { languageCode } : {}),
  };
  const response = await api.post<CompareResponse>("/compare", request, signal);

  return response.comparison;
}

export interface ChatInput {
  topic: string;
  brief: SeoBrief;
  history: readonly ChatMessage[];
  message: string;
  pages: readonly ParsedPage[];
}

/** Правка ТЗ через діалог. brief у відповіді = null, якщо змін не було. */
export async function sendChatMessage(
  input: ChatInput,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const request: ChatRequest = {
    topic: input.topic,
    brief: input.brief,
    history: [...input.history],
    message: input.message,
    pages: [...input.pages],
  };

  return api.post<ChatResponse>("/chat", request, signal);
}
