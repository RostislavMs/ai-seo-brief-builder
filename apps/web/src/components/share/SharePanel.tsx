import { useEffect, useState } from "react";
import type { SessionShare, SharedSections } from "@brief/shared";
import type { TaskState } from "../../hooks/useSession";
import { formatDateTime, plural } from "../../lib/format";
import { shareUrl } from "../../services/shares";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

/**
 * Публічне посилання на сесію.
 *
 * Згорнуте за замовчуванням і одним рядком: публікація — рідка дія, а картка
 * на все відкриття сесії відтісняла б униз те, для чого сесію відкривають.
 * Сам рядок при цьому вже відповідає на головне питання — опубліковано чи ні.
 */

const NOTHING: SharedSections = { analyses: false, comparison: false };

interface SectionRowProps {
  label: string;
  hint: string;
  checked: boolean;
  /** null — розділ доступний. Рядок — причина, чому його не можна вибрати. */
  blocked: string | null;
  onChange?: (next: boolean) => void;
}

function SectionRow({
  label,
  hint,
  checked,
  blocked,
  onChange,
}: SectionRowProps) {
  const locked = onChange === undefined;

  return (
    <label
      className={`flex items-start gap-2.5 ${
        blocked || locked ? "opacity-60" : "cursor-pointer"
      }`}
      title={blocked ?? undefined}
    >
      <input
        type="checkbox"
        className="checkbox mt-0.5"
        checked={checked}
        disabled={locked || blocked !== null}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-fg">{label}</span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-subtle">
          {blocked ?? hint}
        </span>
      </span>
    </label>
  );
}

interface SharePanelProps {
  share: SessionShare | null;
  state: TaskState;
  /** true, якщо сесія змінилася після того, як зробили зліпок. */
  stale: boolean;
  /** ТЗ входить у публічну версію завжди, коли існує. */
  hasBrief: boolean;
  /** Скільки сторінок конкурентів піде в публічну версію. */
  readyPages: number;
  /** true, якщо є що показати у вкладці власної сторінки. */
  hasOwnPage: boolean;
  onPublish: (sections: SharedSections) => void;
  onUnpublish: () => void;
}

