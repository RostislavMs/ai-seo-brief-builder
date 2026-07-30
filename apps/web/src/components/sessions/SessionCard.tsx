import { Link } from "react-router";
import type { SessionSummary } from "@brief/shared";
import { formatRelative, plural } from "../../lib/format";
import { Badge } from "../ui/Badge";

interface SessionCardProps {
  session: SessionSummary;
  onDelete: (id: string) => void;
}

export function SessionCard({ session, onDelete }: SessionCardProps) {
  return (
    <div className="card group flex items-center gap-3 p-3 transition-colors duration-150 ease-out hover:border-line-strong sm:gap-4 sm:p-4">
      <Link to={`/session/${session.id}`} className="min-w-0 flex-1 rounded-inset">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{session.name}</span>
          {/* Готовність — успішний стан, тому зелений: акцентний індиго
              лишається за брендом і активною навігацією. */}
          {session.hasBrief ? (
            <Badge tone="success">ТЗ готове</Badge>
          ) : (
            <Badge>чернетка</Badge>
          )}
        </div>

        {session.topic && session.topic !== session.name && (
          <p className="mt-1 truncate text-xs text-muted">{session.topic}</p>
        )}

        <p className="num mt-1.5 text-2xs text-subtle">
          {session.urlCount}{" "}
          {plural(session.urlCount, "сторінка", "сторінки", "сторінок")} ·
          оновлено {formatRelative(session.updatedAt)}
        </p>
      </Link>

      {/*
       * На дотик кнопка видима завжди: приховане під :hover на телефоні
       * недосяжне взагалі. Ефект «з'являється при наведенні» лишаємо тільки
       * там, де курсор існує (правило hover-vs-tap).
       */}
      <button
        type="button"
        onClick={() => onDelete(session.id)}
        className="shrink-0 rounded-inset px-2.5 py-1.5 text-xs text-subtle
          transition duration-150 ease-out
          hover:bg-danger-soft hover:text-danger
          focus-visible:opacity-100
          sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Видалити сесію ${session.name}`}
      >
        Видалити
      </button>
    </div>
  );
}
