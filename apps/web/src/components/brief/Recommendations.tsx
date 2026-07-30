import type { ReactNode } from "react";
import type {
  BriefAdditionPlacement,
  BriefOptionalAddition,
  BriefRecommendations,
  BriefSkippedSection,
  BriefUniqueSection,
} from "@brief/shared";
import { formatRange } from "@brief/shared";
import { plural } from "../../lib/format";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Instruction } from "../ui/Instruction";

const PLACEMENT: Record<
  BriefAdditionPlacement,
  { label: string; tone: BadgeTone; where: string }
> = {
  h2: { label: "H2", tone: "accent", where: "після розділу" },
  h3: { label: "H3", tone: "accent", where: "у розділ" },
  block: { label: "блок", tone: "info", where: "у розділ" },
};

interface GroupProps {
  title: string;
  hint: string;
  children: ReactNode;
}

/** Одна група рекомендацій. Підказка обовʼязкова: без неї три списки зливаються. */
function Group({ title, hint, children }: GroupProps) {
  return (
    <div className="border-t border-line px-4 py-4 sm:px-5">
      <h4 className="text-xs font-semibold text-fg">{title}</h4>
      <p className="mt-0.5 text-2xs leading-relaxed text-subtle">{hint}</p>
      {children}
    </div>
  );
}

/**
 * Маркер замість бейджа з назвою групи: назва однакова в кожному рядку,
 * тому в рядку вона була б шумом, а не інформацією.
 */
function Marker({ tone }: { tone: "accent" | "faint" }) {
  return (
    <span
      aria-hidden
      className={`mt-1.5 size-1 shrink-0 rounded-full ${
        tone === "accent" ? "bg-accent" : "bg-faint"
      }`}
    />
  );
}

function UniqueList({ sections }: { sections: readonly BriefUniqueSection[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {sections.map((section, index) => (
        <li key={`${index}-${section.title}`} className="flex gap-2">
          <Marker tone="accent" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs leading-relaxed font-medium text-fg">
              {section.title}
            </p>
            <Instruction text={section.reason} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SkippedList({
  sections,
}: {
  sections: readonly BriefSkippedSection[];
}) {
  return (
    <ul className="mt-3 space-y-3">
      {sections.map((section, index) => (
        <li key={`${index}-${section.title}`} className="flex gap-2">
          <Marker tone="faint" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-xs leading-relaxed font-medium text-fg">
                {section.title}
              </p>
              {section.competitors > 0 && (
                <span className="num text-2xs text-subtle">
                  {section.competitors}{" "}
                  {plural(
                    section.competitors,
                    "конкурент має",
                    "конкурентів мають",
                    "конкурентів мають",
                  )}
                </span>
              )}
            </div>
            <Instruction text={section.reason} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdditionsList({
  additions,
}: {
  additions: readonly BriefOptionalAddition[];
}) {
  return (
    <ul className="mt-3 space-y-3">
      {additions.map((addition, index) => {
        const placement = PLACEMENT[addition.placement];

        return (
          <li key={`${index}-${addition.title}`} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <Badge tone={placement.tone}>{placement.label}</Badge>
              <span className="text-xs leading-relaxed font-medium text-fg">
                {addition.title}
              </span>
              <Badge>+{formatRange(addition.wordCount)} сл.</Badge>
            </div>

            {addition.section && (
              <p className="text-2xs leading-relaxed text-subtle">
                {placement.where} «{addition.section}»
              </p>
            )}

            <Instruction text={addition.instruction} />
          </li>
        );
      })}
    </ul>
  );
}

function NotesList({ notes }: { notes: readonly string[] }) {
  return (
    <ul lang="en" className="mt-3 space-y-1.5">
      {notes.map((note, index) => (
        <li
          key={`${index}-${note}`}
          className="flex gap-2 text-xs leading-relaxed text-muted"
        >
          <span aria-hidden className="text-faint">
            ·
          </span>
          {note}
        </li>
      ))}
    </ul>
  );
}

interface RecommendationsProps {
  recommendations: BriefRecommendations;
}

/**
 * Додаткові рекомендації: три списки про структуру плюс загальні поради.
 *
 * Розділені навмисно. «Є в нас, немає в конкурентів» — це перевага статті;
 * «є в конкурентів, немає в нас» — рішення, яке треба захистити, інакше
 * редактор дописує розділ назад; «можна додати» — резерв, який ніхто не
 * зобовʼязаний виконувати. Одним списком порад ці три різні статуси
 * не передати.
 */
export function Recommendations({ recommendations }: RecommendationsProps) {
  const { uniqueSections, skippedSections, optionalAdditions, structureNotes } =
    recommendations;

  const empty =
    uniqueSections.length === 0 &&
    skippedSections.length === 0 &&
    optionalAdditions.length === 0 &&
    structureNotes.length === 0;

  if (empty) return null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold">Додаткові рекомендації</h3>

        <p className="num text-2xs text-subtle">
          {uniqueSections.length > 0 && (
            <span className="text-accent">{uniqueSections.length} лише в нас</span>
          )}
          {uniqueSections.length > 0 &&
            (skippedSections.length > 0 || optionalAdditions.length > 0) &&
            " · "}
          {skippedSections.length > 0 && (
            <span>{skippedSections.length} не увійшли</span>
          )}
          {skippedSections.length > 0 && optionalAdditions.length > 0 && " · "}
          {optionalAdditions.length > 0 && (
            <span>{optionalAdditions.length} можна додати</span>
          )}
        </p>
      </div>

      {uniqueSections.length > 0 && (
        <Group
          title="Є в нас, немає в конкурентів"
          hint="Розділи структури, яких немає ні в кого — головна перевага статті"
        >
          <UniqueList sections={uniqueSections} />
        </Group>
      )}

      {skippedSections.length > 0 && (
        <Group
          title="Є в конкурентів, немає в нас"
          hint="Теми, які свідомо не увійшли в структуру, і причина кожної — це рішення, а не пропуск"
        >
          <SkippedList sections={skippedSections} />
        </Group>
      )}

      {optionalAdditions.length > 0 && (
        <Group
          title="Можна додати"
          hint="Необовʼязкові заголовки й блоки понад структуру — з місцем і обсягом"
        >
          <AdditionsList additions={optionalAdditions} />
        </Group>
      )}

      {structureNotes.length > 0 && (
        <Group
          title="Загальні поради щодо структури"
          hint="Про статтю в цілому, а не про окремий розділ"
        >
          <NotesList notes={structureNotes} />
        </Group>
      )}
    </section>
  );
}
