import type { BriefIntro } from "@brief/shared";
import { formatRange } from "@brief/shared";
import { introPayload, labeledListPayload } from "../../lib/briefDocument";
import { plural } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { Instruction } from "../ui/Instruction";
import { KeywordList } from "./KeywordList";

interface IntroBlockProps {
  intro: BriefIntro;
}

/**
 * Текст між H1 і першим H2. Окремий блок, а не «нульовий розділ» у структурі:
 * у ТЗ вступ має власні вимоги — кількість абзаців поряд з обсягом, — і
 * всередині дерева заголовків він читався б як ще один H2.
 */
export function IntroBlock({ intro }: IntroBlockProps) {
  const points = "Main points of the introduction:";

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        {/* Заголовок разом з бейджами: у документі це один рядок, і обсяг
            зі вступу губиться, якщо лишити його окремим абзацом. */}
        <div
          data-copy-heading="2"
          className="flex flex-wrap items-baseline gap-2"
        >
          <h3 className="text-sm font-semibold">Вступ після H1</h3>
          <Badge>{formatRange(intro.wordCount)} сл.</Badge>
          <Badge>
            {formatRange(intro.paragraphs)}{" "}
            {plural(intro.paragraphs.max, "абзац", "абзаци", "абзаців")}
          </Badge>
        </div>

        <CopyButton
          payload={() => introPayload(intro)}
          label="Копіювати вступ"
        />
      </div>

      <Instruction text={intro.instruction} />

      {intro.mainPoints.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p lang="en" data-copy-strong className="text-2xs text-subtle">
              {points}
            </p>

            <CopyButton
              payload={() => labeledListPayload(intro.mainPoints, points)}
              label="Копіювати тези вступу"
            />
          </div>

          <ol
            className="mt-1 list-decimal space-y-0.5 ps-5 text-xs leading-relaxed
              text-fg marker:font-mono marker:text-faint"
          >
            {intro.mainPoints.map((point, index) => (
              <li key={`${index}-${point}`}>{point}</li>
            ))}
          </ol>
        </div>
      )}

      <KeywordList
        keywords={intro.keywords}
        label="Use these keywords once in the introduction:"
      />
    </section>
  );
}
