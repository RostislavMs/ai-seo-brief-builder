import { useState } from "react";
import type { ComparisonKeyword } from "@brief/shared";
import { plural } from "../../lib/format";

interface KeywordGapsProps {
  keywords: readonly ComparisonKeyword[];
}

/**
 * Ключі конкурентів і те, скільки разів кожен трапляється на власній сторінці.
 *
 * Обидва числа порахував сервер по повному тексту сторінок, а не модель:
 * пошук підрядка дає точну відповідь, а оцінка на око — приблизну, яку потім
 * ніяк не звірити.
 *
 * За замовчуванням показані лише відсутні: список у вісім десятків рядків
 * складається переважно з того, що вже й так є, і прогалини в ньому тонуть.
 */
export function KeywordGaps({ keywords }: KeywordGapsProps) {
  const [showAll, setShowAll] = useState(false);

  if (keywords.length === 0) return null;

  const missing = keywords.filter((keyword) => keyword.occurrences === 0);
  // Немає жодної прогалини — фільтр не має сенсу, показуємо все як є.
  const filtered = showAll || missing.length === 0 ? keywords : missing;

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-sm font-semibold">Ключові слова конкурентів</h3>
          <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
            Входження пораховані по всьому тексту сторінки — заголовки,
            таблиці й списки враховані.
          </p>
        </div>

        <div className="flex items-baseline gap-3">
          <p className="num text-2xs text-subtle">
            {missing.length > 0 ? (
              <span className="text-danger">
                {missing.length}{" "}
                {plural(missing.length, "відсутній", "відсутні", "відсутніх")}
              </span>
            ) : (
              <span className="text-success">усі вжиті</span>
            )}{" "}
            з {keywords.length}
          </p>

          {missing.length > 0 && missing.length < keywords.length && (
            <button
              type="button"
              className="btn-quiet border border-line-strong"
              onClick={() => setShowAll(!showAll)}
              aria-pressed={showAll}
            >
              {showAll ? "Лише відсутні" : "Показати всі"}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">
            Ключові слова конкурентів, відсортовані за поширеністю; спершу ті,
            яких немає на власній сторінці
          </caption>

          <thead>
            <tr className="border-b border-line text-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                Ключ
              </th>
              <th
                scope="col"
                className="w-28 px-3 py-2.5 text-right font-medium sm:w-36"
              >
                У конкурентів
              </th>
              <th
                scope="col"
                className="w-24 px-4 py-2.5 text-right font-medium sm:px-5"
              >
                У вас
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((keyword, index) => (
              <tr
                key={`${index}-${keyword.keyword}`}
                className="border-b border-line last:border-b-0"
              >
                <td className="px-4 py-2.5 text-fg sm:px-5">
                  {keyword.keyword}
                </td>
                <td className="num px-3 py-2.5 text-right text-muted">
                  {keyword.competitors}
                </td>
                {/* Крім кольору відсутність показує саме число «0» —
                    інформація не тримається лише на червоному. */}
                <td
                  className={`num px-4 py-2.5 text-right sm:px-5 ${
                    keyword.occurrences === 0 ? "text-danger" : "text-success"
                  }`}
                >
                  {keyword.occurrences}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
