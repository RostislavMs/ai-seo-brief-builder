import type { ReactNode } from "react";
import type {
  BriefAdditionPlacement,
  BriefOptionalAddition,
  BriefRecommendations,
} from "@brief/shared";
import { formatRange } from "@brief/shared";
import { additionPayload, notesPayload } from "../../lib/briefDocument";
import { Badge, type BadgeTone } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
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
  /** Кнопка копіювання групи, якщо групу є сенс копіювати цілком. */
  action?: ReactNode;
  children: ReactNode;
}

/** Одна група рекомендацій. Підказка обовʼязкова: без неї три списки зливаються. */
function Group({ title, hint, action, children }: GroupProps) {
  return (
    <div className="border-t border-line px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 data-copy-heading="3" className="text-xs font-semibold text-fg">
          {title}
        </h4>
        {action}
      </div>
      <p className="mt-0.5 text-2xs leading-relaxed text-subtle">{hint}</p>
      {children}
    </div>
  );
}

function AdditionsList({
  additions,
}: {
  additions: readonly BriefOptionalAddition[];
}) {
  return (
    /* data-copy-unwrap: перелік тримає верстку, а не пункти. Кожне доповнення
       має власний заголовок, підпис і інструкцію — у буліт вони не влізуть. */
    <ul data-copy-unwrap className="mt-3 space-y-3">
      {additions.map((addition, index) => {
        const placement = PLACEMENT[addition.placement];

        return (
          <li key={`${index}-${addition.title}`} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <div
                data-copy-heading="4"
                className="flex flex-wrap items-baseline gap-2"
              >
                <Badge tone={placement.tone}>{placement.label}</Badge>
                <span className="text-xs leading-relaxed font-medium text-fg">
                  {addition.title}
                </span>
                <Badge>+{formatRange(addition.wordCount)} сл.</Badge>
              </div>

              <CopyButton
                payload={() => additionPayload(addition)}
                label={`Копіювати доповнення: ${addition.title}`}
              />
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
    <ul
      lang="en"
      className="mt-3 list-disc space-y-1.5 ps-5 text-xs leading-relaxed
        text-muted marker:text-faint"
    >
      {notes.map((note, index) => (
        <li key={`${index}-${note}`}>{note}</li>
      ))}
    </ul>
  );
}

interface RecommendationsProps {
  recommendations: BriefRecommendations;
}

/**
 * Додаткові рекомендації: що можна додати понад структуру й що варто знати
 * про статтю в цілому. Розділені навмисно: «можна додати» — резерв із місцем
 * і обсягом, який ніхто не зобовʼязаний виконувати, а поради — про статтю,
 * а не про окремий розділ.
 *
 * Списків «є в нас, немає в конкурентів» і навпаки тут немає навмисно: ТЗ
 * генерується лише з даних конкурентів, власна сторінка в цей промпт не
 * потрапляє, тому «нас» у ньому не існує — є структура, яку модель щойно
 * написала. Це порівняння живе в аналізі власної сторінки, де є обидві
 * сторони й де покриття міряється, а не заявляється.
 */
export function Recommendations({ recommendations }: RecommendationsProps) {
  const { optionalAdditions, structureNotes } = recommendations;

  if (optionalAdditions.length === 0 && structureNotes.length === 0) {
    return null;
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <h3 data-copy-heading="2" className="text-sm font-semibold">
          Додаткові рекомендації
        </h3>

        {optionalAdditions.length > 0 && (
          <p className="num text-2xs text-subtle">
            {optionalAdditions.length} можна додати
          </p>
        )}
      </div>

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
          action={
            <CopyButton
              payload={() => notesPayload(structureNotes)}
              label="Копіювати поради"
            />
          }
        >
          <NotesList notes={structureNotes} />
        </Group>
      )}
    </section>
  );
}
