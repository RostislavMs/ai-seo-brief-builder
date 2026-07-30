import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@brief/shared";
import type { TaskState } from "../../hooks/useSession";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Callout } from "../ui/Callout";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";

/** Приклади запитів із розділу 10 ТЗ — щоб не гадати, що взагалі можна просити. */
const SUGGESTIONS = [
  "Додай H2 про типові помилки",
  "Збільш загальний обсяг до 3500 слів",
  "Переформулюй FAQ простішою мовою",
  "Додай таблицю порівняння в третій розділ",
];

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] space-y-1 sm:max-w-[80%]">
        <div
          className={`rounded-card px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
            isUser
              ? "border border-accent-line bg-accent-soft text-fg"
              : "border border-line bg-inset text-fg"
          }`}
        >
          {message.content}
        </div>

        <div
          className={`flex items-center gap-2 px-1 ${isUser ? "justify-end" : ""}`}
        >
          <span className="num text-2xs text-subtle">
            {formatDateTime(message.createdAt)}
          </span>
          {message.changedBrief && <Badge tone="success">ТЗ оновлено</Badge>}
        </div>
      </div>
    </div>
  );
}

interface ChatPanelProps {
  messages: readonly ChatMessage[];
  state: TaskState;
  /** Чат недоступний, поки немає ТЗ: правити нічого. */
  hasBrief: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({
  messages,
  state,
  hasBrief,
  onSend,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const running = state.status === "running";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, running]);

  if (!hasBrief) {
    return (
      <EmptyState
        title="Спершу потрібне ТЗ"
        description="Згенеруйте SEO ТЗ на вкладці «SEO ТЗ» — після цього його можна буде правити тут словами."
      />
    );
  }

  function submit(): void {
    const value = text.trim();
    if (!value || running) return;
    setText("");
    onSend(value);
  }

  return (
    <div className="space-y-4">
      <div className="card min-h-96 space-y-4 p-4 sm:p-5">
        {messages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-fg">
              Опишіть словами, що змінити в ТЗ
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-subtle">
              Правки застосовуються до поточного ТЗ, сторінки повторно не
              парсяться.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full border border-line-strong px-3 py-2 text-xs text-muted
                    transition-colors duration-150 ease-out
                    hover:border-accent hover:bg-accent-soft hover:text-accent"
                  onClick={() => onSend(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}

            {running && (
              <div
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-subtle"
              >
                <Spinner className="size-3.5" />
                Модель опрацьовує запит…
              </div>
            )}

            <div ref={bottom} />
          </>
        )}
      </div>

      {state.status === "error" && (
        <Callout tone="danger" live>
          {state.message}
        </Callout>
      )}

      <div className="flex gap-2">
        <textarea
          className="input min-h-20 resize-y"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter надсилає, Shift+Enter — новий рядок.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Наприклад: додай H3 про вибір ключових слів у другий розділ"
          aria-label="Правка до ТЗ"
          disabled={running}
        />

        <button
          type="button"
          className="btn-primary self-end"
          onClick={submit}
          disabled={running || text.trim().length === 0}
        >
          {running ? <Spinner className="size-4" tone="on-accent" /> : "Надіслати"}
        </button>
      </div>
    </div>
  );
}
