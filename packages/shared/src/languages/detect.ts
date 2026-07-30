import type { ParsedPage } from "../types/page";
import { languageName, normalizeLanguageTag } from "./registry";

/**
 * Мова контенту визначається зі самих конкурентів: ТЗ може бути італійським,
 * шведським, грецьким — будь-яким. Хардкодити мову не можна.
 *
 * Основне джерело — атрибут <html lang>, він є майже завжди й не бреше.
 * Резерв — характерні літери в тексті, коли lang відсутній.
 *
 * Функція живе в `shared`, а не на сервері, навмисно. Мова показується у
 * вкладці «Аналіз» і використовується при генерації ТЗ; дві реалізації того
 * самого голосування розійшлися б, і користувач бачив би одну мову, а в промпт
 * ішла б інша. Одна функція — одна відповідь на обох сторонах.
 *
 * Разом із результатом повертаються й підстави: скільком сторінкам вірили,
 * скільки з них погодилися і що казали інші. Без них «Italian» — це число з
 * нізвідки, і зрозуміти, чому мова визначена неправильно, неможливо.
 */

/** Звідки взялася мова: тег, текст або дефолт останньої надії. */
export type LanguageSource = "tag" | "text" | "fallback";

export interface LanguageDetection {
  /** Код ISO 639-1. */
  code: string;
  /** Англійська назва — те, що бачить модель. */
  name: string;
  source: LanguageSource;
  /** Скільки сторінок узагалі враховано. */
  pages: number;
  /** Скільки з них мають придатний <html lang>. */
  tagged: number;
  /** Скільки з них назвали саму цю мову. */
  agreed: number;
  /**
   * Інші коди, які трапилися в <html lang>, від найчастішого.
   * Непорожній список означає, що сторінки між собою не згодні.
   */
  conflicts: string[];
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

interface Votes {
  /** Коди від найчастішого; порожній масив — жоден тег не придатний. */
  ranked: string[];
  counts: Map<string, number>;
  tagged: number;
}

function fromLangAttribute(pages: readonly ParsedPage[]): Votes {
  const counts = new Map<string, number>();
  let tagged = 0;

  for (const page of pages) {
    // "it-IT" → "it"
    const code = normalizeLanguageTag(page.meta.lang);
    if (!code) continue;

    tagged += 1;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code);

  return { ranked, counts, tagged };
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
): LanguageDetection {
  const votes = fromLangAttribute(pages);
  const winner = votes.ranked[0];
  // Текст читаємо лише коли теги не дали відповіді: це прохід по всіх
  // заголовках усіх сторінок, і робити його про запас нема сенсу.
  const guessed = winner ? null : fromText(pages);

  const code = winner ?? guessed ?? "en";
  const source: LanguageSource = winner ? "tag" : guessed ? "text" : "fallback";

  return {
    code,
    name: languageName(code),
    source,
    pages: pages.length,
    tagged: votes.tagged,
    agreed: votes.counts.get(code) ?? 0,
    conflicts: votes.ranked.filter((other) => other !== code),
  };
}

/**
 * Мова, якою складається ТЗ: вибір користувача, якщо він є, інакше визначена.
 *
 * Обидві сторони проходять через цю функцію, тому «що піде в промпт» ніде не
 * обчислюється вдруге. Невідомий код зневажається, а не підставляється в
 * промпт як є: `languageName()` повернула б сам код, і модель отримала б
 * інструкцію писати мовою «xx».
 */
export function resolveContentLanguage(
  detected: LanguageDetection,
  override: string | null | undefined,
): { code: string; name: string; overridden: boolean } {
  const code = override?.trim().toLowerCase();
  const name = code ? languageName(code) : null;

  // languageName() для невідомого коду повертає сам код — за цим і видно,
  // що мови в реєстрі немає.
  if (!code || !name || name === code) {
    return { code: detected.code, name: detected.name, overridden: false };
  }

  return { code, name, overridden: code !== detected.code };
}
