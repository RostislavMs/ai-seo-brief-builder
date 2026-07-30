import type { ComparisonScore } from "@brief/shared";
import { formatDateTime, plural } from "../../lib/format";
import { Instruction } from "../ui/Instruction";

/**
 * Три складники балу — з тими самими вагами, що в
 * services/compare/metrics.ts. Ваги показуються навмисно: бал без розкладу
 * і без ваг — чорна скринька, довіряти якій немає підстав.
 */
const PARTS: { key: keyof Omit<ComparisonScore, "total">; label: string; weight: string }[] = [
  { key: "structure", label: "Структура", weight: "50%" },
  { key: "volume", label: "Обсяг", weight: "30%" },
  { key: "keywords", label: "Ключі", weight: "20%" },
];

/** Смуга заповнення. Число поряд обовʼязкове: колір сам стану не несе. */
function Bar({ value }: { value: number }) {
  return (
    <div className="panel h-1.5 overflow-hidden p-0">
      <div
        className="h-full rounded-inset bg-accent-solid"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

interface ScoreCardProps {
  score: ComparisonScore;
  verdict: string;
  comparedAt: string;
  competitorCount: number;
  contentLanguage: string;
}

export function ScoreCard({
  score,
  verdict,
  comparedAt,
  competitorCount,
  contentLanguage,
}: ScoreCardProps) {
  return (
    <section className="card space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Порівняння з конкурентами</h3>
        <span className="num text-2xs text-subtle">
          мова контенту:{" "}
          <span className="text-accent">{contentLanguage}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <div className="num text-4xl leading-none font-semibold text-fg">
            {score.total}
            <span className="text-xl text-faint">/100</span>
          </div>
          <p className="num mt-1.5 text-2xs text-subtle">
            проти {competitorCount}{" "}
            {plural(competitorCount, "конкурента", "конкурентів", "конкурентів")}{" "}
            · {formatDateTime(comparedAt)}
          </p>
        </div>

        {/* Звичайні div, а не dl/dt/dd: до кожного складника йде ще й смуга,
            а всередині dl вона не має валідного місця — dl > div може містити
            лише пари dt/dd. Так само зроблено в Metric із PageDetails. */}
        <div className="grid min-w-52 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
          {PARTS.map((part) => (
            <div key={part.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xs text-subtle">
                  {part.label}{" "}
                  <span className="num text-faint">{part.weight}</span>
                </span>
                <span className="num text-xs text-fg">{score[part.key]}</span>
              </div>
              <Bar value={score[part.key]} />
            </div>
          ))}
        </div>
      </div>

      {/* Вирок — англійською, як і решта інструкцій для райтера, тому й подача
          та сама: інакше два види «англійського блоку» читалися б як різні. */}
      <Instruction text={verdict} />
    </section>
  );
}
