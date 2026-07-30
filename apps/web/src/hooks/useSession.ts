import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, PageAnalysis, Session } from "@brief/shared";
import { ApiRequestError } from "../lib/api";
import {
  analyzeUrl,
  requestBrief,
  requestComparison,
  sendChatMessage,
} from "../services/analysis";
import {
  addMessage,
  clearOwnPage,
  loadSession,
  removeMessage,
  saveAnalysis,
  setOwnPage,
  updateSession,
} from "../services/sessions";

export type LoadState = "loading" | "ready" | "missing";

export type TaskState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string };

interface UseSessionResult {
  loadState: LoadState;
  session: Session | null;
  analysisState: TaskState;
  briefState: TaskState;
  chatState: TaskState;
  /** Парсинг власної сторінки. Окремо від analysisState: дії різні. */
  ownPageState: TaskState;
  comparisonState: TaskState;
  /** Аналізує всі URL сесії заново. */
  runAnalysis: () => Promise<void>;
  /** Генерує SEO ТЗ з успішно проаналізованих сторінок. */
  runBrief: () => Promise<void>;
  /** Надсилає репліку в чат; за потреби оновлює ТЗ. */
  sendMessage: (text: string) => Promise<void>;
  rename: (name: string) => Promise<void>;
  /** Задає власну сторінку й одразу її парсить. */
  addOwnPage: (url: string) => Promise<void>;
  /** Парсить власну сторінку заново. */
  runOwnAnalysis: () => Promise<void>;
  /** Прибирає власну сторінку разом зі звітом. */
  removeOwnPage: () => Promise<void>;
  /** Порівнює власну сторінку з конкурентами. */
  runComparison: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Невідома помилка";
}

