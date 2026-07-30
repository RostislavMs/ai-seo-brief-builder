import type { ComparisonAction, GapSeverity } from "@brief/shared";
import { Badge, type BadgeTone } from "../ui/Badge";

const SEVERITY: Record<GapSeverity, { label: string; tone: BadgeTone }> = {
  critical: { label: "критично", tone: "danger" },
  important: { label: "важливо", tone: "warn" },
  minor: { label: "дрібне", tone: "neutral" },
};

interface ActionPlanProps {
  actions: readonly ComparisonAction[];
  /** Чим сторінка вже краща за конкурентів. */
  strengths: readonly string[];
}

/**
 * План і те, що не можна зламати, поки його виконуєш, — в одній картці.
 *
 * Разом навмисно: перелік сильних сторін окремою карткою читається як похвала,
 * а він тут не для похвали. «Переписати вступ» і «у вступі вже є те, чого
 * немає в конкурентів» мають стояти поряд, інакше друге губиться.
 */
export function ActionPlan({ actions, strengths }: ActionPlanProps) {
  if (actions.length === 0 && strengths.length === 0) return null;

  return (
    <section className="card space-y-5 p-4 sm:p-5">
      {actions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Що робити</h3>
          <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
            Порядок несе зміст: найцінніше першим.
          </p>

          <ol lang="en" className="mt-3 space-y-2.5">
            {actions.map((action, index) => (
              <li
                key={`${index}-${action.action}`}
                className="flex items-start gap-3"
              >
                {/* Табличні цифри: інакше «9.» і «10.» дають різну ширину,
                    і колонка тексту «дише». */}
                <span className="num mt-px text-xs text-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs leading-relaxed text-fg">
                    {action.action}
                  </p>
                  <span lang="uk">
                    <Badge tone={SEVERITY[action.severity].tone}>
                      {SEVERITY[action.severity].label}
                    </Badge>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {strengths.length > 0 && (
        <div className={actions.length > 0 ? "border-t border-line pt-4" : ""}>
          <h4 className="text-xs font-semibold text-success">
            Уже сильніше за конкурентів
          </h4>
          <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
            Це має вціліти після правок.
          </p>

          <ul lang="en" className="mt-2 space-y-1.5">
            {strengths.map((item, index) => (
              <li
                key={`${index}-${item}`}
                className="flex gap-2 text-xs leading-relaxed text-muted"
              >
                <span aria-hidden className="text-success">
                  ·
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
