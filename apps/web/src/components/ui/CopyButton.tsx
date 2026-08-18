import { useEffect, useState } from "react";
import type { CopyPayload } from "../../lib/briefDocument";
import { copyFormatted } from "../../lib/clipboard";
import { CheckIcon, CopyIcon } from "./Icon";

/**
 * Копіювання одного шматка ТЗ — розділу, списку, значення поля.
 *
 * Поруч із заголовками й переліками, бо саме так ТЗ і розбирають: заголовок
 * у документ, список ключів у таблицю, Title у CMS. Виділяти це мишею щоразу
 * незручно, а копіювання всього ТЗ для такої дрібниці завелике.
 *
 * Кнопка видима завжди, а не лише при наведенні: на дотикових екранах
 * наведення немає, і кнопка, якої не видно, не існує.
 */

interface CopyButtonProps {
  /**
   * Береться на кліку, а не наперед: таких кнопок у ТЗ десятки, і будувати
   * розмітку для кожної на кожному перерендері нема потреби.
   */
  payload: () => CopyPayload;
  /** Що саме копіюється — для підказки й скрінрідера. */
  label: string;
  className?: string;
}

export function CopyButton({ payload, label, className }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;

    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    const { html, text } = payload();
    setState((await copyFormatted(html, text)) ? "done" : "failed");
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={state === "failed" ? "Не вдалося скопіювати" : label}
      aria-label={label}
      // self-center: рядки із заголовками вирівняні по базовій лінії тексту,
      // а в кнопки з самою іконкою базової лінії немає.
      className={`-my-1 inline-flex shrink-0 items-center justify-center self-center
        rounded-inset px-1.5 py-1 transition-colors duration-150 ease-out
        ${state === "failed" ? "text-warn" : "text-faint hover:bg-hover hover:text-fg"}
        ${className ?? ""}`}
    >
      {state === "done" ? (
        <CheckIcon className="size-3.5 text-success" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}
