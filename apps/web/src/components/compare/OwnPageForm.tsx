import { useState } from "react";
import { looksLikeUrl } from "../../lib/url";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

interface OwnPageFormProps {
  /** Адреса, яку замінюємо. null — власної сторінки ще немає. */
  current: string | null;
  busy: boolean;
  onSubmit: (url: string) => void;
  /** Без обробника кнопки «Скасувати» немає: скасовувати нічого. */
  onCancel?: () => void;
}

/**
 * Адреса власної сторінки. Одне поле, а не список як у конкурентів:
 * порівнювати з ринком можна лише одну сторінку за раз — інакше «ваша
 * сторінка» в звіті перестає мати однозначне значення.
 */
export function OwnPageForm({
  current,
  busy,
  onSubmit,
  onCancel,
}: OwnPageFormProps) {
  const [url, setUrl] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent): void {
    event.preventDefault();

    const trimmed = url.trim();

    if (!trimmed) {
      setError("Вкажіть адресу своєї сторінки.");
      return;
    }

    if (!looksLikeUrl(trimmed)) {
      setError(`Не схоже на URL: ${trimmed}`);
      return;
    }

    setError(null);
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">
          Адреса вашої сторінки
        </span>
        <input
          inputMode="url"
          className="input font-mono text-base sm:text-xs"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://your-site.com/blog/post"
          aria-required
          autoFocus
        />
      </label>

      {error && (
        <Callout tone="danger" size="xs" live>
          {error}
        </Callout>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Spinner className="size-3.5" tone="on-accent" />}
          {busy
            ? "Аналізується…"
            : current
              ? "Замінити й проаналізувати"
              : "Додати й проаналізувати"}
        </button>

        {onCancel && (
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Скасувати
          </button>
        )}
      </div>

      {current && (
        <p className="text-2xs leading-relaxed text-subtle">
          Заміна адреси скидає наявний звіт: він стосується попередньої
          сторінки. Результати аналізу конкурентів лишаються — повторне
          порівняння не завантажує їх заново.
        </p>
      )}
    </form>
  );
}
