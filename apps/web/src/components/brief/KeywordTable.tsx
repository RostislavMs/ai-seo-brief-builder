import type { BriefKeyword } from "@brief/shared";
import { keywordTablePayload } from "../../lib/briefDocument";
import { newKeyword } from "../../lib/briefEdit";
import { plural } from "../../lib/format";
import { CopyButton } from "../ui/CopyButton";
import { useBriefEdit } from "./edit/BriefEditContext";
import { AddButton, ItemControls } from "./edit/Controls";
import { EditableRange, EditableText } from "./edit/Editable";

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
  const edit = useBriefEdit();

  if (keywords.length === 0 && !edit.editable) return null;

  /**
   * Найважливіші ключі — ті, що вживаються найчастіше. Нулі опиняються в кінці
   * самі собою, і саме там їм місце: це не норма, а заборона.
   *
   * У правці порядок лишається таким, як у ТЗ. Сортування тут переставляло б
   * рядок під руками — щойно виправлена кількість вживань, і ключ поїхав на
   * двадцять рядків вище, разом із кареткою. Порядок при цьому не втрачається:
   * у документ для райтера таблиця йде відсортованою (briefDocument).
   */
  const rows = edit.editable
    ? keywords.map((keyword, index) => ({ keyword, index }))
    : [...keywords]
        .map((keyword, index) => ({ keyword, index }))
        .sort((a, b) => b.keyword.usage.max - a.keyword.usage.max);

  const banned = keywords.some((keyword) => keyword.usage.max === 0);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <div>
          <h3 data-copy-heading="2" className="text-sm font-semibold">
            Ключові слова
          </h3>
          {/* Без цього уточнення числа виглядають завищеними: райтер рахує
              входження лише в абзацах, а ТЗ рахує всю статтю. */}
          <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
            Кількість вживань у всій статті — разом із заголовками, таблицями
            й входженнями у складі довших ключів.
            {banned ? " Нуль означає, що форму не вживають зовсім." : ""}
          </p>
        </div>
        <div className="flex items-baseline gap-1">
          <p className="num text-2xs text-subtle">
            {keywords.length}{" "}
            {plural(keywords.length, "ключ", "ключі", "ключів")}
          </p>

          {/* Таблиця цілком: у звичайному тексті колонки розділені табуляцією,
              тому вставляється і в Docs, і в Google Таблиці. */}
          <CopyButton
            payload={() => keywordTablePayload(keywords)}
            label="Копіювати таблицю ключів"
          />
        </div>
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-left text-xs">
          {/* Порядок рядків несе зміст, але візуально ніяк не позначений —
              для скрінрідера це єдина підказка. */}
          <caption data-copy-skip className="sr-only">
            {edit.editable
              ? "Ключові слова в порядку ТЗ; у документ вони йдуть відсортованими за кількістю вживань"
              : "Ключові слова, відсортовані за спаданням кількості вживань"}
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
            {rows.map(({ keyword, index }) => (
              // Ключ за індексом у ТЗ: він не змінюється від правки тексту,
              // тому поле не губить каретку, а дубль ключа від моделі не
              // валить рендер усього ТЗ.
              <tr key={index} className="border-b border-line last:border-b-0">
                <td
                  className={
                    keyword.usage.max === 0
                      ? "px-4 py-2.5 text-subtle line-through sm:px-5"
                      : "px-4 py-2.5 text-fg sm:px-5"
                  }
                >
                  <EditableText
                    path={["keywords", index, "keyword"]}
                    value={keyword.keyword}
                    label="ключ"
                    placeholder="ключ"
                  />
                </td>
                <td className="num px-4 py-2.5 text-right text-muted sm:px-5">
                  <EditableRange
                    path={["keywords", index, "usage"]}
                    value={keyword.usage}
                    label="кількість вживань"
                  />
                  {/* Переставляння тут немає: у режимі перегляду порядок
                      задає сортування, і «вище» означало б не те, що
                      станеться. */}
                  <ItemControls
                    path={["keywords"]}
                    index={index}
                    count={keywords.length}
                    noun="ключ"
                    movable={false}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit.editable && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <AddButton path={["keywords"]} item={newKeyword}>
            Додати ключ
          </AddButton>
        </div>
      )}
    </section>
  );
}
