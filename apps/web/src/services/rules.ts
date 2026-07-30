import type {
  CreateLanguageRuleRequest,
  LanguageRule,
  LanguageRuleCount,
  LanguageRuleCountsResponse,
  LanguageRuleListResponse,
  LanguageRuleResponse,
  UpdateLanguageRuleRequest,
} from "@brief/shared";
import { api } from "../lib/api";

/**
 * Правила для мов. Компоненти не знають ні шляхів, ні форми запитів.
 *
 * Що саме повернеться, вирішує роль на сервері: адмін бачить усі правила,
 * решта — чинні плюс власні пропозиції. Клієнт цього не вибирає й не
 * має вибирати.
 */

/** @param languageCode код ISO 639-1 або `ALL_LANGUAGES` (`"*"`). */
export function fetchLanguageRules(
  languageCode: string,
  signal?: AbortSignal,
): Promise<LanguageRule[]> {
  const query = encodeURIComponent(languageCode);

  return api
    .get<LanguageRuleListResponse>(`/rules?language=${query}`, signal)
    .then((response) => response.rules);
}

/** Черга розгляду: для адміна — усі мови, для решти — власні пропозиції. */
export function fetchPendingRules(signal?: AbortSignal): Promise<LanguageRule[]> {
  return api
    .get<LanguageRuleListResponse>("/rules?status=pending", signal)
    .then((response) => response.rules);
}

export function fetchRuleCounts(
  signal?: AbortSignal,
): Promise<LanguageRuleCount[]> {
  return api
    .get<LanguageRuleCountsResponse>("/rules/languages", signal)
    .then((response) => response.counts);
}

/**
 * У користувача виходить пропозиція, в адміна — одразу чинне правило.
 * Запит однаковий: різницю робить роль на сервері.
 */
export async function createLanguageRule(
  languageCode: string,
  rule: string,
): Promise<LanguageRule> {
  const request: CreateLanguageRuleRequest = { languageCode, rule };
  const response = await api.post<LanguageRuleResponse>("/rules", request);

  return response.rule;
}

/** Розгляд, правка тексту, вмикання й вимикання — лише для адміна. */
export async function updateLanguageRule(
  id: string,
  patch: UpdateLanguageRuleRequest,
): Promise<LanguageRule> {
  const response = await api.patch<LanguageRuleResponse>(`/rules/${id}`, patch);
  return response.rule;
}

export function deleteLanguageRule(id: string): Promise<void> {
  return api.delete(`/rules/${id}`);
}
