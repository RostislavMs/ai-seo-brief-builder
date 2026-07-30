import type { ComparisonMetaIssue, MetaField } from "@brief/shared";
import { Badge } from "../ui/Badge";
import { Instruction } from "../ui/Instruction";

const LABELS: Record<MetaField, string> = {
  title: "Title",
  description: "Meta Description",
  h1: "H1",
};

/** Ті самі межі, що в ТЗ: довше Google обрізає у видачі. */
const LIMITS: Partial<Record<MetaField, { min: number; max: number }>> = {
  title: { min: 30, max: 60 },
  description: { min: 140, max: 160 },
};

function Value({
  value,
  field,
  muted,
}: {
  value: string | null;
  field: MetaField;
  muted?: boolean;
}) {
  if (value === null) {
    return (
      <p className="panel px-3 py-2 text-sm text-faint">— відсутній</p>
    );
  }

  const limits = LIMITS[field];
  const inRange = limits
    ? value.length >= limits.min && value.length <= limits.max
    : true;

  return (
    <div className="space-y-1">
      <p
        className={`panel px-3 py-2 text-sm leading-relaxed ${
          muted ? "text-muted" : "text-fg"
        }`}
      >
        {value}
      </p>
      {limits && (
        <span
          className={`num text-2xs ${inRange ? "text-success" : "text-warn"}`}
          title={`Рекомендовано ${limits.min}–${limits.max} символів`}
        >
          {value.length} / {limits.max}
        </span>
      )}
    </div>
  );
}

interface MetaIssuesProps {
  issues: readonly ComparisonMetaIssue[];
}

/**
 * Title, Meta Description і H1: що зараз і що замінити.
 *
 * «Зараз» узято з самої сторінки сервером, а не від моделі: воно лежить
 * у даних, і єдине, що могло б із ним статися по дорозі через модель, —
 * тихо змінитися. Порожня пропозиція означає «лишити як є», і саме так
 * і підписана: рядок без заміни — теж результат аналізу.
 */
export function MetaIssues({ issues }: MetaIssuesProps) {
  if (issues.length === 0) return null;

  return (
    <section className="card">
      <div className="px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold">Метадані</h3>
      </div>

      <div className="border-t border-line">
        {issues.map((issue) => (
          <div
            key={issue.field}
            className="space-y-3 border-t border-line px-4 py-4 first:border-t-0 sm:px-5"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-xs font-semibold text-fg">
                {LABELS[issue.field]}
              </h4>
              {issue.suggested === null ? (
                <Badge tone="success">лишити як є</Badge>
              ) : (
                <Badge tone="warn">замінити</Badge>
              )}
            </div>

            <Instruction text={issue.instruction} />

            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <span className="text-2xs text-subtle">Зараз на сторінці</span>
                <Value
                  value={issue.current}
                  field={issue.field}
                  muted={issue.suggested !== null}
                />
              </div>

              {issue.suggested !== null && (
                <div className="space-y-1.5">
                  <span className="text-2xs text-accent">Рекомендовано</span>
                  <Value value={issue.suggested} field={issue.field} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
