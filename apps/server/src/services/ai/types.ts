/**
 * Провайдер-агностичний контракт доступу до LLM (Adapter Pattern, розділ 3 ТЗ).
 *
 * Нічого специфічного для Gemini тут немає: щоб додати ще одного провайдера,
 * достатньо реалізувати AiProvider і дописати рядок у createProvider().
 * Доменні типи (SeoBrief тощо) цей шар теж не знає — він приймає схему
 * й повертає нерозібраний JSON, а валідує вже викликач.
 */

export type AiRole = "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiJsonRequest {
  /** Роль і правила — окремо від діалогу. */
  system: string;
  /**
   * Історія діалогу. Для одноразової генерації — одне повідомлення user,
   * для правок брифу через чат — уся історія.
   */
  messages: AiMessage[];
  /** JSON Schema очікуваної відповіді. */
  responseSchema: unknown;
  temperature?: number;
}

export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiJsonResponse {
  /** Розібраний, але ще не валідований JSON. */
  data: unknown;
  usage: AiUsage;
  model: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateJson(request: AiJsonRequest): Promise<AiJsonResponse>;
}
