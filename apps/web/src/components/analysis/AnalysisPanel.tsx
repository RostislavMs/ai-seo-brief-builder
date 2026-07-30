import { useState } from "react";
import type { AnalysisStatus, PageAnalysis } from "@brief/shared";
import { formatNumber, plural } from "../../lib/format";
import { isUsable, readyCount } from "../../lib/analyses";
import { shortenUrl } from "../../lib/url";
import { Spinner } from "../ui/Spinner";
import { LanguagePanel } from "./LanguagePanel";
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
  /** Знімає й повертає участь сторінки в ТЗ. */
  onToggle: (id: string) => void;
  /** true — поки триває аналіз: у цей момент склад набору не змінюють. */
  disabled: boolean;
}

function AnalysisRow({ analysis, onToggle, disabled }: AnalysisRowProps) {
  const [open, setOpen] = useState(false);
  const canExpand = analysis.status === "success" && analysis.page !== null;
  const excluded = analysis.excluded === true;

  return (
    <div className="card overflow-hidden">
      {/*
       * Чекбокс — сусід кнопки розкриття, а не її вміст: інтерактивний елемент
       * усередині button не працює ні мишкою, ні з клавіатури. Через це рядок
       * складається з двох цілей замість однієї — і це правильно, бо дії різні:
       * «подивитися, що звідси взяли» і «не брати звідси нічого».
       */}
      <div className="flex items-center gap-2 pl-3 sm:pl-4">
        <div className="grid size-6 shrink-0 place-items-center">
          {canExpand ? (
            <input
              type="checkbox"
              className="checkbox"
              checked={!excluded}
              disabled={disabled}
              onChange={() => onToggle(analysis.id)}
              aria-label={
                excluded
                  ? `Повернути ${analysis.url} в основу для ТЗ`
                  : `Не брати ${analysis.url} за основу для ТЗ`
              }
              title={
                excluded
                  ? "Сторінка не йде в ТЗ. Поставте позначку, щоб повернути її."
                  : "Сторінка йде в ТЗ. Знявши позначку, ви приберете її з основи."
              }
            />
          ) : (
            // Порожнє місце замість чекбокса: без нього рядки з помилкою
            // з'їхали б на 32px вліво відносно решти списку.
            <span aria-hidden className="size-4" />
          )}
        </div>

        <button
          type="button"
          onClick={() => canExpand && setOpen(!open)}
          disabled={!canExpand}
          aria-expanded={canExpand ? open : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left
            transition-colors duration-150 ease-out
            enabled:hover:bg-hover disabled:cursor-default sm:pr-4"
        >
          {analysis.status === "loading" ? (
            <Spinner className="size-3.5" />
          ) : (
            <span
              className={`size-2.5 shrink-0 rounded-full ${STATUS_DOT[analysis.status]}`}
            />
          )}

          {/* Виключений рядок пригашений, але читабельний: він лишається в
              сесії саме для того, щоб було видно, що саме прибрали. */}
          <div className={`min-w-0 flex-1 ${excluded ? "opacity-55" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p
                className={`num truncate text-xs text-muted ${
                  excluded ? "line-through" : ""
                }`}
              >
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
            {excluded ? "не в ТЗ" : STATUS_LABEL[analysis.status]}
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
      </div>

      {open && analysis.page && <PageDetails page={analysis.page} />}
    </div>
  );
}

interface AnalysisPanelProps {
  analyses: readonly PageAnalysis[];
  running: boolean;
  onRerun: () => void;
  /** Мова контенту, задана вручну. null — визначається зі сторінок. */
  contentLanguage: string | null;
  onLanguageChange: (code: string | null) => void;
  /** Знімає й повертає участь сторінки в ТЗ. */
  onToggleExcluded: (id: string) => void;
}

export function AnalysisPanel({
  analyses,
  running,
  onRerun,
  contentLanguage,
  onLanguageChange,
  onToggleExcluded,
}: AnalysisPanelProps) {
  // Через readyCount, а не за самим статусом: «виключено» рахується різницею,
  // і два різних розуміння «успішно» дали б тут відʼємне число.
  const ok = readyCount(analyses);
  const failed = analyses.filter((analysis) => analysis.status === "error").length;
  const used = analyses.filter(isUsable).length;
  const excluded = ok - used;

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
          {excluded > 0 && (
            <span className="text-warn"> · {excluded} виключено</span>
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

      {/* Мова стоїть над списком сторінок навмисно: вона стосується всього
          набору, а не окремого рядка, і побачити її треба до генерації ТЗ,
          а не після. */}
      <LanguagePanel
        analyses={analyses}
        value={contentLanguage}
        onChange={onLanguageChange}
        disabled={running}
      />

      {/* Пояснення до чекбоксів — один раз над списком, а не підписом до
          кожного рядка: сам чекбокс без слів читається як «вибрано», і що
          дасть його знімання, з рядка не видно. */}
      {ok > 0 && (
        <p className="text-2xs leading-relaxed text-subtle">
          Позначені сторінки йдуть в основу ТЗ, правок через чат і порівняння
          власної сторінки. Знімайте позначку з тих, що не годяться як зразок —
          форуму замість статті, лістингу, сторінки не про ту тему. Розібраний
          контент лишається, тому повернути її можна без повторного аналізу.
        </p>
      )}

      <div className="space-y-2">
        {analyses.map((analysis) => (
          <AnalysisRow
            key={analysis.id}
            analysis={analysis}
            onToggle={onToggleExcluded}
            disabled={running}
          />
        ))}
      </div>

      {/* Попередження, а не блокування: сторінки виключав користувач, і
          зупиняти його на цьому нема підстав — лише сказати, чим це скінчиться
          при спробі згенерувати ТЗ. */}
      {ok > 0 && used === 0 && (
        <p className="text-xs leading-relaxed text-warn">
          Не лишилося жодної сторінки для ТЗ. Поверніть хоча б одну позначку —
          інакше генерувати ТЗ буде не з чого.
        </p>
      )}
    </div>
  );
}
