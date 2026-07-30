import { useState } from "react";
import type { LanguageRule, UpdateLanguageRuleRequest } from "@brief/shared";
import { formatRelative } from "../../lib/format";
import { scopeName } from "../../lib/ruleScope";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { CheckIcon, CloseIcon, PencilIcon, PowerIcon, TrashIcon } from "../ui/Icon";

/**
 * Одне правило: текст, стан і дії над ним.
 *
 * Дії залежать від ролі, а не від стану: користувач тут лише читає — навіть
 * власну пропозицію. Правило впливає на ТЗ усіх, тому вирок над ним один
 * і належить адміну.
 *
 * Правка й відхилення розкриваються на місці, а не в модальному вікні:
 * обидві дії роблять, дивлячись на сусідні правила, і затуляти їх діалогом
 * означає забирати саме той контекст, у якому вирішують.
 */

/** Та сама межа, що в базі й у валідації маршруту. */
const MAX_LENGTH = 500;

interface StateBadge {
  label: string;
  tone: BadgeTone;
}

function stateBadge(rule: LanguageRule): StateBadge {
  if (rule.status === "pending") return { label: "на розгляді", tone: "warn" };
  if (rule.status === "rejected") return { label: "відхилено", tone: "danger" };

  return rule.enabled
    ? { label: "діє", tone: "success" }
    : { label: "вимкнено", tone: "neutral" };
}

type Mode = "view" | "edit" | "reject";

interface RuleCardProps {
  rule: LanguageRule;
  isAdmin: boolean;
  /** true — показувати область дії: у черзі розгляду вони змішані. */
  showScope?: boolean;
  busy: boolean;
  onReview: (id: string, patch: UpdateLanguageRuleRequest) => void;
  onDelete: (id: string) => void;
  /** Перемкнути сторінку на область дії цього правила. */
  onPickScope?: (code: string) => void;
}

