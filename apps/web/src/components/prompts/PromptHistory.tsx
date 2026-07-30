import { useEffect, useState } from "react";
import type { PromptVersion } from "@brief/shared";
import { ApiRequestError } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { fetchPromptHistory } from "../../services/prompts";
import { Badge } from "../ui/Badge";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

/**
 * Історія правок одного промпта.
 *
 * Завантажується при розкритті, а не разом зі списком: історія потрібна рідко,
 * а важить більше за самі промпти — кожна редакція це повний текст.
 *
 * Кожну редакцію можна повернути в дію. Це та сама дія, що й правка руками:
 * текст із редакції надсилається як новий, а не «відкочується» — інакше
 * повернення до старого промпта зникало б з історії, і за нею не було б видно,
 * чим саме генерувалося ТЗ у той чи інший тиждень.
 */

interface PromptHistoryProps {
  promptKey: string;
  /** Чинний текст — щоб не пропонувати повернути те, що вже діє. */
  currentBody: string;
  /**
   * Скільки разів промпт правили. Перечитує історію, коли число змінилося:
   * повернути редакцію можна не закриваючи цей список, і без такої залежності
   * він показував би стан до власної ж дії.
   */
  revision: number;
  busy: boolean;
  onRestore: (body: string) => void;
}

export function PromptHistory({
  promptKey,
  currentBody,
  revision,
  busy,
  onRestore,
}: PromptHistoryProps) {
  const [versions, setVersions] = useState<PromptVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setVersions(await fetchPromptHistory(promptKey, controller.signal));
      } catch (caught) {
        if (caught instanceof ApiRequestError && caught.code === "aborted") return;
        setError(caught instanceof Error ? caught.message : "Невідома помилка");
      }
    })();

    return () => controller.abort();
  }, [promptKey, revision]);

  if (error) {
    return (
      <Callout tone="danger" size="xs">
        {error}
      </Callout>
    );
  }

  if (!versions) {
    return (
      <div className="flex justify-center py-4">
        <Spinner className="size-4" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="panel px-3 py-2 text-xs leading-relaxed text-subtle">
        Промпт ще не правили — діє початковий текст.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5">
      {versions.map((version, index) => {
        const open = openId === version.id;
        // Скидання показує не текст, а те, що промпт повернули до початкового:
        // сам текст у такому разі є в коді й видно вище.
        const reset = version.body === null;
        const current = index === 0;

        return (
          <li key={version.id} className="panel px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {reset ? (
                <Badge tone="info">скинуто</Badge>
              ) : (
                <Badge tone={current ? "success" : "neutral"}>
                  {current ? "діє зараз" : "правка"}
                </Badge>
              )}

              <span className="num text-2xs text-subtle">
                {formatDateTime(version.createdAt)}
              </span>
              <span className="min-w-0 flex-1 truncate text-2xs text-subtle">
                {version.authorEmail ?? "автора видалено"}
              </span>

              {!reset && (
                <button
                  type="button"
                  className="btn-quiet px-2 py-1 text-2xs"
                  onClick={() => setOpenId(open ? null : version.id)}
                >
                  {open ? "Згорнути" : "Показати текст"}
                </button>
              )}
            </div>

            {version.note && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {version.note}
              </p>
            )}

            {open && version.body !== null && (
              <div className="mt-2 space-y-2">
                <pre className="max-h-72 overflow-auto rounded-inset bg-inset px-3 py-2 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-muted">
                  {version.body}
                </pre>

                {version.body !== currentBody && (
                  <button
                    type="button"
                    className="btn-quiet border border-line-strong text-xs"
                    disabled={busy}
                    onClick={() => onRestore(version.body!)}
                  >
                    {busy && <Spinner className="size-3" />}
                    Повернути цю редакцію
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
