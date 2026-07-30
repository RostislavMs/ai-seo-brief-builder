/** Нормалізація тексту, витягнутого з HTML. */

// Невидимі символи, якими рясніє реальний HTML:
// soft hyphen, zero-width space/non-joiner/joiner, LTR/RTL-марки, BOM.
const INVISIBLE = /[­​-‏⁠﻿]/g;

// Пробіли, які не є звичайним U+0020: nbsp, narrow nbsp, ideographic space.
const NBSP = /[   　]/g;

/** Стискає пробіли й прибирає невидимі символи — для однорядкових значень. */
export function normalizeText(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    .replace(NBSP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Те саме, але зберігає переноси рядків — для багаторядкових відповідей FAQ. */
export function normalizeBlock(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    .replace(NBSP, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Кількість слів. Токен вважається словом, лише якщо містить літеру або цифру,
 * тому пунктуація не роздуває результат. \p{L} покриває кирилицю.
 */
export function countWords(text: string): number {
  if (!text) return 0;

  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count += 1;
  }
  return count;
}

/** Відсіює службові уривки на кшталт «Читати далі» чи «© 2024». */
export function isMeaningful(text: string, minWords = 4): boolean {
  return countWords(text) >= minWords;
}
