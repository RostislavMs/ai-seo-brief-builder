import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { isUsable, readyCount } from "@brief/shared";
import { AnalysisPanel } from "../components/analysis/AnalysisPanel";
import { BriefPanel } from "../components/brief/BriefPanel";
import { ChatPanel } from "../components/chat/ChatPanel";
import { ComparePanel } from "../components/compare/ComparePanel";
import { SharePanel } from "../components/share/SharePanel";
import { Callout } from "../components/ui/Callout";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { TabBar } from "../components/ui/TabBar";
import { formatDateTime } from "../lib/format";
import { readJson, writeJson } from "../lib/storage";
import { useRequirements } from "../hooks/useRequirements";
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
    shareState,
    briefSave,
    runAnalysis,
    runBrief,
    cancelBrief,
    sendMessage,
    editBrief,
    revertBrief,
    setContentLanguage,
    toggleExcluded,
    addOwnPage,
    runOwnAnalysis,
    removeOwnPage,
    runComparison,
    cancelComparison,
    publish,
    unpublish,
  } = useSession(id);

  // Не в useSession: вимоги не належать сесії й однакові для всіх — читаються
  // один раз, а не разом із кожною сесією, яку відкривають.
  const requirements = useRequirements();

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

  /**
   * Сторінки, з яких реально складеться ТЗ, — без виключених вручну.
   *
   * Саме це число вирішує, чи доступна кнопка генерації, тому й рахуються тут
   * ті самі сторінки, які піде в промпт. Загальна кількість розібраних потрібна
   * окремо: бейдж вкладки «Аналіз» показує, скільком URL узагалі вдалося
   * дістати контент, і виключення сторінки цього не скасовує.
   */
  const usableCount = session.analyses.filter(isUsable).length;
  const parsedCount = readyCount(session.analyses);

  /**
   * Адреси, з яких складено ТЗ, — той самий відбір, що йде в промпт.
   * Береться `finalUrl`, а не введений URL: після редиректу райтер має
   * відкрити ту сторінку, яку читала модель.
   */
  const briefSources = session.analyses
    .filter(isUsable)
    .map((analysis) => analysis.page!.meta.finalUrl || analysis.url);

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

  /**
   * Опубліковане відстало від робочого.
   *
   * Порівнюється `updatedAt` сесії з тим, який був на момент зліпка, — тобто
   * будь-яка зміна в сесії робить публічну версію застарілою. Точніше тут не
   * треба: усе, що змінює `updatedAt`, змінює й те, що пішло б у зліпок, а
   * дрібніший облік («ТЗ те саме, змінилася лише мова») давав би повідомлення,
   * яке іноді бреше.
   */
  const staleShare =
    session.share !== null &&
    Date.parse(session.updatedAt) > Date.parse(session.share.capturedAt);

  /** Бейджі вкладок одним місцем: чотири вкладені тернарники не читаються. */
  const badges: Record<Tab, string | null> = {
    analysis: parsedCount > 0 ? String(parsedCount) : null,
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

        {/* У шапці, а не всередині вкладки: публікується сесія цілком, і
            шукати цю дію в «SEO ТЗ» довелося б тому, хто вирішив поділитися
            ще й аналізом. */}
        <div className="mt-3">
          <SharePanel
            share={session.share}
            state={shareState}
            stale={staleShare}
            hasBrief={session.brief !== null}
            readyPages={usableCount}
            hasOwnPage={
              session.ownPage?.status === "success" ||
              session.comparison !== null
            }
            onPublish={(sections) => void publish(sections)}
            onUnpublish={() => void unpublish()}
          />
        </div>
      </div>

      {session.legacyBriefRemoved && (
        <Callout tone="warn" size="xs">
          ТЗ у цій сесії було створене в попередньому форматі — у ньому немає
          полів, які показує поточна версія. Його прибрано. Натисніть
          «Згенерувати SEO ТЗ»: результати парсингу збереглися, сторінки
          повторно не завантажуються.
        </Callout>
      )}

      <TabBar
        items={TABS.map((item) => ({ ...item, badge: badges[item.id] }))}
        active={tab}
        onSelect={setTab}
      />

      {tab === "analysis" && (
        <AnalysisPanel
          analyses={session.analyses}
          running={analysisState.status === "running"}
          onRerun={() => void runAnalysis()}
          contentLanguage={session.contentLanguage}
          onLanguageChange={(code) => void setContentLanguage(code)}
          onToggleExcluded={(analysisId) => void toggleExcluded(analysisId)}
        />
      )}

      {tab === "brief" && (
        <BriefPanel
          brief={session.brief}
          original={session.originalBrief}
          state={briefState}
          save={briefSave}
          sources={briefSources}
          requirements={requirements}
          readyPages={usableCount}
          excludedPages={parsedCount - usableCount}
          onGenerate={() => void runBrief()}
          onCancel={cancelBrief}
          onEdit={editBrief}
          onRevert={revertBrief}
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
          readyCompetitors={usableCount}
          excludedCompetitors={parsedCount - usableCount}
          stale={staleComparison}
          onAdd={(url) => void addOwnPage(url)}
          onRerunAnalysis={() => void runOwnAnalysis()}
          onRemove={() => void removeOwnPage()}
          onCompare={() => void runComparison()}
          onCancelCompare={cancelComparison}
        />
      )}
    </div>
  );
}
