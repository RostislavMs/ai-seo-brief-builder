import type { BriefIntro } from "@brief/shared";
import { formatRange } from "@brief/shared";
import { plural } from "../../lib/format";
import { Badge } from "../ui/Badge";
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
  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">Вступ після H1</h3>
        <Badge>{formatRange(intro.wordCount)} сл.</Badge>
        <Badge>
          {formatRange(intro.paragraphs)}{" "}
          {plural(intro.paragraphs.max, "абзац", "абзаци", "абзаців")}
        </Badge>
      </div>

      <Instruction text={intro.instruction} />

      {intro.mainPoints.length > 0 && (
        <div>
          <p lang="en" className="text-2xs text-subtle">
            Main points of the introduction:
          </p>
          <ol className="mt-1 space-y-0.5">
            {intro.mainPoints.map((point, index) => (
              <li
                key={`${index}-${point}`}
                className="flex gap-2 text-xs leading-relaxed text-fg"
              >
                <span aria-hidden className="num shrink-0 text-faint">
                  {index + 1}.
                </span>
                {point}
              </li>
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
