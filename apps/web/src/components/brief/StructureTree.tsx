import type { BriefH2, BriefH3, SeoBrief } from "@brief/shared";
import { formatRange, sumRanges } from "@brief/shared";
import { sectionPayload, subsectionPayload } from "../../lib/briefDocument";
import { newH2, newH3, newH4, type BriefPath } from "../../lib/briefEdit";
import { plural } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { BlockView } from "./BlockView";
import { useBriefEdit } from "./edit/BriefEditContext";
import { AddBlock, AddButton, ItemControls } from "./edit/Controls";
import { EditableRange, EditableText } from "./edit/Editable";
import { EditableInstruction } from "./edit/EditableInstruction";
import { KeywordList } from "./KeywordList";

/** Рівень заголовка. Однакова подача на всіх рівнях тримає дерево читабельним. */
function Level({ children }: { children: string }) {
  return <span className="num text-2xs text-faint">{children}</span>;
}

interface H3BlockProps {
  h3: BriefH3;
  /** Нумерація для підказок копіювання: «2.3». */
  number: string;
  /** Шлях до цього підрозділу. */
  path: BriefPath;
  index: number;
  count: number;
}

function H3Block({ h3, number, path, index, count }: H3BlockProps) {
  const list = path.slice(0, -1);
  const children: BriefPath = [...path, "children"];

  return (
    <li className="space-y-2 border-l border-line pl-3">
      <div className="flex items-baseline justify-between gap-2">
        <div
          data-copy-heading="4"
          className="flex flex-wrap items-baseline gap-2"
        >
          <Level>H3</Level>
          <EditableText
            path={[...path, "title"]}
            value={h3.title}
            className="text-xs font-medium text-fg"
            label="заголовок H3"
            placeholder="заголовок підрозділу"
          />
          <Badge>
            <EditableRange
              path={[...path, "wordCount"]}
              value={h3.wordCount}
              label="обсяг підрозділу"
            />{" "}
            сл.
          </Badge>
        </div>

        <span className="flex items-baseline gap-1">
          <ItemControls
            path={list}
            index={index}
            count={count}
            noun="підрозділ"
          />

          <CopyButton
            payload={() => subsectionPayload(h3, number)}
            label={`Копіювати підрозділ: ${h3.title}`}
          />
        </span>
      </div>

      <EditableInstruction
        path={[...path, "instruction"]}
        text={h3.instruction}
        scope="підрозділу"
      />
      <KeywordList
        path={[...path, "keywords"]}
        keywords={h3.keywords}
        label="Use the following keywords in this paragraph:"
      />

      {h3.blocks.map((block, blockIndex) => (
        <BlockView
          key={blockIndex}
          block={block}
          path={[...path, "blocks", blockIndex]}
          index={blockIndex}
          count={h3.blocks.length}
        />
      ))}
      <AddBlock path={[...path, "blocks"]} />

      {h3.children.length > 0 && (
        <ul data-copy-unwrap className="space-y-2">
          {h3.children.map((h4, h4Index) => (
            <li key={h4Index} className="space-y-1 border-l border-line pl-3">
              <div className="flex items-baseline justify-between gap-2">
                <div
                  data-copy-heading="5"
                  className="flex flex-wrap items-baseline gap-2"
                >
                  <Level>H4</Level>
                  <EditableText
                    path={[...children, h4Index, "title"]}
                    value={h4.title}
                    className="text-xs text-muted"
                    label="заголовок H4"
                    placeholder="заголовок"
                  />
                  <Badge>
                    <EditableRange
                      path={[...children, h4Index, "wordCount"]}
                      value={h4.wordCount}
                      label="обсяг H4"
                    />{" "}
                    сл.
                  </Badge>
                </div>

                <ItemControls
                  path={children}
                  index={h4Index}
                  count={h3.children.length}
                  noun="H4"
                />
              </div>

              <EditableInstruction
                path={[...children, h4Index, "instruction"]}
                text={h4.instruction}
                scope="H4"
              />
            </li>
          ))}
        </ul>
      )}

      <AddButton path={children} item={newH4}>
        Додати H4
      </AddButton>
    </li>
  );
}

interface H2BlockProps {
  h2: BriefH2;
  index: number;
  count: number;
}

