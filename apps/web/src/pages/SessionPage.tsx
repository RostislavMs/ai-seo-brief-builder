import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { BriefPanel } from "../components/brief/BriefPanel";
import { ChatPanel } from "../components/chat/ChatPanel";
import { ComparePanel } from "../components/compare/ComparePanel";
import { Callout } from "../components/ui/Callout";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { formatDateTime } from "../lib/format";
import { readJson, writeJson } from "../lib/storage";
import { useSession } from "../hooks/useSession";

type Tab = "analysis" | "brief" | "chat" | "own";

/**
 * «Моя сторінка» останньою навмисно: ТЗ і чат — одна пара («склади» і
 * «поправ»), і вклинювати між ними окремий сценарій означало б розірвати її.
 */
const TABS: { id: Tab; label: string }[] = [
  { id: "analysis", label: "Аналіз" },
  { id: "brief", label: "SEO ТЗ" },
  { id: "chat", label: "Чат" },
  { id: "own", label: "Моя сторінка" },
];

/**
 * Активна вкладка живе в sessionStorage, а не в localStorage:
 * це стан перегляду, а не дані сесії. Він має зникати разом із вкладкою браузера.
 */
const tabKey = (id: string): string => `brief.tab.${id}`;

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const {
    loadState,
    session,
    analysisState,
    briefState,
    chatState,
    ownPageState,
    comparisonState,
    runAnalysis,
    runBrief,
    sendMessage,
    addOwnPage,
    runOwnAnalysis,
    removeOwnPage,
    runComparison,
  } = useSession(id);

  const [tab, setTab] = useState<Tab>("analysis");

  /**
   * Аналіз стартує сам один раз для щойно створеної сесії.
   * Генерація ТЗ — навмисно за кнопкою: вона витрачає токени,
   * і автозапуск на кожному перезавантаженні сторінки був би сюрпризом.
   */
  const autoStarted = useRef(false);

  /**
   * Власна сторінка запускається окремо й за id, а не за одним прапорцем
   * із конкурентами: її могли вказати при створенні сесії, а могли додати
   * чи замінити пізніше — і тоді конкуренти давно проаналізовані. Ключ по id
   * заодно не дає перезапустити ту саму сторінку двічі.
   */
  const ownStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setTab(readJson<Tab>(window.sessionStorage, tabKey(id), "analysis"));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    writeJson(window.sessionStorage, tabKey(id), tab);
  }, [id, tab]);

  useEffect(() => {
    if (loadState !== "ready" || !session) return;

    const untouched = session.analyses.every(
      (analysis) => analysis.status === "pending",
    );

    if (!autoStarted.current && untouched && session.analyses.length > 0) {
      autoStarted.current = true;
      void runAnalysis();
    }

    // Єдине місце, де стартує парсинг власної сторінки — і для вказаної при
    // створенні сесії, і для доданої через форму у вкладці. Два входи в цей
    // шлях означали б два запити на ту саму адресу.
    const own = session.ownPage;

    if (own?.status === "pending" && ownStartedFor.current !== own.id) {
      ownStartedFor.current = own.id;
      void runOwnAnalysis();
    }
  }, [loadState, session, runAnalysis, runOwnAnalysis]);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (loadState === "missing" || !session) {
    return (
      <EmptyState
        title="Сесію не знайдено"
        description="Можливо, її видалили або посилання відкрито в іншому браузері — сесії зберігаються локально."
      >
        <Link to="/" className="btn-ghost mt-2">
          До списку сесій
        </Link>
      </EmptyState>
    );
  }

  const readyPages = session.analyses.filter(
    (analysis) => analysis.status === "success" && analysis.page,
  ).length;

  /**
   * Найсвіжіший аналіз конкурента. Якщо він новіший за звіт порівняння,
   * звіт складено за даними, яких у сесії вже немає.
   *
   * Порівнюються саме числа, а не рядки: `analyzedAt` приходить з Postgres
   * як `…+00:00`, а `comparedAt` лежить у jsonb таким, яким його записав
   * `toISOString()` — `…Z`. Лексикографічно `+` менший за `.`, тому рядкове
   * порівняння визнавало б свіжий аналіз старішим за звіт.
   */
  const lastAnalyzedAt = session.analyses.reduce((latest, analysis) => {
    const at = analysis.analyzedAt ? Date.parse(analysis.analyzedAt) : NaN;
    return Number.isNaN(at) ? latest : Math.max(latest, at);
  }, 0);

  const staleComparison =
    session.comparison !== null &&
    lastAnalyzedAt > Date.parse(session.comparison.comparedAt);

  /** Бейджі вкладок одним місцем: чотири вкладені тернарники не читаються. */
  const badges: Record<Tab, string | null> = {
    analysis: readyPages > 0 ? String(readyPages) : null,
    brief: session.brief ? "•" : null,
    chat: session.messages.length > 0 ? String(session.messages.length) : null,
    // Бал, якщо порівняння вже є; крапка, якщо сторінка задана, але ще ні —
    // адресу могли вказати при створенні сесії, і без позначки вкладка не
    // відрізнялася б від сесії, де власної сторінки немає взагалі.
    own: session.comparison
      ? String(session.comparison.score.total)
      : session.ownPage
        ? "•"
        : null,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/"
          className="-mx-1 inline-block rounded-inset px-1 py-0.5 text-xs text-subtle
            transition-colors duration-150 ease-out hover:text-fg"
        >
          ← Усі сесії
        </Link>

        <h1 className="mt-2 text-xl font-semibold">{session.name}</h1>

        {session.topic && session.topic !== session.name && (
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {session.topic}
          </p>
        )}

        <p className="num mt-1.5 text-2xs text-subtle">
          створено {formatDateTime(session.createdAt)} · оновлено{" "}
          {formatDateTime(session.updatedAt)}
        </p>
      </div>

      {session.legacyBriefRemoved && (
        <Callout tone="warn" size="xs">
          ТЗ у цій сесії було створене в попередньому форматі — у ньому немає
          полів, які показує поточна версія. Його прибрано. Натисніть
          «Згенерувати SEO ТЗ»: результати парсингу збереглися, сторінки
          повторно не завантажуються.
        </Callout>
      )}

      {/* overflow-x-auto: три вкладки з бейджами не влазять у 320px,
          і горизонтальна прокрутка тут краща за перенос рядка. */}
      <div className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1">
          {TABS.map((item) => {
            const active = tab === item.id;
            const badge = badges[item.id];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? "true" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm
                  transition-colors duration-150 ease-out sm:px-4 ${
                    active
                      ? "border-accent font-medium text-fg"
                      : "border-transparent text-subtle hover:border-line-strong hover:text-fg"
                  }`}
              >
                {item.label}
                {badge && (
                  <span
                    className={`num ml-1.5 text-2xs ${
                      active ? "text-accent" : "text-subtle"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "analysis" && (
        <AnalysisPanel
          analyses={session.analyses}
          running={analysisState.status === "running"}
          onRerun={() => void runAnalysis()}
        />
      )}

      {tab === "brief" && (
        <BriefPanel
          brief={session.brief}
          state={briefState}
          readyPages={readyPages}
          onGenerate={() => void runBrief()}
        />
      )}

      {tab === "chat" && (
        <ChatPanel
          messages={session.messages}
          state={chatState}
          hasBrief={session.brief !== null}
          onSend={(text) => void sendMessage(text)}
        />
      )}

      {tab === "own" && (
        <ComparePanel
          ownPage={session.ownPage}
          comparison={session.comparison}
          ownPageState={ownPageState}
          comparisonState={comparisonState}
          readyCompetitors={readyPages}
          stale={staleComparison}
          onAdd={(url) => void addOwnPage(url)}
          onRerunAnalysis={() => void runOwnAnalysis()}
          onRemove={() => void removeOwnPage()}
          onCompare={() => void runComparison()}
        />
      )}
    </div>
  );
}
