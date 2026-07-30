import type { ParsedPage } from "@brief/shared";
import { languageName, normalizeLanguageTag } from "@brief/shared";

/**
 * Мова контенту визначається зі самих конкурентів: ТЗ може бути італійським,
 * шведським, грецьким — будь-яким. Хардкодити мову не можна.
 *
 * Основне джерело — атрибут <html lang>, він є майже завжди й не бреше.
 * Резерв — характерні літери в тексті, коли lang відсутній.
 *
 * Повертається пара «код + назва». Назва йде в промпт і в поле
 * SeoBrief.contentLanguage — модель розуміє «Italian», а не «it». Код
 * потрібен, щоб дістати правила саме цієї мови: вони лежать під кодом,
 * бо назву модель могла б повернути з варіаціями.
 */

export interface DetectedLanguage {
  /** Код ISO 639-1. */
  code: string;
  /** Англійська назва — те, що бачить модель. */
  name: string;
}

/** Літери, унікальні для мови, — резервний сигнал, якщо lang відсутній. */
const SCRIPT_HINTS: { pattern: RegExp; code: string }[] = [
  { pattern: /[іїєґ]/i, code: "uk" },
  { pattern: /[ыъэё]/i, code: "ru" },
  { pattern: /[α-ωΑ-Ω]/, code: "el" },
  { pattern: /[åäö]/i, code: "sv" },
  { pattern: /[æøå]/i, code: "da" },
  { pattern: /[ąćęłńóśźż]/i, code: "pl" },
  { pattern: /[ğışçö]/i, code: "tr" },
  { pattern: /[àèéìòù]/i, code: "it" },
  { pattern: /[äüöß]/i, code: "de" },
  { pattern: /[ñ¿¡]/i, code: "es" },
  { pattern: /[àâçéèêëîïôûù]/i, code: "fr" },
];

function fromLangAttribute(pages: readonly ParsedPage[]): string | null {
  const votes = new Map<string, number>();

  for (const page of pages) {
    // "it-IT" → "it"
    const code = normalizeLanguageTag(page.meta.lang);
    if (!code) continue;

    votes.set(code, (votes.get(code) ?? 0) + 1);
  }

  if (votes.size === 0) return null;

  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function fromText(pages: readonly ParsedPage[]): string | null {
  // Заголовків достатньо: вони короткі й майже завжди мовою сторінки.
  const sample = pages
    .flatMap((page) => page.headings.map((heading) => heading.text))
    .join(" ")
    .slice(0, 4000);

  if (!sample) return null;

  return SCRIPT_HINTS.find((hint) => hint.pattern.test(sample))?.code ?? null;
}

/**
 * Мова контенту. Резерв останньої надії — англійська: зрозумілий дефолт
 * краще за порожнє значення в промпті.
 */
export function detectContentLanguage(
  pages: readonly ParsedPage[],
): DetectedLanguage {
  const code = fromLangAttribute(pages) ?? fromText(pages) ?? "en";

  return { code, name: languageName(code) };
}
