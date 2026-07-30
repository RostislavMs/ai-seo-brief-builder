import { useState } from "react";
import type { AnalysisStatus, PageAnalysis } from "@brief/shared";
import { formatNumber, plural } from "../../lib/format";
import { shortenUrl } from "../../lib/url";
import { Spinner } from "../ui/Spinner";
import { PageDetails } from "./PageDetails";
import { SourceBadge } from "./SourceBadge";

const STATUS_DOT: Record<AnalysisStatus, string> = {
  pending: "bg-faint",
  loading: "bg-info-solid",
  success: "bg-success-solid",
  error: "bg-danger-solid",
};

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: "очікує",
  loading: "аналізується",
  success: "готово",
  error: "помилка",
};

interface AnalysisRowProps {
  analysis: PageAnalysis;
}

function AnalysisRow({ analysis }: AnalysisRowProps) {
  const [open, setOpen] = useState(false);
  const canExpand = analysis.status === "success" && analysis.page !== null;

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => canExpand && setOpen(!open)}
        disabled={!canExpand}
        aria-expanded={canExpand ? open : undefined}
        className="flex w-full items-center gap-3 px-3 py-3 text-left
          transition-colors duration-150 ease-out
          enabled:hover:bg-hover disabled:cursor-default sm:px-4"
      >
        {analysis.status === "loading" ? (
          <Spinner className="size-3.5" />
        ) : (
          <span
            className={`size-2.5 shrink-0 rounded-full ${STATUS_DOT[analysis.status]}`}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="num truncate text-xs text-muted">
              {shortenUrl(analysis.url, 70)}
            </p>
            {analysis.page && (
              <SourceBadge
                source={analysis.page.meta.source}
                archivedAt={analysis.page.meta.archivedAt}
                hideDirect
              />
            )}
          </div>

          {analysis.status === "error" && analysis.error && (
            <p className="mt-1 text-xs text-danger">{analysis.error}</p>
          )}

          {analysis.status === "success" && analysis.page && (
            <p className="num mt-1 text-2xs text-subtle">
              {formatNumber(analysis.page.wordCount)} слів ·{" "}
              {analysis.page.headings.length}{" "}
              {plural(
                analysis.page.headings.length,
                "заголовок",
                "заголовки",
                "заголовків",
              )}
              {analysis.page.tables.length > 0 &&
                ` · ${analysis.page.tables.length} табл.`}
              {analysis.page.faq.length > 0 &&
                ` · ${analysis.page.faq.length} FAQ`}
            </p>
          )}
        </div>

        {/* Текстовий статус поруч із кольоровою точкою: сам колір стан не несе
            (правило color-not-only). На вузьких екранах лишається лише точка,
            але там її дублює текст помилки або підсумок. */}
        <span className="hidden shrink-0 text-2xs text-subtle sm:inline">
          {STATUS_LABEL[analysis.status]}
        </span>

        {canExpand && (
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-inset
              font-mono text-xs text-subtle"
          >
            {open ? "−" : "+"}
          </span>
        )}
      </button>

      {open && analysis.page && <PageDetails page={analysis.page} />}
    </div>
  );
}

interface AnalysisPanelProps {
  analyses: readonly PageAnalysis[];
  running: boolean;
  onRerun: () => void;
}

export function AnalysisPanel({
  analyses,
  running,
  onRerun,
}: AnalysisPanelProps) {
  const ok = analyses.filter((analysis) => analysis.status === "success").length;
  const failed = analyses.filter((analysis) => analysis.status === "error").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="num text-xs text-subtle">
          {analyses.length}{" "}
          {plural(analyses.length, "сторінка", "сторінки", "сторінок")}
          {ok > 0 && <span className="text-success"> · {ok} успішно</span>}
          {failed > 0 && (
            <span className="text-danger"> · {failed} з помилкою</span>
          )}
        </p>

        <button
          type="button"
          className="btn-quiet border border-line-strong"
          onClick={onRerun}
          disabled={running}
        >
          {running && <Spinner className="size-3" />}
          {running ? "Аналізується…" : "Проаналізувати заново"}
        </button>
      </div>

      <div className="space-y-2">
        {analyses.map((analysis) => (
          <AnalysisRow key={analysis.id} analysis={analysis} />
        ))}
      </div>
    </div>
  );
}
