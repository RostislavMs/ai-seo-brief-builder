import type { BriefKeyword } from "@brief/shared";
import { formatRange } from "@brief/shared";
import { plural } from "../../lib/format";

interface KeywordTableProps {
  keywords: readonly BriefKeyword[];
}

/**
 * Зведена таблиця ключів усієї статті: лише сам ключ і кількість вживань, без
 * поділу на типи. Містить усі ключі, названі у вступі та розділах, плюс основні
 * запити теми — тому це десятки рядків, а не короткий перелік.
 *
 * Заголовки колонок англійською — таблиця є частиною ТЗ, яке віддається райтеру.
 */
export function KeywordTable({ keywords }: KeywordTableProps) {
  if (keywords.length === 0) return null;

  // Найважливіші ключі — ті, що вживаються найчастіше.
  const sorted = [...keywords].sort((a, b) => b.usage.max - a.usage.max);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-sm font-semibold">Ключові слова</h3>
          {/* Без цього уточнення числа виглядають завищеними: райтер рахує
              входження лише в абзацах, а ТЗ рахує всю статтю. */}
          <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
            Кількість вживань у всій статті — разом із заголовками, таблицями
            й входженнями у складі довших ключів.
          </p>
        </div>
        <p className="num text-2xs text-subtle">
          {keywords.length}{" "}
          {plural(keywords.length, "ключ", "ключі", "ключів")}
        </p>
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-left text-xs">
          {/* Порядок рядків несе зміст, але візуально ніяк не позначений —
              для скрінрідера це єдина підказка. */}
          <caption className="sr-only">
            Ключові слова, відсортовані за спаданням кількості вживань
          </caption>

          <thead>
            <tr className="border-b border-line text-subtle">
              <th lang="en" scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                Keyword
              </th>
              <th
                lang="en"
                scope="col"
                className="w-28 px-4 py-2.5 text-right font-medium sm:w-32 sm:px-5"
              >
                Total usage
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((keyword, index) => (
              <tr
                // Індекс у ключі навмисно: таблиця велика, і дубль ключа
                // від моделі не має валити рендер усього ТЗ.
                key={`${index}-${keyword.keyword}`}
                className="border-b border-line last:border-b-0"
              >
                <td className="px-4 py-2.5 text-fg sm:px-5">
                  {keyword.keyword}
                </td>
                <td className="num px-4 py-2.5 text-right text-muted sm:px-5">
                  {formatRange(keyword.usage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
