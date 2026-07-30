import type { PageAnalysis, ParsedPage } from "@brief/shared";

/**
 * Які сторінки сесії йдуть у роботу.
 *
 * Одна умова на всі виклики навмисно. Генерація ТЗ, правки через чат,
 * порівняння власної сторінки й лічильник у вкладці «Аналіз» мають розуміти
 * «сторінки конкурентів» однаково: розійтися тут означало б показувати «8
 * сторінок», а складати ТЗ із семи — і не мати жодного способу це побачити.
 *
 * Виключення діє на всі три сценарії, а не лише на ТЗ. Причина в тому, що
 * прапорець означає «ця сторінка не годиться як зразок», а не «не потрібна
 * саме тут»: сторінка, яку не варто брати за основу ТЗ, так само не варта
 * того, щоб проти неї міряли власну.
 */

/** Сторінка розібрана успішно і не виключена вручну. */
export function isUsable(analysis: PageAnalysis): boolean {
  return analysis.status === "success" && analysis.page !== null && !analysis.excluded;
}

/** Розібраний контент сторінок, які йдуть у промпт. */
export function usablePages(
  analyses: readonly PageAnalysis[],
): ParsedPage[] {
  return analyses.filter(isUsable).map((analysis) => analysis.page!);
}

/** Скільки сторінок розібрано успішно — разом із виключеними. */
export function readyCount(analyses: readonly PageAnalysis[]): number {
  return analyses.filter(
    (analysis) => analysis.status === "success" && analysis.page !== null,
  ).length;
}
