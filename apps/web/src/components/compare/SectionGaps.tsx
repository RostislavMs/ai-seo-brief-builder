import type { ComparisonSection, SectionStatus } from "@brief/shared";
import { formatRange } from "@brief/shared";
import { plural } from "../../lib/format";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Instruction } from "../ui/Instruction";

const STATUS: Record<SectionStatus, { label: string; tone: BadgeTone }> = {
  missing: { label: "немає", tone: "danger" },
  weak: { label: "слабко", tone: "warn" },
  covered: { label: "розкрито", tone: "success" },
};

interface SectionGapsProps {
  sections: readonly ComparisonSection[];
}

/**
 * Теми конкурентів і стан кожної на власній сторінці.
 *
 * Порядок — той, що повернула модель: він відповідає порядку читання на
 * сторінці. Групування за статусом було б спокусливим, але тоді зникає
 * головне — де саме в тексті прогалина, а «додати розділ» без місця,
 * куди його додати, коштує райтеру ще одного проходу по статті.
 */
export function SectionGaps({ sections }: SectionGapsProps) {
  if (sections.length === 0) return null;

  const missing = sections.filter((s) => s.status === "missing").length;
  const weak = sections.filter((s) => s.status === "weak").length;
  const covered = sections.length - missing - weak;

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <div>
          <h3 className="text-sm font-semibold">Структура</h3>
          <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
            Теми, які покривають конкуренти, у порядку читання на сторінці.
          </p>
        </div>

        <p className="num text-2xs text-subtle">
          {missing > 0 && <span className="text-danger">{missing} немає</span>}
          {missing > 0 && (weak > 0 || covered > 0) && " · "}
          {weak > 0 && <span className="text-warn">{weak} слабко</span>}
          {weak > 0 && covered > 0 && " · "}
          {covered > 0 && (
            <span className="text-success">{covered} розкрито</span>
          )}
        </p>
      </div>

      <ul className="border-t border-line">
        {sections.map((section, index) => (
          <li
            key={`${index}-${section.title}`}
            className="space-y-2 border-t border-line px-4 py-3.5 first:border-t-0 sm:px-5"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <Badge tone={STATUS[section.status].tone}>
                {STATUS[section.status].label}
              </Badge>
              <span className="text-sm font-medium text-fg">
                {section.title}
              </span>
              {section.addedWords && (
                <Badge>+{formatRange(section.addedWords)} сл.</Badge>
              )}
            </div>

            <Instruction text={section.instruction} />

            <p className="num text-2xs text-subtle">
              {section.competitors}{" "}
              {plural(
                section.competitors,
                "конкурент розкриває",
                "конкурентів розкривають",
                "конкурентів розкривають",
              )}{" "}
              цю тему
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
