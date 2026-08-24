import type { ReactNode } from "react";
import type {
  BriefAdditionPlacement,
  BriefOptionalAddition,
  BriefRecommendations,
} from "@brief/shared";
import { additionPayload, notesPayload } from "../../lib/briefDocument";
import { newAddition, type BriefPath } from "../../lib/briefEdit";
import { Badge, type BadgeTone } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { useBriefEdit } from "./edit/BriefEditContext";
import { AddButton, ItemControls } from "./edit/Controls";
import { EditableRange, EditableText } from "./edit/Editable";
import { EditableInstruction } from "./edit/EditableInstruction";

const PLACEMENT: Record<
  BriefAdditionPlacement,
  { label: string; tone: BadgeTone; where: string }
> = {
  h2: { label: "H2", tone: "accent", where: "після розділу" },
  h3: { label: "H3", tone: "accent", where: "у розділ" },
  block: { label: "блок", tone: "info", where: "у розділ" },
};

const PLACEMENTS = Object.keys(PLACEMENT) as BriefAdditionPlacement[];

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

interface PlacementPickerProps {
  path: BriefPath;
  value: BriefAdditionPlacement;
}

/**
 * Куди стає доповнення. Окремим `select` поряд із бейджем, а не замість нього:
 * бейдж — текст, і саме він їде в документ для райтера, а елемент керування
 * збирач розмітки пропускає (SKIP_TAGS у copySelection). Замінивши бейдж
 * на `select`, ми прибрали б «H2» із того, що вставляється в Docs.
 */
function PlacementPicker({ path, value }: PlacementPickerProps) {
  const edit = useBriefEdit();

  if (!edit.editable) return null;

  return (
    <span data-copy-skip className="inline-flex items-baseline">
      <label className="sr-only" htmlFor={`placement-${path.join("-")}`}>
        Куди стає доповнення
      </label>
      <select
        id={`placement-${path.join("-")}`}
        className="cursor-pointer rounded-inset bg-transparent text-2xs text-faint
          hover:text-fg"
        value={value}
        onChange={(event) =>
          edit.set(path, event.target.value as BriefAdditionPlacement)
        }
      >
        {PLACEMENTS.map((placement) => (
          <option key={placement} value={placement}>
            {PLACEMENT[placement].label}
          </option>
        ))}
      </select>
    </span>
  );
}

function AdditionsList({
  additions,
}: {
  additions: readonly BriefOptionalAddition[];
}) {
  const edit = useBriefEdit();
  const list: BriefPath = ["recommendations", "optionalAdditions"];

  return (
    <>
      {/* data-copy-unwrap: перелік тримає верстку, а не пункти. Кожне доповнення
          має власний заголовок, підпис і інструкцію — у буліт вони не влізуть. */}
      <ul data-copy-unwrap className="mt-3 space-y-3">
        {additions.map((addition, index) => {
          const placement = PLACEMENT[addition.placement];
          const path: BriefPath = [...list, index];

          return (
            // Ключ за індексом: заголовок правиться, і за ним React
            // перестворював би пункт на кожній літері.
            <li key={index} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <div
                  data-copy-heading="4"
                  className="flex flex-wrap items-baseline gap-2"
                >
                  <Badge tone={placement.tone}>{placement.label}</Badge>
                  <PlacementPicker
                    path={[...path, "placement"]}
                    value={addition.placement}
                  />
                  <EditableText
                    path={[...path, "title"]}
                    value={addition.title}
                    className="text-xs leading-relaxed font-medium text-fg"
                    label="назва доповнення"
                    placeholder="назва доповнення"
                  />
                  <Badge>
                    +
                    <EditableRange
                      path={[...path, "wordCount"]}
                      value={addition.wordCount}
                      label="обсяг доповнення"
                    />{" "}
                    сл.
                  </Badge>
                </div>

                <span className="flex items-baseline gap-1">
                  <ItemControls
                    path={list}
                    index={index}
                    count={additions.length}
                    noun="доповнення"
                  />

                  <CopyButton
                    payload={() => additionPayload(addition)}
                    label={`Копіювати доповнення: ${addition.title}`}
                  />
                </span>
              </div>

              {/* У правці рядок видимий завжди: порожній розділ означає «місце
                  не принципове», і без рядка його неможливо було б задати. */}
              {(addition.section || edit.editable) && (
                <p className="text-2xs leading-relaxed text-subtle">
                  {placement.where} «
                  <EditableText
                    path={[...path, "section"]}
                    value={addition.section}
                    label="розділ, до якого додається"
                    placeholder="будь-де"
                  />
                  »
                </p>
              )}

              <EditableInstruction
                path={[...path, "instruction"]}
                text={addition.instruction}
                scope="доповнення"
              />
            </li>
          );
        })}
      </ul>

      <AddButton path={list} item={newAddition}>
        Додати доповнення
      </AddButton>
    </>
  );
}

function NotesList({ notes }: { notes: readonly string[] }) {
  const list: BriefPath = ["recommendations", "structureNotes"];

  return (
    <>
      <ul
        lang="en"
        className="mt-3 list-disc space-y-1.5 ps-5 text-xs leading-relaxed
          text-muted marker:text-faint"
      >
        {notes.map((note, index) => (
          <li key={index}>
            <EditableText
              path={[...list, index]}
              value={note}
              label="порада"
              placeholder="advice for the writer, in English"
            />
            <ItemControls
              path={list}
              index={index}
              count={notes.length}
              noun="пораду"
            />
          </li>
        ))}
      </ul>

      <AddButton path={list} item={() => ""}>
        Додати пораду
      </AddButton>
    </>
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
  const edit = useBriefEdit();
  const { optionalAdditions, structureNotes } = recommendations;

  if (
    optionalAdditions.length === 0 &&
    structureNotes.length === 0 &&
    !edit.editable
  ) {
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

      {/* У правці обидві групи на місці навіть порожні: інакше в них не було б
          куди додати ні доповнення, ні пораду. */}
      {(optionalAdditions.length > 0 || edit.editable) && (
        <Group
          title="Можна додати"
          hint="Необовʼязкові заголовки й блоки понад структуру — з місцем і обсягом"
        >
          <AdditionsList additions={optionalAdditions} />
        </Group>
      )}

      {(structureNotes.length > 0 || edit.editable) && (
        <Group
          title="Загальні поради щодо структури"
          hint="Про статтю в цілому, а не про окремий розділ"
          action={
            structureNotes.length > 0 ? (
              <CopyButton
                payload={() => notesPayload(structureNotes)}
                label="Копіювати поради"
              />
            ) : undefined
          }
        >
          <NotesList notes={structureNotes} />
        </Group>
      )}
    </section>
  );
}
