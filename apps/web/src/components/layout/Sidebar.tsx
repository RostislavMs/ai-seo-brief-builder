import { useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import type { SessionSummary } from "@brief/shared";
import { useAccount } from "../../auth/AccountContext";
import { useAuth } from "../../auth/AuthContext";
import { useSessions } from "../../sessions/SessionsContext";
import { formatRelative } from "../../lib/format";
import { Spinner } from "../ui/Spinner";
import {
  BracesIcon,
  GlobeIcon,
  LogoutIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
} from "../ui/Icon";

/**
 * Бічна панель зі списком сесій — та сама роль, що в ChatGPT, Gemini
 * і Claude: створити нове, знайти старе, дістатися налаштувань.
 *
 * Групування за давністю, а не суцільний список: у роботі накопичуються
 * десятки сесій, і «Сьогодні» треба відрізняти від «місяць тому» без
 * читання дат.
 */

interface Group {
  label: string;
  items: SessionSummary[];
}

const DAY_MS = 86_400_000;

function groupByRecency(sessions: readonly SessionSummary[]): Group[] {
  const now = Date.now();
  const buckets: Group[] = [
    { label: "Сьогодні", items: [] },
    { label: "Вчора", items: [] },
    { label: "Останні 7 днів", items: [] },
    { label: "Раніше", items: [] },
  ];

  for (const session of sessions) {
    const age = now - new Date(session.updatedAt).getTime();

    // Порівняння за добами від «зараз», а не за календарними днями:
    // для списку важлива давність, а не те, чи перетнула дата північ.
    const index = age < DAY_MS ? 0 : age < 2 * DAY_MS ? 1 : age < 7 * DAY_MS ? 2 : 3;
    buckets[index]?.items.push(session);
  }

  return buckets.filter((group) => group.items.length > 0);
}

/**
 * Спільні для команди розділи в підвалі панелі. Один вираз на всі: розійтися
 * у вигляді вони не мають права — це один список, а не кілька кнопок поспіль.
 */
function sectionClass({ isActive }: { isActive: boolean }): string {
  return `flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-sm
    transition-colors duration-150 ease-out ${
      isActive ? "bg-surface text-fg" : "text-muted hover:bg-hover hover:text-fg"
    }`;
}

interface SidebarProps {
  /** Викликається після переходу — щоб на мобільному закрилася шухляда. */
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const { id: activeId } = useParams<{ id: string }>();
  const { sessions, loading, error, remove } = useSessions();
  const { me } = useAccount();
  const { signOut, user } = useAuth();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = needle
      ? sessions.filter(
          (session) =>
            session.name.toLowerCase().includes(needle) ||
            session.topic.toLowerCase().includes(needle),
        )
      : sessions;

    return groupByRecency(filtered);
  }, [sessions, query]);

  async function handleDelete(session: SessionSummary): Promise<void> {
    if (!window.confirm(`Видалити сесію «${session.name}»? Дію не скасувати.`)) {
      return;
    }

    await remove(session.id);

    // Якщо видалили відкриту сесію — далі показувати нема чого.
    if (session.id === activeId) navigate("/");
  }

  const displayName = me?.profile.displayName ?? null;
  const email = me?.profile.email ?? user?.email ?? "";
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();
  const pendingRules = me?.pendingRules ?? 0;

  return (
    <div className="flex h-full flex-col bg-inset">
      <div className="flex flex-col gap-3 px-3 py-3">
        <NavLink
          to="/"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-inset px-1 py-1"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-inset bg-accent-solid font-mono text-xs font-bold text-accent-ink">
            AI
          </span>
          <span className="truncate text-sm font-semibold">SEO Brief Builder</span>
        </NavLink>

        <NavLink
          to="/"
          onClick={onNavigate}
          className="btn-primary w-full justify-start gap-2 py-2 text-sm"
        >
          <PlusIcon />
          Нова сесія
        </NavLink>

        {/* Пошук показуємо лише коли є що шукати: на порожньому списку
            він додає шум і забирає місце. */}
        {sessions.length > 4 && (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук сесій"
              aria-label="Пошук сесій"
              className="input py-1.5 pl-8 text-sm"
            />
          </div>
        )}
      </div>

      <nav
        aria-label="Сесії"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {loading && sessions.length === 0 && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {error && (
          <p className="px-2 py-3 text-xs leading-relaxed text-danger">{error}</p>
        )}

        {!loading && sessions.length === 0 && !error && (
          <p className="px-2 py-3 text-xs leading-relaxed text-subtle">
            Сесій ще немає. Додайте URL конкурентів — і отримаєте готове ТЗ.
          </p>
        )}

        {sessions.length > 0 && groups.length === 0 && (
          <p className="px-2 py-3 text-xs text-subtle">Нічого не знайдено.</p>
        )}

        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-2 pt-3 pb-1 text-2xs font-medium tracking-wide text-subtle uppercase">
              {group.label}
            </p>

            <ul className="space-y-0.5">
              {group.items.map((session) => {
                const active = session.id === activeId;

                return (
                  <li key={session.id} className="group relative">
                    <NavLink
                      to={`/session/${session.id}`}
                      onClick={onNavigate}
                      className={`block rounded-control py-1.5 pr-9 pl-2
                        transition-colors duration-150 ease-out ${
                          active
                            ? "bg-surface text-fg"
                            : "text-muted hover:bg-hover hover:text-fg"
                        }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm">{session.name}</span>
                        {session.hasBrief && (
                          <span
                            aria-label="ТЗ готове"
                            title="ТЗ готове"
                            className="size-1.5 shrink-0 rounded-full bg-success-solid"
                          />
                        )}
                      </span>
                      <span className="num mt-0.5 block truncate text-2xs text-subtle">
                        {formatRelative(session.updatedAt)}
                      </span>
                    </NavLink>

                    {/*
                     * На дотик кнопка видима завжди: приховане під :hover
                     * на телефоні недосяжне взагалі.
                     */}
                    <button
                      type="button"
                      onClick={() => void handleDelete(session)}
                      aria-label={`Видалити сесію ${session.name}`}
                      className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2
                        place-items-center rounded-inset text-subtle
                        transition duration-150 ease-out
                        hover:bg-danger-soft hover:text-danger
                        focus-visible:opacity-100
                        sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-2 py-2">
        {/*
         * Правила для мов і промпти — поряд із налаштуваннями, а не в них:
         * вони спільні для команди, а налаштування особисті. Бейдж показує
         * пропозиції, що чекають розгляду; для звичайного користувача це
         * його власні, і побачити зміну їхнього стану він має, не заходячи
         * на сторінку.
         */}
        <NavLink to="/rules" onClick={onNavigate} className={sectionClass}>
          <GlobeIcon className="size-4 shrink-0 text-subtle" />
          <span className="min-w-0 flex-1 truncate">Правила для мов</span>
          {pendingRules > 0 && (
            <span
              aria-label={`${pendingRules} на розгляді`}
              title={`${pendingRules} на розгляді`}
              className="num shrink-0 rounded-inset bg-warn-soft px-1.5 py-0.5
                text-2xs leading-none font-medium text-warn"
            >
              {pendingRules}
            </span>
          )}
        </NavLink>

        {/*
         * Промпти — під правилами: правило дописується в промпт, тому «що
         * просимо в моделі» логічно читати після «які в нас додаткові вимоги».
         * Бейджа тут немає й бути не може: промпт не має стану, який чекав би
         * чиєїсь реакції.
         */}
        <NavLink to="/prompts" onClick={onNavigate} className={sectionClass}>
          <BracesIcon className="size-4 shrink-0 text-subtle" />
          <span className="min-w-0 flex-1 truncate">Промпти</span>
        </NavLink>

        {me && (
          // Рядок про активну модель тут навмисно: витрати рахує саме він,
          // і побачити підміну провайдера треба одразу, а не в налаштуваннях.
          <p className="num px-2 pt-1 pb-2 text-2xs text-subtle">
            {me.effective.source === "none"
              ? "AI не налаштовано"
              : me.effective.model}
          </p>
        )}

        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-left
             transition-colors duration-150 ease-out ${
               isActive ? "bg-surface text-fg" : "text-muted hover:bg-hover hover:text-fg"
             }`
          }
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{displayName || email}</span>
            {displayName && (
              <span className="block truncate text-2xs text-subtle">{email}</span>
            )}
          </span>
          <SettingsIcon className="size-4 shrink-0 text-subtle" />
        </NavLink>

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2.5 rounded-control px-2 py-2
            text-sm text-subtle transition-colors duration-150 ease-out
            hover:bg-hover hover:text-fg"
        >
          <LogoutIcon />
          Вийти
        </button>
      </div>
    </div>
  );
}
