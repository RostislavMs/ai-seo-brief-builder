import type { SeoBrief } from "@brief/shared";
import type { TaskState } from "../../hooks/useSession";
import { plural } from "../../lib/format";
import { Callout } from "../ui/Callout";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";
import { IntroBlock } from "./IntroBlock";
import { KeywordTable } from "./KeywordTable";
import { MetaBlock } from "./MetaBlock";
import { Recommendations } from "./Recommendations";
import { StructureTree } from "./StructureTree";

interface BriefPanelProps {
  brief: SeoBrief | null;
  state: TaskState;
  /**
   * Скільки сторінок піде в AI: розібрані успішно й не виключені вручну
   * у вкладці «Аналіз».
   */
  readyPages: number;
  /**
   * Скільки розібраних сторінок виключено вручну. Потрібне, щоб відрізнити
   * «жодну сторінку не вдалося розібрати» від «усі прибрали з основи»: дії
   * для виправлення в цих випадках різні й ведуть у різні місця.
   */
  excludedPages: number;
  onGenerate: () => void;
}

export function BriefPanel({
  brief,
  state,
  readyPages,
  excludedPages,
  onGenerate,
}: BriefPanelProps) {
  if (state.status === "running") {
    return (
      <div
        aria-live="polite"
        className="card flex flex-col items-center gap-3 px-6 py-16 text-center"
      >
        <Spinner className="size-6" />
        <p className="text-sm font-medium text-fg">Модель складає ТЗ…</p>
        <p className="text-xs text-subtle">
          Зазвичай 20–45 секунд залежно від моделі та кількості сторінок.
        </p>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="space-y-3">
        {state.status === "error" && (
          <Callout tone="danger" live>
            {state.message}
          </Callout>
        )}

        <EmptyState
          title="ТЗ ще не згенероване"
          description={
            readyPages > 0
              ? `В основі ${readyPages} ${plural(readyPages, "сторінка", "сторінки", "сторінок")} — можна складати ТЗ.` +
                (excludedPages > 0
                  ? ` Ще ${excludedPages} виключено у вкладці «Аналіз».`
                  : "")
              : excludedPages > 0
                ? "Усі розібрані сторінки виключено з основи. Поверніть хоча б одну " +
                  "позначку у вкладці «Аналіз»."
                : "Спершу потрібна хоча б одна успішно проаналізована сторінка."
          }
        >
          <button
            type="button"
            className="btn-primary mt-2"
            onClick={onGenerate}
            disabled={readyPages === 0}
          >
            Згенерувати SEO ТЗ
          </button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.status === "error" && (
        <Callout tone="danger" live>
          {state.message}
        </Callout>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-quiet border border-line-strong"
          onClick={onGenerate}
          disabled={readyPages === 0}
        >
          Згенерувати заново
        </button>
      </div>

      <MetaBlock brief={brief} />
      {/* Вступ між основною інформацією і структурою — у тому самому порядку,
          в якому райтер пише статтю: H1, текст під ним, далі розділи. */}
      <IntroBlock intro={brief.intro} />
      <StructureTree brief={brief} />
      <KeywordTable keywords={brief.keywords} />
      <Recommendations recommendations={brief.recommendations} />
    </div>
  );
}
