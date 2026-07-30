import type { ComparisonMetrics, MetricComparison } from "@brief/shared";
import { formatNumber } from "../../lib/format";

/** Порядок читання: спершу обсяг, далі структура, далі формати подачі. */
const ROWS: { key: keyof ComparisonMetrics; label: string }[] = [
  { key: "wordCount", label: "Слів" },
  { key: "h2", label: "H2" },
  { key: "h3", label: "H3" },
  { key: "paragraphs", label: "Абзаців" },
  { key: "lists", label: "Списків" },
  { key: "tables", label: "Таблиць" },
  { key: "faq", label: "FAQ" },
];

/**
 * Різниця з медіаною у відсотках. Значення сам по собі нейтральне: більше не
 * завжди краще, тому колір лишається лише підказкою, а число — фактом.
 */
function difference(metric: MetricComparison): {
  text: string;
  tone: string;
} {
  if (metric.median === 0) {
    return { text: "—", tone: "text-faint" };
  }

  const percent = Math.round(
    ((metric.own - metric.median) / metric.median) * 100,
  );

  if (percent === 0) return { text: "на рівні", tone: "text-muted" };

  return {
    text: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`,
    // Помітне відставання варто підсвітити, невелике — ні: розкид у 10%
    // між статтями на одну тему — норма, а не проблема.
    tone:
      percent <= -25
        ? "text-danger"
        : percent < 0
          ? "text-warn"
          : "text-success",
  };
}

interface MetricsGridProps {
  metrics: ComparisonMetrics;
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <section className="card">
      <div className="px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold">Показники</h3>
        <p className="mt-0.5 text-2xs leading-relaxed text-subtle">
          Медіана, а не середнє: один лонгрід серед п'яти звичайних статей
          зрушив би орієнтир так, що він перестав би бути орієнтиром. Більше —
          не завжди краще, тому це вихідні дані, а не вирок.
        </p>
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">
                Показник
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Ваша
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Медіана
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Максимум
              </th>
              <th
                scope="col"
                className="px-4 py-2.5 text-right font-medium sm:px-5"
              >
                Різниця
              </th>
            </tr>
          </thead>

          <tbody>
            {ROWS.map((row) => {
              const metric = metrics[row.key];
              const delta = difference(metric);

              return (
                <tr key={row.key} className="border-b border-line last:border-b-0">
                  <th
                    scope="row"
                    className="px-4 py-2.5 font-normal text-muted sm:px-5"
                  >
                    {row.label}
                  </th>
                  <td className="num px-3 py-2.5 text-right text-fg">
                    {formatNumber(metric.own)}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-muted">
                    {formatNumber(metric.median)}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-subtle">
                    {formatNumber(metric.best)}
                  </td>
                  <td
                    className={`num px-4 py-2.5 text-right sm:px-5 ${delta.tone}`}
                  >
                    {delta.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