export function RuleCard({
  rule,
  isAdmin,
  showScope = false,
  busy,
  onReview,
  onDelete,
  onPickScope,
}: RuleCardProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState(rule.rule);
  const [note, setNote] = useState("");

  const badge = stateBadge(rule);
  const pending = rule.status === "pending";

  function startEdit(): void {
    setDraft(rule.rule);
    setMode("edit");
  }

  function saveEdit(): void {
    const trimmed = draft.trim();

    // Незмінений текст не шлемо: PATCH без змін лише зайвий раз
    // перечитав би весь екран.
    if (trimmed.length < 3 || trimmed === rule.rule) {
      setMode("view");
      return;
    }

    onReview(rule.id, { rule: trimmed });
    setMode("view");
  }

  function reject(): void {
    onReview(rule.id, {
      status: "rejected",
      reviewNote: note.trim() || null,
    });
    setNote("");
    setMode("view");
  }

  function handleDelete(): void {
    if (
      window.confirm(
        `Видалити правило «${rule.rule}»? Дію не скасувати — ТЗ надалі ` +
          "генеруватимуться без нього.",
      )
    ) {
      onDelete(rule.id);
    }
  }

  return (
    <li className="card space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={badge.tone}>{badge.label}</Badge>

        {showScope &&
          (onPickScope ? (
            // Клікабельний бейдж: у черзі стоять правила з різних мов, і
            // після рішення найчастіше хочеться подивитися решту правил
            // саме цієї мови.
            <button
              type="button"
              onClick={() => onPickScope(rule.languageCode)}
              title={`Показати правила: ${scopeName(rule.languageCode)}`}
              className="rounded-inset transition-opacity hover:opacity-75"
            >
              <Badge tone="info">{scopeName(rule.languageCode)}</Badge>
            </button>
          ) : (
            <Badge tone="info">{scopeName(rule.languageCode)}</Badge>
          ))}

        {rule.mine && <Badge tone="accent">моє</Badge>}
      </div>

      {mode === "edit" ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`rule-${rule.id}`}>
            Текст правила
          </label>
          <textarea
            id={`rule-${rule.id}`}
            className="input min-h-24 resize-y leading-relaxed"
            value={draft}
            maxLength={MAX_LENGTH}
            disabled={busy}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            // Ctrl/Cmd+Enter зберігає, Esc скасовує: правку тексту роблять
            // з клавіатури, і тягтися по мишку за кожним разом незручно.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                saveEdit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMode("view");
              }
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={busy || draft.trim().length < 3}
              onClick={saveEdit}
            >
              {busy && <Spinner tone="on-accent" />}
              Зберегти
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={busy}
              onClick={() => setMode("view")}
            >
              Скасувати
            </button>
          </div>
        </div>
      ) : (
        /*
         * Текст правила — мовою автора, і читає його не лише модель. Тому
         * звичайний абзац, а не моно: правило це речення, не ідентифікатор.
         */
        <p className="text-sm leading-relaxed whitespace-pre-line text-fg">
          {rule.rule}
        </p>
      )}

      {rule.reviewNote && mode === "view" && (
        <p className="panel px-3 py-2 text-xs leading-relaxed text-muted">
          <span className="text-subtle">Коментар адміністратора: </span>
          {rule.reviewNote}
        </p>
      )}

      {mode === "reject" && (
        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">
              Причина відхилення
            </span>
            <input
              className="input"
              value={note}
              maxLength={MAX_LENGTH}
              disabled={busy}
              autoFocus
              placeholder="Необов'язково, але автор побачить саме це"
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  reject();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMode("view");
                }
              }}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={reject}
            >
              {busy && <Spinner tone="on-accent" />}
              Відхилити
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={busy}
              onClick={() => setMode("view")}
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Позначки «змінено» тут немає навмисно: updated_at рухає будь-яка
            дія адміна, зокрема вмикання, тому за ним не видно, чи правили
            саме текст. */}
        <p className="text-2xs text-subtle">
          {rule.authorEmail ?? "автора видалено"} · {formatRelative(rule.createdAt)}
        </p>

        {isAdmin && mode === "view" && (
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {busy && <Spinner />}

            {pending && (
              <>
                <button
                  type="button"
                  className="btn-quiet gap-1.5 text-success"
                  disabled={busy}
                  onClick={() => onReview(rule.id, { status: "approved" })}
                >
                  <CheckIcon className="size-3.5" />
                  Прийняти
                </button>
                <button
                  type="button"
                  className="btn-quiet gap-1.5 text-danger"
                  disabled={busy}
                  onClick={() => setMode("reject")}
                >
                  <CloseIcon className="size-3.5" />
                  Відхилити
                </button>
              </>
            )}

            {rule.status === "approved" && (
              <button
                type="button"
                className="btn-quiet gap-1.5"
                disabled={busy}
                onClick={() => onReview(rule.id, { enabled: !rule.enabled })}
              >
                <PowerIcon className="size-3.5" />
                {rule.enabled ? "Вимкнути" : "Увімкнути"}
              </button>
            )}

            {/* Відхилене правило можна повернути в дію: відхилення могло бути
                помилкою, а переписувати текст заново — марна праця. */}
            {rule.status === "rejected" && (
              <button
                type="button"
                className="btn-quiet gap-1.5 text-success"
                disabled={busy}
                onClick={() => onReview(rule.id, { status: "approved" })}
              >
                <CheckIcon className="size-3.5" />
                Прийняти все ж
              </button>
            )}

            <button
              type="button"
              className="btn-quiet gap-1.5"
              disabled={busy}
              onClick={startEdit}
            >
              <PencilIcon className="size-3.5" />
              Змінити
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="Видалити правило"
              className="grid size-8 place-items-center rounded-inset text-subtle
                transition-colors duration-150 ease-out
                hover:bg-danger-soft hover:text-danger
                disabled:cursor-not-allowed disabled:opacity-45"
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
