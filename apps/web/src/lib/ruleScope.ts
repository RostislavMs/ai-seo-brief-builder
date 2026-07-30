import { ALL_LANGUAGES, languageByCode } from "@brief/shared";

/**
 * Підписи області дії правила для інтерфейсу.
 *
 * Окремо від реєстру мов: там англійські назви для моделі, а тут українські
 * для людини. «*» узагалі не мова, і назви в реєстрі в нього немає.
 */

export const ALL_LANGUAGES_LABEL = "Усі мови";

/** Головний підпис: «Усі мови» або англійська назва мови. */
export function scopeName(code: string): string {
  if (code === ALL_LANGUAGES) return ALL_LANGUAGES_LABEL;
  return languageByCode(code)?.name ?? code;
}

/** Другорядний підпис: самоназва мови. null — для «усіх мов» її не існує. */
export function scopeNativeName(code: string): string | null {
  if (code === ALL_LANGUAGES) return null;
  return languageByCode(code)?.nativeName ?? null;
}

/** «Italian · italiano» або «Усі мови» — для заголовків і бейджів. */
export function scopeFullName(code: string): string {
  const native = scopeNativeName(code);
  return native ? `${scopeName(code)} · ${native}` : scopeName(code);
}
