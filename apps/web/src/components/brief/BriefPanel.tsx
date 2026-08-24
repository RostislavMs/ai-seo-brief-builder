import { useMemo } from "react";
import type { SeoBrief, WriterRequirementGroup } from "@brief/shared";
import type { SaveState, TaskState } from "../../hooks/useSession";
import { changedAt } from "../../lib/briefEdit";
import { copySelection } from "../../lib/copySelection";
import { plural } from "../../lib/format";
import { Callout } from "../ui/Callout";
import { EmptyState } from "../ui/EmptyState";
import { TaskProgress } from "../ui/TaskProgress";
import { CopyBrief } from "./CopyBrief";
import { BriefEditProvider } from "./edit/BriefEditContext";
import { IntroBlock } from "./IntroBlock";
import { KeywordTable } from "./KeywordTable";
import { MetaBlock } from "./MetaBlock";
import { Recommendations } from "./Recommendations";
import { Sources } from "./Sources";
import { StructureTree } from "./StructureTree";
import { WriterRequirements } from "./WriterRequirements";

interface BriefPanelProps {
  brief: SeoBrief | null;
  /** ТЗ у тому вигляді, в якому його віддала модель. */
  original: SeoBrief | null;
  state: TaskState;
  /** Збереження ручної правки. */
  save: SaveState;
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
  /** Ручна правка ТЗ — функцією від поточного ТЗ. */
  onEdit: (compute: (brief: SeoBrief) => SeoBrief) => void;
  /** Повертає все ТЗ до машинної версії. */
  onRevert: () => void;
}

const SAVE_TEXT: Record<SaveState["status"], string> = {
  idle: "",
  saving: "зберігаю…",
  saved: "збережено",
  error: "не збережено",
};

/**
 * Стан збереження правки — рядком, а не значком.
 *
 * «Збережено» показується постійно, поки не станеться наступна правка: у ТЗ
 * зберігається кожне поле окремо, і зникаючий напис змушував би дивитися,
 * чи він устиг з'явитися. Причину невдачі показує окреме повідомлення —
 * вона одна тут і є подією.
 */
function SaveStatus({ save }: { save: SaveState }) {
  return (
    // Елемент на місці навіть порожній: aria-live озвучує зміни всередині
    // ділянки, а ділянка, яка щойно з'явилася разом із текстом, лишилася б
    // непочутою.
    <span
      aria-live="polite"
      className={`text-2xs ${save.status === "error" ? "text-warn" : "text-subtle"}`}
    >
      {SAVE_TEXT[save.status]}
    </span>
  );
}

export function BriefPanel({
  brief,
  original,
  state,
  save,
  sources,
  requirements,
  readyPages,
  excludedPages,
  onGenerate,
  onCancel,
  onEdit,
  onRevert,
}: BriefPanelProps) {
  /**
   * Чи є в ТЗ ручні правки. Порожній шлях — порівняння ТЗ цілком.
   *
   * У useMemo, бо це єдине порівняння тут, яке проходить усе дерево: поля
   * порівнюють лише своє значення, а це — сотні вузлів, і рахувати їх на
   * кожній перемальовці під час набору немає потреби.
   */
  const edited = useMemo(
    () => changedAt(brief, original, []),
    [brief, original],
  );

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

      {save.status === "error" && (
        <Callout tone="warn" live>
          {save.message} Правка лишилася в цьому вікні — наступна зміна спробує
          записати її ще раз.
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Підказка про правку — не окремим блоком: ТЗ читають як документ, і
            смуга «тут можна редагувати» над ним висіла б назавжди. */}
        <p className="text-2xs text-subtle">
          Будь-яке поле ТЗ можна виправити — клікніть у текст.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <SaveStatus save={save} />

          {edited && (
            <button
              type="button"
              className="btn-quiet border border-line-strong"
              title="Прибрати всі ручні правки й повернути ТЗ у тому вигляді, в якому його склала модель"
              onClick={onRevert}
            >
              Повернути згенероване
            </button>
          )}

          <CopyBrief
            brief={brief}
            sources={sources}
            requirements={requirements}
          />

          <button
            type="button"
            className="btn-quiet border border-line-strong"
            onClick={onGenerate}
            disabled={readyPages === 0}
          >
            Згенерувати заново
          </button>
        </div>
      </div>

      {/*
       * Провайдер саме тут, а не в App: він і є перемикач «це робоче ТЗ, його
       * можна правити». Ті самі компоненти малюють публічне посилання, і там
       * провайдера немає — тому вони показують ТЗ без жодного поля введення.
       */}
      <BriefEditProvider brief={brief} original={original} onChange={onEdit}>
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
      </BriefEditProvider>
    </div>
  );
}
