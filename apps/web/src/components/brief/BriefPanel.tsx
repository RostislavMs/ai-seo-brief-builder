import type { SeoBrief, WriterRequirementGroup } from "@brief/shared";
import type { TaskState } from "../../hooks/useSession";
import { copySelection } from "../../lib/copySelection";
import { plural } from "../../lib/format";
import { Callout } from "../ui/Callout";
import { EmptyState } from "../ui/EmptyState";
import { TaskProgress } from "../ui/TaskProgress";
import { CopyBrief } from "./CopyBrief";
import { IntroBlock } from "./IntroBlock";
import { KeywordTable } from "./KeywordTable";
import { MetaBlock } from "./MetaBlock";
import { Recommendations } from "./Recommendations";
import { Sources } from "./Sources";
import { StructureTree } from "./StructureTree";
import { WriterRequirements } from "./WriterRequirements";

interface BriefPanelProps {
  brief: SeoBrief | null;
  state: TaskState;
  /** Адреси сторінок в основі ТЗ — перший блок документа для райтера. */
  sources: readonly string[];
  /** Чинні вимоги до тексту — останній блок документа. */
  requirements: readonly WriterRequirementGroup[];
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
  /** Обриває запит, який уже пішов. */
  onCancel: () => void;
}

export function BriefPanel({
  brief,
  state,
  sources,
  requirements,
  readyPages,
  excludedPages,
  onGenerate,
  onCancel,
}: BriefPanelProps) {
  if (state.status === "running") {
    return (
      <TaskProgress
        title="Модель складає ТЗ…"
        scope={`${readyPages} ${plural(readyPages, "сторінка", "сторінки", "сторінок")} в основі`}
        onCancel={onCancel}
      />
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
    // onCopy: виділене мишею йде в буфер чистими заголовками, списками й
    // таблицями замість стилів інтерфейсу — див. copySelection.
    <div className="space-y-4" onCopy={copySelection}>
      {state.status === "error" && (
        <Callout tone="danger" live>
          {state.message}
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <CopyBrief brief={brief} sources={sources} requirements={requirements} />

        <button
          type="button"
          className="btn-quiet border border-line-strong"
          onClick={onGenerate}
          disabled={readyPages === 0}
        >
          Згенерувати заново
        </button>
      </div>

      {/* Конкуренти перед усім іншим: райтер спершу їх читає, а вже потім
          дивиться, що саме має написати. Той самий порядок, що в документі. */}
      <Sources sources={sources} />
      <MetaBlock brief={brief} />
      {/* Вступ між основною інформацією і структурою — у тому самому порядку,
          в якому райтер пише статтю: H1, текст під ним, далі розділи. */}
      <IntroBlock intro={brief.intro} />
      <StructureTree brief={brief} />
      <KeywordTable keywords={brief.keywords} />
      <Recommendations recommendations={brief.recommendations} />
      <WriterRequirements groups={requirements} />
    </div>
  );
}
