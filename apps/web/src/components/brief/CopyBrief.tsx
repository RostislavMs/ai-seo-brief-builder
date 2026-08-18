import { useEffect, useState } from "react";
import type { SeoBrief, WriterRequirementGroup } from "@brief/shared";
import { briefPayload } from "../../lib/briefDocument";
import { copyFormatted, copyPlain } from "../../lib/clipboard";
import { CheckIcon, CopyIcon } from "../ui/Icon";

/**
 * Копіювання готового ТЗ.
 *
 * Дві кнопки, а не одна з перемикачем: сценарії різні й обидва часті. «З
 * форматуванням» іде в Google Docs і Word — заголовками, списками й
 * таблицями; markdown — у Notion, ChatGPT і будь-яке текстове поле, де
 * HTML вставився б купою розмітки.
 */

type Copied = "formatted" | "markdown" | null;

interface CopyBriefProps {
  brief: SeoBrief;
  /**
   * Адреси конкурентів, з яких складено ТЗ. Належать сесії, а не ТЗ, тому
   * приходять окремо — інакше «список джерел» довелося б класти у вивід
   * моделі, яка їх не обирала.
   */
  sources?: readonly string[];
  /** Чинні вимоги до тексту — останній блок документа. */
  requirements?: readonly WriterRequirementGroup[];
}

export function CopyBrief({
  brief,
  sources = [],
  requirements = [],
}: CopyBriefProps) {
  const [copied, setCopied] = useState<Copied>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function run(mode: NonNullable<Copied>): Promise<void> {
    setFailed(false);

    // Документ будується на кліку, а не заздалегідь: ТЗ — це десятки розділів
    // і сотні рядків таблиці, і тримати два його представлення в памʼяті на
    // кожному відкритті вкладки нема сенсу.
    const { html, text } = briefPayload(brief, sources, requirements);
    const ok =
      mode === "formatted"
        ? await copyFormatted(html, text)
        : await copyPlain(text);

    if (ok) setCopied(mode);
    else setFailed(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        className="btn-quiet border border-line-strong"
        onClick={() => void run("formatted")}
      >
        {copied === "formatted" ? (
          <CheckIcon className="size-3.5 text-success" />
        ) : (
          <CopyIcon />
        )}
        {copied === "formatted" ? "Скопійовано" : "Копіювати все"}
      </button>

      <button
        type="button"
        className="btn-quiet"
        onClick={() => void run("markdown")}
        title="Звичайний текст із розміткою Markdown"
      >
        {copied === "markdown" ? "Скопійовано" : "Markdown"}
      </button>

      {failed && (
        <p className="w-full text-2xs text-warn" role="alert">
          Не вдалося скопіювати. Буфер обміну доступний лише на https
          та localhost.
        </p>
      )}
    </div>
  );
}