export function SharePanel({
  share,
  state,
  stale,
  hasBrief,
  readyPages,
  hasOwnPage,
  onPublish,
  onUnpublish,
}: SharePanelProps) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<SharedSections>(
    share?.sections ?? NOTHING,
  );
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // Після публікації галочки мають показувати те, що реально опубліковано:
  // інакше вибір, який сервер відкинув (розділ без даних), лишався б на вигляд
  // увімкненим.
  useEffect(() => {
    if (share) setSections(share.sections);
  }, [share]);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const url = share ? shareUrl(share.token) : "";
  const busy = state.status === "running";

  /**
   * Та сама умова, що на сервері: публікувати можна, лише якщо в зліпку щось
   * буде. Порожнє посилання гірше за неактивну кнопку — воно виглядає
   * працездатним, і про порожню сторінку автор дізнається від того, кому вже
   * його надіслав.
   */
  const willHaveContent =
    hasBrief ||
    (sections.analyses && readyPages > 0) ||
    (sections.comparison && hasOwnPage);

  async function copy(): Promise<void> {
    setCopyFailed(false);

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Найчастіша причина — сторінка не в захищеному контексті (http на
      // не-localhost): у такому разі Clipboard API просто немає.
      setCopyFailed(true);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 flex max-w-full items-center gap-2 rounded-inset px-1 py-1
          text-2xs text-subtle transition-colors duration-150 ease-out hover:text-fg"
        aria-expanded={false}
      >
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${
            share ? "bg-success-solid" : "bg-faint"
          }`}
        />
        {share ? (
          <>
            <span className="truncate">
              Публічне посилання · опубліковано{" "}
              <span className="num">{formatDateTime(share.publishedAt)}</span>
            </span>
            {stale && (
              <span className="shrink-0 rounded-inset border border-warn-line bg-warn-soft px-1.5 py-px text-warn">
                є зміни
              </span>
            )}
          </>
        ) : (
          <span>Поділитися посиланням</span>
        )}
      </button>
    );
  }

  return (
    <section className="card space-y-4 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Публічний доступ</h2>
          <p className="mt-1 text-2xs leading-relaxed text-subtle">
            {share
              ? "Сесію видно кожному, хто має посилання. Чат у публічну версію не входить ніколи."
              : "Публічна версія — зліпок на момент публікації: далі ви правите сесію " +
                "як завжди, а посилання показує старий вміст, доки не натиснете «Оновити». " +
                "Чат у неї не входить ніколи."}
          </p>
        </div>

        <button
          type="button"
          className="btn-quiet -mr-1 shrink-0"
          onClick={() => setOpen(false)}
          aria-expanded
        >
          Згорнути
        </button>
      </div>

      {state.status === "error" && (
        <Callout tone="danger" live size="xs">
          {state.message}
        </Callout>
      )}

      {share && (
        <div className="space-y-2">
          <div className="panel flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
            {/* Посилання, а не просто текст: перевірити, що саме побачить
                отримувач, — перше, що хочеться зробити після публікації. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="num min-w-0 flex-1 truncate text-xs text-accent
                underline decoration-accent-line underline-offset-2"
            >
              {url}
            </a>
            <button type="button" className="btn-quiet shrink-0" onClick={() => void copy()}>
              {copied ? "Скопійовано" : "Копіювати"}
            </button>
          </div>

          {copyFailed && (
            <p className="text-2xs text-warn" role="alert">
              Не вдалося скопіювати — виділіть посилання вручну. Буфер обміну
              доступний лише на https та localhost.
            </p>
          )}

          {stale && (
            <Callout tone="warn" size="xs">
              Сесія змінилася після публікації — за посиланням досі попередній
              вміст. Натисніть «Оновити публічну версію»: адреса при цьому не
              зміниться.
            </Callout>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        <p className="text-2xs text-subtle">Що входить у публічну версію</p>

        {/* ТЗ без чекбокса: воно — сам результат роботи, і публікувати сесію
            без нього нема сенсу. Рядок лишається, щоб склад публічної версії
            читався повністю, а не «двома галочками з чогось третього». */}
        <SectionRow
          label="SEO ТЗ"
          hint="Входить завжди"
          checked={hasBrief}
          blocked={
            hasBrief ? null : "ТЗ ще не згенероване — публікувати його нема чого"
          }
        />

        <SectionRow
          label="Сторінки конкурентів"
          hint={
            readyPages > 0
              ? `${readyPages} ${plural(readyPages, "сторінка", "сторінки", "сторінок")} з розібраним контентом і структурою заголовків`
              : ""
          }
          checked={sections.analyses}
          blocked={
            readyPages > 0
              ? null
              : "Немає жодної розібраної сторінки, яка входила б в основу ТЗ"
          }
          onChange={(next) =>
            setSections((previous) => ({ ...previous, analyses: next }))
          }
        />

        <SectionRow
          label="Моя сторінка і звіт порівняння"
          hint="Адреса вашої сторінки, її розібраний контент, бал і план дій"
          checked={sections.comparison}
          blocked={
            hasOwnPage ? null : "Власної сторінки в сесії немає або її не розібрано"
          }
          onChange={(next) =>
            setSections((previous) => ({ ...previous, comparison: next }))
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => onPublish(sections)}
          disabled={busy || !willHaveContent}
          title={
            willHaveContent ? undefined : "Немає жодного розділу з результатами"
          }
        >
          {busy && <Spinner className="size-3" />}
          {share ? "Оновити публічну версію" : "Опублікувати"}
        </button>

        {share && (
          <button
            type="button"
            className="btn-quiet hover:not-disabled:text-danger"
            onClick={onUnpublish}
            disabled={busy}
          >
            Прибрати з публічного
          </button>
        )}
      </div>

      {share && (
        <p className="text-2xs leading-relaxed text-subtle">
          «Прибрати з публічного» вбиває саме посилання: після повторної
          публікації адреса буде іншою, і стару вже не відкрити.
        </p>
      )}
    </section>
  );
}
