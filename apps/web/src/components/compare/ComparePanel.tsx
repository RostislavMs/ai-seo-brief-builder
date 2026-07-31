import { useState } from "react";
import type { PageAnalysis, PageComparison } from "@brief/shared";
import type { TaskState } from "../../hooks/useSession";
import { formatNumber, plural } from "../../lib/format";
import { shortenUrl } from "../../lib/url";
import { PageDetails } from "../analysis/PageDetails";
import { SourceBadge } from "../analysis/SourceBadge";
import { Callout } from "../ui/Callout";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { TaskProgress } from "../ui/TaskProgress";
import { ComparisonReport } from "./ComparisonReport";
import { OwnPageForm } from "./OwnPageForm";

interface OwnPageCardProps {
  analysis: PageAnalysis;
  busy: boolean;
  onRerun: () => void;
  onReplace: () => void;
  onRemove: () => void;
}

/**
 * Рядок власної сторінки. Схожий на рядок конкурента, але з діями: цю
 * сторінку можна перепарсити, замінити й прибрати, а конкурентів — лише
 * перепарсити всіх разом.
 */
function OwnPageCard({
  analysis,
  busy,
  onRerun,
  onReplace,
  onRemove,
}: OwnPageCardProps) {
  const [open, setOpen] = useState(false);
  const page = analysis.page;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
        {analysis.status === "loading" ? (
          <Spinner className="size-3.5" />
        ) : (
          <span
            className={`size-2.5 shrink-0 rounded-full ${
              analysis.status === "success"
                ? "bg-success-solid"
                : analysis.status === "error"
                  ? "bg-danger-solid"
                  : "bg-faint"
            }`}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={analysis.url}
              target="_blank"
              rel="noreferrer noopener"
              className="num truncate text-xs text-muted underline
                decoration-line-strong underline-offset-2
                transition-colors duration-150 ease-out hover:text-fg"
            >
              {shortenUrl(analysis.url, 70)}
            </a>
            {page && (
              <SourceBadge
                source={page.meta.source}
                archivedAt={page.meta.archivedAt}
                hideDirect
              />
            )}
          </div>

          {analysis.status === "error" && analysis.error && (
            <p className="mt-1 text-xs text-danger">{analysis.error}</p>
          )}

          {page && (
            <p className="num mt-1 text-2xs text-subtle">
              {formatNumber(page.wordCount)} слів · {page.headings.length}{" "}
              {plural(
                page.headings.length,
                "заголовок",
                "заголовки",
                "заголовків",
              )}
              {page.tables.length > 0 && ` · ${page.tables.length} табл.`}
              {page.faq.length > 0 && ` · ${page.faq.length} FAQ`}
            </p>
          )}
        </div>

        {/* w-full під sm: чотири дії поряд із адресою стискають її до
            нечитабельної колонки, тому на вузьких екранах вони йдуть
            окремим рядком. */}
        <div
          className="flex w-full shrink-0 flex-wrap items-center justify-end
            gap-1 sm:w-auto"
        >
          {page && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
            >
              {open ? "Згорнути" : "Деталі"}
            </button>
          )}
          <button
            type="button"
            className="btn-quiet"
            onClick={onRerun}
            disabled={busy}
          >
            {busy && <Spinner className="size-3" />}
            {busy ? "Аналізується…" : "Заново"}
          </button>
          <button
            type="button"
            className="btn-quiet"
            onClick={onReplace}
            disabled={busy}
          >
            Змінити
          </button>
          <button
            type="button"
            className="btn-quiet hover:not-disabled:text-danger"
            onClick={onRemove}
            disabled={busy}
          >
            Прибрати
          </button>
        </div>
      </div>

      {open && page && <PageDetails page={page} />}
    </div>
  );
}

interface ComparePanelProps {
  ownPage: PageAnalysis | null;
  comparison: PageComparison | null;
  ownPageState: TaskState;
  comparisonState: TaskState;
  /**
   * Скільки сторінок конкурентів придатні для порівняння: розібрані успішно
   * й не виключені вручну у вкладці «Аналіз».
   */
  readyCompetitors: number;
  /**
   * Скільки розібраних сторінок конкурентів виключено вручну. Відрізняє
   * «нічого не розібралося» від «усе прибрали з основи»: виправляють це
   * різними діями.
   */
  excludedCompetitors: number;
  /**
   * true, якщо конкурентів проаналізували заново вже після порівняння —
   * тоді звіт складено за даними, яких у сесії більше немає.
   */
  stale: boolean;
  onAdd: (url: string) => void;
  onRerunAnalysis: () => void;
  onRemove: () => void;
  onCompare: () => void;
  /** Обриває порівняння, яке вже пішло. */
  onCancelCompare: () => void;
}