export function useSession(id: string | undefined): UseSessionResult {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [analysisState, setAnalysisState] = useState<TaskState>({ status: "idle" });
  const [briefState, setBriefState] = useState<TaskState>({ status: "idle" });
  const [chatState, setChatState] = useState<TaskState>({ status: "idle" });
  const [ownPageState, setOwnPageState] = useState<TaskState>({ status: "idle" });
  const [comparisonState, setComparisonState] = useState<TaskState>({
    status: "idle",
  });

  /**
   * Актуальна сесія поза циклом рендеру. Запити на URL завершуються
   * паралельно, і кожен має читати найсвіжіший стан, а не той,
   * що був на момент створення колбеку.
   */
  const current = useRef<Session | null>(null);

  useEffect(() => {
    if (!id) {
      setLoadState("missing");
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");

    void (async () => {
      try {
        const loaded = await loadSession(id, controller.signal);
        current.current = loaded;
        setSession(loaded);
        setLoadState("ready");
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "aborted") return;
        current.current = null;
        setSession(null);
        setLoadState("missing");
      }
    })();

    return () => controller.abort();
  }, [id]);

  /**
   * Змінює локальний стан сесії одним синхронним блоком.
   * Через це паралельні оновлення не перетирають одне одного.
   *
   * Запис у базу — окремо й після: він асинхронний, і чекати на нього
   * перед промальовкою означало б показувати завмерлий інтерфейс.
   */
  const patch = useCallback(
    (compute: (session: Session) => Partial<Session>): void => {
      const existing = current.current;
      if (!existing) return;

      const next: Session = {
        ...existing,
        ...compute(existing),
        updatedAt: new Date().toISOString(),
      };

      current.current = next;
      setSession(next);
    },
    [],
  );

  const runAnalysis = useCallback(async (): Promise<void> => {
    const existing = current.current;
    if (!existing || existing.analyses.length === 0) return;

    setAnalysisState({ status: "running" });

    patch((s) => ({
      analyses: s.analyses.map((analysis) => ({
        ...analysis,
        status: "loading",
        error: null,
      })),
    }));

    const sessionId = existing.id;
    const targets = existing.analyses.map((analysis) => ({
      id: analysis.id,
      url: analysis.url,
    }));

    try {
      await Promise.all(
        targets.map(async ({ id: analysisId, url }) => {
          let result: PageAnalysis;

          try {
            result = await analyzeUrl(url);
          } catch (error) {
            result = {
              id: analysisId,
              url,
              status: "error",
              page: null,
              error: errorMessage(error),
              analyzedAt: new Date().toISOString(),
            };
          }

          // «loading» у базу не пишеться: цей стан живе рівно стільки,
          // скільки триває запит, і зберігати його нема сенсу.
          const saved = await saveAnalysis(sessionId, analysisId, {
            status: result.status,
            page: result.page,
            error: result.error,
            analyzedAt: result.analyzedAt,
          }).catch(() => ({ ...result, id: analysisId }));

          patch((s) => ({
            analyses: s.analyses.map((analysis) =>
              analysis.id === analysisId ? saved : analysis,
            ),
          }));
        }),
      );

      setAnalysisState({ status: "idle" });
    } catch (error) {
      setAnalysisState({ status: "error", message: errorMessage(error) });
    }
  }, [patch]);

  const runBrief = useCallback(async (): Promise<void> => {
    const existing = current.current;
    if (!existing) return;

    const pages = existing.analyses
      .filter((analysis) => analysis.status === "success" && analysis.page)
      .map((analysis) => analysis.page!);

    if (pages.length === 0) {
      setBriefState({
        status: "error",
        message: "Немає жодної успішно проаналізованої сторінки.",
      });
      return;
    }

    setBriefState({ status: "running" });

    try {
      const brief = await requestBrief(existing.topic || existing.name, pages);

      // Нове ТЗ знімає попередження про відкинуте старе.
      await updateSession(existing.id, { brief, legacyBriefRemoved: false });
      patch(() => ({ brief, legacyBriefRemoved: false }));

      setBriefState({ status: "idle" });
    } catch (error) {
      setBriefState({ status: "error", message: errorMessage(error) });
    }
  }, [patch]);

  /**
   * Парсинг власної сторінки. Той самий шлях, що й у конкурентів:
   * `/api/analyze` і те саме збереження результату — відрізняється лише
   * те, куди він кладеться в сесії.
   */
  const runOwnAnalysis = useCallback(async (): Promise<void> => {
    const existing = current.current;
    const own = existing?.ownPage;

    if (!existing || !own) return;

    setOwnPageState({ status: "running" });

    patch((s) => ({
      ownPage: s.ownPage
        ? { ...s.ownPage, status: "loading", error: null }
        : null,
    }));

    let result: PageAnalysis;

    try {
      result = await analyzeUrl(own.url);
    } catch (error) {
      result = {
        id: own.id,
        url: own.url,
        status: "error",
        page: null,
        error: errorMessage(error),
        analyzedAt: new Date().toISOString(),
      };
    }

    const saved = await saveAnalysis(existing.id, own.id, {
      status: result.status,
      page: result.page,
      error: result.error,
      analyzedAt: result.analyzedAt,
    }).catch(() => ({ ...result, id: own.id }));

    // Помилку парсингу показує сам рядок сторінки — дублювати її ще й у стані
    // панелі означало б два повідомлення про одну подію.
    patch(() => ({ ownPage: saved }));
    setOwnPageState({ status: "idle" });
  }, [patch]);

  const addOwnPage = useCallback(
    async (url: string): Promise<void> => {
      const existing = current.current;
      const trimmed = url.trim();

      if (!existing || !trimmed) return;

      setOwnPageState({ status: "running" });

      let analysis: PageAnalysis;

      try {
        analysis = await setOwnPage(existing.id, trimmed);
      } catch (error) {
        setOwnPageState({ status: "error", message: errorMessage(error) });
        return;
      }

      // Разом зі сторінкою сервер скинув і звіт: старий належав іншій адресі.
      patch(() => ({ ownPage: analysis, comparison: null }));
      setComparisonState({ status: "idle" });

      // Парсинг звідси не запускається: сторінка приходить зі статусом
      // "pending", і його підхоплює той самий автозапуск, що обслуговує
      // сторінку, вказану при створенні сесії. Інакше в цей шлях було б два
      // входи — і сторінка, додана через форму, парсилася б двічі.
      setOwnPageState({ status: "idle" });
    },
    [patch],
  );

  const removeOwnPage = useCallback(async (): Promise<void> => {
    const existing = current.current;
    if (!existing?.ownPage) return;

    const previousPage = existing.ownPage;
    const previousComparison = existing.comparison;

    patch(() => ({ ownPage: null, comparison: null }));
    setOwnPageState({ status: "idle" });
    setComparisonState({ status: "idle" });

    await clearOwnPage(existing.id).catch((error: unknown) => {
      // Відкат: порожня панель при сторінці, що лишилася в базі, гірша за
      // повернену сторінку — після перезавантаження вона все одно «зʼявиться».
      patch(() => ({ ownPage: previousPage, comparison: previousComparison }));
      setOwnPageState({ status: "error", message: errorMessage(error) });
    });
  }, [patch]);

  const runComparison = useCallback(async (): Promise<void> => {
    const existing = current.current;
    const own = existing?.ownPage?.page ?? null;

    if (!existing || !own) return;

    const competitors = existing.analyses
      .filter((analysis) => analysis.status === "success" && analysis.page)
      .map((analysis) => analysis.page!);

    if (competitors.length === 0) {
      setComparisonState({
        status: "error",
        message: "Немає жодної успішно проаналізованої сторінки конкурента.",
      });
      return;
    }

    setComparisonState({ status: "running" });

    try {
      const comparison = await requestComparison(
        existing.topic || existing.name,
        own,
        competitors,
      );

      await updateSession(existing.id, { comparison });
      patch(() => ({ comparison }));

      setComparisonState({ status: "idle" });
    } catch (error) {
      setComparisonState({ status: "error", message: errorMessage(error) });
    }
  }, [patch]);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const existing = current.current;
      const trimmed = text.trim();

      if (!existing || !existing.brief || !trimmed) return;

      // Історія для моделі — те, що було ДО цієї репліки.
      const history = existing.messages;
      const pages = existing.analyses
        .filter((analysis) => analysis.status === "success" && analysis.page)
        .map((analysis) => analysis.page!);

      setChatState({ status: "running" });

      let userMessage: ChatMessage;

      // Репліка спершу зберігається, і лише потім показується: id із бази
      // потрібен, щоб мати змогу прибрати її, якщо відповіді не буде.
      try {
        userMessage = await addMessage(existing.id, {
          role: "user",
          content: trimmed,
        });
      } catch (error) {
        setChatState({ status: "error", message: errorMessage(error) });
        return;
      }

      patch((s) => ({ messages: [...s.messages, userMessage] }));

      try {
        const result = await sendChatMessage({
          topic: existing.topic || existing.name,
          brief: existing.brief,
          history,
          message: trimmed,
          pages,
        });

        const assistantMessage = await addMessage(existing.id, {
          role: "assistant",
          content: result.reply,
          changedBrief: result.brief !== null,
        });

        if (result.brief) {
          await updateSession(existing.id, { brief: result.brief });
        }

        patch((s) => ({
          messages: [...s.messages, assistantMessage],
          ...(result.brief ? { brief: result.brief } : {}),
        }));
        setChatState({ status: "idle" });
      } catch (error) {
        // Прибираємо репліку, що лишилася без відповіді: інакше в історії
        // зʼявляться два повідомлення user підряд, а це ламає діалог.
        await removeMessage(existing.id, userMessage.id).catch(() => undefined);

        patch((s) => ({
          messages: s.messages.filter((m) => m.id !== userMessage.id),
        }));
        setChatState({ status: "error", message: errorMessage(error) });
      }
    },
    [patch],
  );

  const rename = useCallback(
    async (name: string): Promise<void> => {
      const existing = current.current;
      const trimmed = name.trim();

      if (!existing || !trimmed || trimmed === existing.name) return;

      patch(() => ({ name: trimmed }));

      await updateSession(existing.id, { name: trimmed }).catch(() => {
        // Відкат: показувати назву, якої немає в базі, гірше, ніж
        // повернути стару — інакше після перезавантаження вона «зникне».
        patch(() => ({ name: existing.name }));
      });
    },
    [patch],
  );

  return {
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
    rename,
    addOwnPage,
    runOwnAnalysis,
    removeOwnPage,
    runComparison,
  };
}