function H2Block({ h2, index, count }: H2BlockProps) {
  const number = String(index + 1);
  const path: BriefPath = ["structure", index];
  const children: BriefPath = [...path, "children"];

  return (
    <div className="space-y-3 border-t border-line px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex items-start gap-3">
        {/* Нумерація розділів моноширинна й з табличними цифрами:
            інакше «09» і «10» дають різну ширину і колонка заголовків «дише».
            У документі вона зайва — там нумерація вже є в самому заголовку. */}
        <span data-copy-skip className="num mt-0.5 text-xs text-faint">
          {number.padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div
              data-copy-heading="3"
              className="flex flex-wrap items-baseline gap-2"
            >
              <Level>H2</Level>
              <EditableText
                as="h4"
                path={[...path, "title"]}
                value={h2.title}
                className="text-sm font-medium text-fg"
                label="заголовок H2"
                placeholder="заголовок розділу"
              />
              <Badge>
                <EditableRange
                  path={[...path, "wordCount"]}
                  value={h2.wordCount}
                  label="обсяг розділу"
                />{" "}
                сл.
              </Badge>
            </div>

            <span className="flex items-baseline gap-1">
              <ItemControls
                path={["structure"]}
                index={index}
                count={count}
                noun="розділ"
              />

              <CopyButton
                payload={() => sectionPayload(h2, index)}
                label={`Копіювати розділ: ${h2.title}`}
              />
            </span>
          </div>

          <EditableInstruction
            path={[...path, "instruction"]}
            text={h2.instruction}
            scope="розділу"
          />
          <KeywordList
            path={[...path, "keywords"]}
            keywords={h2.keywords}
            label="Use the following keywords in this section:"
          />

          {h2.blocks.map((block, blockIndex) => (
            <BlockView
              key={blockIndex}
              block={block}
              path={[...path, "blocks", blockIndex]}
              index={blockIndex}
              count={h2.blocks.length}
            />
          ))}
          <AddBlock path={[...path, "blocks"]} />

          {/* data-copy-unwrap: цей перелік тримає дерево, а не пункти. Без
              нього кожен підрозділ — з заголовком, ключами й блоками —
              злипався б у документі в один буліт. */}
          {h2.children.length > 0 && (
            <ul data-copy-unwrap className="space-y-3">
              {h2.children.map((h3, h3Index) => (
                <H3Block
                  key={h3Index}
                  h3={h3}
                  number={`${number}.${h3Index + 1}`}
                  path={[...children, h3Index]}
                  index={h3Index}
                  count={h2.children.length}
                />
              ))}
            </ul>
          )}

          <AddButton path={children} item={newH3}>
            Додати підрозділ H3
          </AddButton>
        </div>
      </div>
    </div>
  );
}

interface StructureTreeProps {
  brief: SeoBrief;
}

export function StructureTree({ brief }: StructureTreeProps) {
  const edit = useBriefEdit();

  // Вступ входить у загальний обсяг, тому й у порівняння з ним — інакше
  // примітка про розбіжність висіла б завжди.
  const parts = sumRanges([
    brief.intro.wordCount,
    ...brief.structure.map((h2) => h2.wordCount),
  ]);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-5">
        <h3 data-copy-heading="2" className="text-sm font-semibold">
          Структура статті
        </h3>
        <p className="num text-2xs text-subtle">
          {brief.structure.length}{" "}
          {plural(brief.structure.length, "розділ", "розділи", "розділів")} ·{" "}
          {/* Загальний обсяг правиться тут же: після ручних змін у розділах
              саме він і розходиться з їхньою сумою, яку видно поряд. */}
          <EditableRange
            path={["totalWordCount"]}
            value={brief.totalWordCount}
            label="загальний обсяг статті"
          />{" "}
          слів загалом
          {(parts.min !== brief.totalWordCount.min ||
            parts.max !== brief.totalWordCount.max) &&
            ` (вступ і розділи ${formatRange(parts)})`}
        </p>
      </div>

      <div className="border-t border-line">
        {brief.structure.map((h2, index) => (
          // Ключ за індексом, а не за заголовком: заголовок правиться, і
          // React перестворював би розділ на кожній літері.
          <H2Block
            key={index}
            h2={h2}
            index={index}
            count={brief.structure.length}
          />
        ))}

        {edit.editable && (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <AddButton path={["structure"]} item={newH2}>
              Додати розділ H2
            </AddButton>
          </div>
        )}
      </div>
    </section>
  );
}