/**
 * Аналіз власної сторінки відносно конкурентів (розділ 15 ТЗ).
 *
 * Порівняння — навмисно за кнопкою, як і генерація ТЗ: воно витрачає токени,
 * і автозапуск на кожному відкритті вкладки був би неприємним сюрпризом.
 * Парсинг самої сторінки, навпаки, стартує одразу після додавання адреси:
 * він безкоштовний, і без нього порівнювати нічого.
 */
export function ComparePanel({
  ownPage,
  comparison,
  ownPageState,
  comparisonState,
  readyCompetitors,
  excludedCompetitors,
  stale,
  onAdd,
  onRerunAnalysis,
  onRemove,
  onCompare,
  onCancelCompare,
}: ComparePanelProps) {
  const [replacing, setReplacing] = useState(false);

  const busy = ownPageState.status === "running";
  const parsing = busy || ownPage?.status === "loading";

  if (!ownPage) {
    return (
      <div className="space-y-3">
        {ownPageState.status === "error" && (
          <Callout tone="danger" live>
            {ownPageState.message}
          </Callout>
        )}

        <section className="card space-y-5 p-4 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold">Ваша сторінка</h2>
            <p className="mt-1 text-sm leading-relaxed text-subtle">
              Сторінка, яка вже існує й має конкурувати з проаналізованими.
              Вона проходить той самий парсинг, а потім модель шукає, чого на
              ній бракує з того, що покривають конкуренти.
            </p>
          </div>

          <OwnPageForm current={null} busy={busy} onSubmit={onAdd} />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ownPageState.status === "error" && (
        <Callout tone="danger" live>
          {ownPageState.message}
        </Callout>
      )}

      <OwnPageCard
        analysis={ownPage}
        busy={parsing}
        onRerun={onRerunAnalysis}
        onReplace={() => setReplacing(true)}
        onRemove={onRemove}
      />

      {replacing && (
        <section className="card p-4 sm:p-5">
          <OwnPageForm
            current={ownPage.url}
            busy={busy}
            onSubmit={(url) => {
              setReplacing(false);
              onAdd(url);
            }}
            onCancel={() => setReplacing(false)}
          />
        </section>
      )}

      {comparisonState.status === "error" && (
        <Callout tone="danger" live>
          {comparisonState.message}
        </Callout>
      )}

      {comparisonState.status === "running" ? (
        <TaskProgress
          title="Модель порівнює сторінку з конкурентами…"
          scope={`${readyCompetitors} ${plural(readyCompetitors, "конкурент", "конкуренти", "конкурентів")}`}
          onCancel={onCancelCompare}
        />
      ) : comparison ? (
        <>
          {stale && (
            <Callout tone="warn" size="xs">
              Конкурентів проаналізували заново після цього порівняння — звіт
              складено за попередніми даними. Порівняйте ще раз, щоб він
              відповідав поточним сторінкам.
            </Callout>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-quiet border border-line-strong"
              onClick={onCompare}
              disabled={readyCompetitors === 0 || ownPage.status !== "success"}
            >
              Порівняти заново
            </button>
          </div>

          <ComparisonReport comparison={comparison} />
        </>
      ) : (
        <EmptyState
          title="Сторінку ще не порівнювали"
          description={
            ownPage.status !== "success"
              ? "Спершу власну сторінку треба успішно проаналізувати."
              : readyCompetitors > 0
                ? `Готово ${readyCompetitors} ${plural(
                    readyCompetitors,
                    "сторінка конкурента",
                    "сторінки конкурентів",
                    "сторінок конкурентів",
                  )} — можна порівнювати.`
                : excludedCompetitors > 0
                  ? "Усіх розібраних конкурентів виключено з основи. Поверніть " +
                    "хоча б одну позначку у вкладці «Аналіз»."
                  : "Потрібна хоча б одна успішно проаналізована сторінка конкурента."
          }
        >
          <button
            type="button"
            className="btn-primary mt-2"
            onClick={onCompare}
            disabled={readyCompetitors === 0 || ownPage.status !== "success"}
          >
            Порівняти з конкурентами
          </button>
        </EmptyState>
      )}
    </div>
  );
}
