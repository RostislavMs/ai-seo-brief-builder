import type { BriefH2, BriefH3, SeoBrief } from "@brief/shared";
import { formatRange, sumRanges } from "@brief/shared";
import { sectionPayload, subsectionPayload } from "../../lib/briefDocument";
import { plural } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { Instruction } from "../ui/Instruction";
import { BlockView } from "./BlockView";
import { KeywordList } from "./KeywordList";

/** Рівень заголовка. Однакова подача на всіх рівнях тримає дерево читабельним. */
function Level({ children }: { children: string }) {
  return <span className="num text-2xs text-faint">{children}</span>;
}

function H3Block({ h3, number }: { h3: BriefH3; number: string }) {
  return (
    <li className="space-y-2 border-l border-line pl-3">
      <div className="flex items-baseline justify-between gap-2">
        <div
          data-copy-heading="4"
          className="flex flex-wrap items-baseline gap-2"
        >
          <Level>H3</Level>
          <span className="text-xs font-medium text-fg">{h3.title}</span>
          <Badge>{formatRange(h3.wordCount)} сл.</Badge>
        </div>

        <CopyButton
          payload={() => subsectionPayload(h3, number)}
          label={`Копіювати підрозділ: ${h3.title}`}
        />
      </div>

      <Instruction text={h3.instruction} />
      <KeywordList
        keywords={h3.keywords}
        label="Use the following keywords in this paragraph:"
      />

      {h3.blocks.map((block, index) => (
        <BlockView key={`${block.kind}-${index}`} block={block} />
      ))}

      {h3.children.length > 0 && (
        <ul data-copy-unwrap className="space-y-2">
          {h3.children.map((h4) => (
            <li key={h4.title} className="space-y-1 border-l border-line pl-3">
              <div
                data-copy-heading="5"
                className="flex flex-wrap items-baseline gap-2"
              >
                <Level>H4</Level>
                <span className="text-xs text-muted">{h4.title}</span>
                <Badge>{formatRange(h4.wordCount)} сл.</Badge>
              </div>
              <Instruction text={h4.instruction} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function H2Block({ h2, index }: { h2: BriefH2; index: number }) {
  const number = String(index + 1);

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
              <h4 className="text-sm font-medium text-fg">{h2.title}</h4>
              <Badge>{formatRange(h2.wordCount)} сл.</Badge>
            </div>

            <CopyButton
              payload={() => sectionPayload(h2, index)}
              label={`Копіювати розділ: ${h2.title}`}
            />
          </div>

          <Instruction text={h2.instruction} />
          <KeywordList
            keywords={h2.keywords}
            label="Use the following keywords in this section:"
          />

          {h2.blocks.map((block, blockIndex) => (
            <BlockView key={`${block.kind}-${blockIndex}`} block={block} />
          ))}

          {/* data-copy-unwrap: цей перелік тримає дерево, а не пункти. Без
              нього кожен підрозділ — з заголовком, ключами й блоками —
              злипався б у документі в один буліт. */}
          {h2.children.length > 0 && (
            <ul data-copy-unwrap className="space-y-3">
              {h2.children.map((h3, h3Index) => (
                <H3Block
                  key={h3.title}
                  h3={h3}
                  number={`${number}.${h3Index + 1}`}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface StructureTreeProps {
  brief: SeoBrief;
}

export function StructureTree({ brief }: StructureTreeProps) {
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
          {formatRange(brief.totalWordCount)} слів загалом
          {(parts.min !== brief.totalWordCount.min ||
            parts.max !== brief.totalWordCount.max) &&
            ` (вступ і розділи ${formatRange(parts)})`}
        </p>
      </div>

      <div className="border-t border-line">
        {brief.structure.map((h2, index) => (
          <H2Block key={h2.title} h2={h2} index={index} />
        ))}
      </div>
    </section>
  );
}
