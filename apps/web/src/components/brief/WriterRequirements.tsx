import type { WriterRequirementGroup } from "@brief/shared";
import { requirementsPayload } from "../../lib/briefDocument";
import { CopyButton } from "../ui/CopyButton";

interface WriterRequirementsProps {
  groups: readonly WriterRequirementGroup[];
}

/**
 * Постійні вимоги до тексту — читабельність, анкори, довжина речень,
 * характеристики статті.
 *
 * Не вивід моделі: у ТЗ агентства ці блоки однакові в кожному документі
 * незалежно від теми, мови й обсягу. Текст правиться на сторінці «Промпти»
 * (ключ `document.requirements`) і приходить сюди вже розібраним на блоки —
 * див. `parseRequirements()`.
 *
 * Нумерація — з `<ol>`, а не з тексту: у джерелі пункти позначені дефісами,
 * і числа проставляє браузер. Інакше вставлений посередині пункт вимагав би
 * переписати весь блок руками.
 *
 * Стоїть у кінці, під рекомендаціями: це те, що райтер тримає в голові весь
 * час, а не те, з чого починає.
 */
export function WriterRequirements({ groups }: WriterRequirementsProps) {
  if (groups.length === 0) return null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <h3 data-copy-heading="2" className="text-sm font-semibold">
          Вимоги до тексту
        </h3>

        <span className="flex items-baseline gap-2">
          <span className="text-2xs text-subtle">однакові для всіх ТЗ</span>
          <CopyButton
            payload={() => requirementsPayload(groups)}
            label="Копіювати вимоги до тексту"
          />
        </span>
      </div>

      {groups.map((group) => (
        <div
          key={group.title}
          className="border-t border-line px-4 py-4 sm:px-5"
        >
          <h4
            lang="en"
            data-copy-heading="3"
            className="text-xs font-semibold text-fg"
          >
            {group.title}
          </h4>

          <ol
            lang="en"
            className="mt-2 list-decimal space-y-1.5 ps-5 text-xs
              leading-relaxed text-muted marker:font-mono marker:text-faint"
          >
            {group.items.map((item) => (
              <li key={item.text}>
                {item.text}

                {item.children && (
                  <ul className="mt-1 list-disc space-y-1 ps-4 marker:text-faint">
                    {/* wrap-break-word: уточнення бувають адресами, і довгий
                        URL без переносу розсуває картку по горизонталі. */}
                    {item.children.map((child) => (
                      <li key={child} className="wrap-break-word">
                        {child}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
