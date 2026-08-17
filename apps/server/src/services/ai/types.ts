/**
 * Провайдер-агностичний контракт доступу до LLM (Adapter Pattern, розділ 3 ТЗ).
 *
 * Нічого специфічного для Gemini тут немає: щоб додати ще одного провайдера,
 * достатньо реалізувати AiProvider і дописати рядок у createProvider().
 * Доменні типи (SeoBrief тощо) цей шар теж не знає — він приймає схему
 * й повертає нерозібраний JSON, а валідує вже викликач.
 */

import type { AiDeadline } from "./deadline";

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
  /**
   * Стеля часу на роботу з моделлю (deadline.ts). Живе на провайдері, бо він
   * створюється на один запит — рівно той самий термін життя, що й у сигналу
   * розриву, який у нього вже є.
   *
   * Потрібна не самому провайдеру, а requestJson: той вирішує, чи є ще час на
   * другу спробу, і чим саме закінчився обірваний запит.
   */
  readonly deadline?: AiDeadline;
  generateJson(request: AiJsonRequest): Promise<AiJsonResponse>;
}
