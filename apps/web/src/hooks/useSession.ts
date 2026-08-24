import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  PageAnalysis,
  SeoBrief,
  Session,
  SharedSections,
} from "@brief/shared";
import { usablePages } from "@brief/shared";
import { ApiRequestError } from "../lib/api";
import {
  analyzeUrl,
  requestBrief,
  requestComparison,
  sendChatMessage,
} from "../services/analysis";
import { publishShare, unpublishShare } from "../services/shares";
import {
  addMessage,
  clearOwnPage,
  loadSession,
  removeMessage,
  saveAnalysis,
  saveBrief,
  setAnalysisExcluded,
  setOwnPage,
  updateSession,
} from "../services/sessions";

export type LoadState = "loading" | "ready" | "missing";

export type TaskState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string };

/**
 * Стан збереження ручної правки ТЗ.
 *
 * Окремий від TaskState: у правки немає «виконується» як події, яку користувач
 * почав і на яку чекає. Вона зберігається сама, і показувати про неї треба
 * інше — що записано, і лише зрідка, що записати не вдалося.
 */
export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * Скільки чекати після останньої зміни, перш ніж писати ТЗ у базу.
 *
 * Поле віддає готовий текст саме через паузу в наборі (InlineEditable), тому
 * тут пауза коротка: вона склеює правки в сусідніх полях — обсяг розділу
 * одразу після заголовка, — а не сам набір.
 */
const BRIEF_SAVE_DELAY_MS = 400;

interface UseSessionResult {
  loadState: LoadState;
  session: Session | null;
  analysisState: TaskState;
  briefState: TaskState;
  chatState: TaskState;
  /** Парсинг власної сторінки. Окремо від analysisState: дії різні. */
  ownPageState: TaskState;
  comparisonState: TaskState;
  /** Публікація та її зняття — одна дія за раз, тому один стан на обидві. */
  shareState: TaskState;
  /** Збереження ручної правки ТЗ. */
  briefSave: SaveState;
  /** Аналізує всі URL сесії заново. */
  runAnalysis: () => Promise<void>;
  /** Генерує SEO ТЗ з успішно проаналізованих сторінок. */
  runBrief: () => Promise<void>;
  /**
   * Обриває генерацію ТЗ, що вже пішла.
   *
   * Обриває саме очікування: сервер уже почав запит до моделі й доведе його
   * до кінця, тому витрачені токени спишуться. Кнопка звільняє користувача,
   * а не рахунок.
   */
  cancelBrief: () => void;
  /** Надсилає репліку в чат; за потреби оновлює ТЗ. */
  sendMessage: (text: string) => Promise<void>;
  /**
   * Ручна правка ТЗ — функцією від поточного ТЗ, а не готовим значенням.
   *
   * Поля ТЗ зберігаються самі, і дві правки можуть статися до наступної
   * перемальовки: готове значення в такому разі рахувалося б від застарілого
   * ТЗ і перетирало б сусідню правку.
   *
   * Синхронна навмисно: у базу правка йде з паузою й окремо, а користувач
   * має побачити свій текст одразу.
   */
  editBrief: (compute: (brief: SeoBrief) => SeoBrief) => void;
  /** Повертає все ТЗ до машинної версії; ручні правки зникають. */
  revertBrief: () => void;
  rename: (name: string) => Promise<void>;
  /** Задає мову контенту вручну; null — повернутися до автовизначення. */
  setContentLanguage: (code: string | null) => Promise<void>;
  /**
   * Виключає сторінку конкурента з основи для ТЗ або повертає її в роботу.
   * Розібраний контент лишається — повернення не вимагає нового парсингу.
   */
  toggleExcluded: (analysisId: string) => Promise<void>;
  /** Задає власну сторінку й одразу її парсить. */
  addOwnPage: (url: string) => Promise<void>;
  /** Парсить власну сторінку заново. */
  runOwnAnalysis: () => Promise<void>;
  /** Прибирає власну сторінку разом зі звітом. */
  removeOwnPage: () => Promise<void>;
  /** Порівнює власну сторінку з конкурентами. */
  runComparison: () => Promise<void>;
  /** Обриває порівняння — з тим самим застереженням, що й cancelBrief. */
  cancelComparison: () => void;
  /**
   * Публікує сесію або оновлює вже опубліковану до поточного стану.
   * Посилання при оновленні не змінюється.
   */
  publish: (sections: SharedSections) => Promise<void>;
  /** Прибирає сесію з публічного доступу — посилання перестає працювати. */
  unpublish: () => Promise<void>;
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
  const [shareState, setShareState] = useState<TaskState>({ status: "idle" });
  const [briefSave, setBriefSave] = useState<SaveState>({ status: "idle" });

  /**
   * Актуальна сесія поза циклом рендеру. Запити на URL завершуються
   * паралельно, і кожен має читати найсвіжіший стан, а не той,
   * що був на момент створення колбеку.
   */
  const current = useRef<Session | null>(null);

  /**
   * Контролери довгих запитів до моделі — щоб кнопка «Скасувати» мала що
   * обірвати. У ref, а не в стані: значення потрібне обробнику кліку, і
   * зберігання його в стані лише перемальовувало б панель без причини.
   */
  const briefRequest = useRef<AbortController | null>(null);
  const comparisonRequest = useRef<AbortController | null>(null);

  /** Відкладений запис ручної правки ТЗ. */
  const briefSaveTimer = useRef<number | null>(null);
  /**
   * Машинна версія, якої ще немає в базі.
   *
   * Заповнюється рівно один раз — на першій правці сесії, ТЗ якої зберегла
   * версія до появи оригіналу. Далі його вже є з чим порівнювати.
   */
  const pendingOriginal = useRef<SeoBrief | null>(null);

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
   *
   * `updatedAt` за замовчуванням стає поточним часом, але його можна перебити:
   * публікація повертає дату, з якою зліпок звірятиметься далі, і локальний
   * час клієнта поверх неї одразу зробив би щойно опубліковане «застарілим».
   */
  const patch = useCallback(
    (compute: (session: Session) => Partial<Session>): void => {
      const existing = current.current;
      if (!existing) return;

      const next: Session = {
        ...existing,
        updatedAt: new Date().toISOString(),
        ...compute(existing),
      };

      current.current = next;
      setSession(next);
    },
    [],
  );

  /** Скасовує відкладений запис. Викликається перед тим, як ТЗ запише модель. */
  const dropPendingSave = useCallback((): void => {
    if (briefSaveTimer.current === null) return;

    window.clearTimeout(briefSaveTimer.current);
    briefSaveTimer.current = null;
  }, []);

  /**
   * Записує поточне ТЗ у базу.
   *
   * Пише те, що лежить у стані на момент запису, а не те, що було на момент
   * правки: правок між ними могло бути кілька, і остання з них — правда.
   * Через це відкладений запис ніколи не «відстає»: він завжди наздоганяє
   * актуальний стан, навіть якщо спрацював із затримкою.
   */
  const flushBrief = useCallback(async (): Promise<void> => {
    dropPendingSave();

    const existing = current.current;
    if (!existing?.brief) return;

    const original = pendingOriginal.current ?? undefined;
    setBriefSave({ status: "saving" });

    try {
      const savedAt = await saveBrief(existing.id, existing.brief, original);

      // Оригінал засівається один раз: далі сервер його не перезаписує.
      if (pendingOriginal.current === original) pendingOriginal.current = null;

      // Дата з сервера, а не локальна: за нею порівнюється, чи відстала
      // опублікована версія, і місцевий годинник тут ні до чого.
      patch(() => ({ updatedAt: savedAt }));
      setBriefSave({ status: "saved" });
    } catch (error) {
      // Стан не відкочуємо: набраний текст у користувача перед очима, і
      // прибрати його через невдалий запис було б гірше за саму невдачу.
      // Наступна правка спробує записати ще раз.
      setBriefSave({ status: "error", message: errorMessage(error) });
    }
  }, [dropPendingSave, patch]);

  const editBrief = useCallback(
    (compute: (brief: SeoBrief) => SeoBrief): void => {
      patch((s) => {
        if (!s.brief) return {};

        const next = compute(s.brief);
        if (s.originalBrief) return { brief: next };

        // Перша правка сесії, ТЗ якої зберегла версія без машинної копії:
        // нею стає те, що було до цієї правки. Інакше така сесія назавжди
        // лишилася б без позначок і без повернення.
        pendingOriginal.current = s.brief;
        return { brief: next, originalBrief: s.brief };
      });

      dropPendingSave();
      briefSaveTimer.current = window.setTimeout(
        () => void flushBrief(),
        BRIEF_SAVE_DELAY_MS,
      );
    },
    [dropPendingSave, flushBrief, patch],
  );

  const revertBrief = useCallback((): void => {
    patch((s) => (s.originalBrief ? { brief: s.originalBrief } : {}));
    // Без затримки: це не набір, а одна завершена дія.
    void flushBrief();
  }, [flushBrief, patch]);

  /**
   * Незаписана правка не має пропасти разом зі сторінкою.
   *
   * Два випадки, і обидва настають раніше, ніж спрацював би таймер: перехід
   * на іншу сесію (розмонтування) і згортання вкладки. Другий — саме
   * visibilitychange, а не beforeunload: на мобільних браузерах beforeunload
   * при перемиканні застосунку не настає взагалі.
   */
  useEffect(() => {
    function saveHidden(): void {
      if (document.visibilityState === "hidden" && briefSaveTimer.current !== null) {
        void flushBrief();
      }
    }

    document.addEventListener("visibilitychange", saveHidden);

    return () => {
      document.removeEventListener("visibilitychange", saveHidden);

      if (briefSaveTimer.current === null) return;

      // Тут уже без стану: компонента більше немає, і показувати результат
      // нема кому — важливо тільки, щоб запис пішов.
      dropPendingSave();
      const existing = current.current;

      if (existing?.brief) {
        void saveBrief(
          existing.id,
          existing.brief,
          pendingOriginal.current ?? undefined,
        ).catch(() => undefined);
      }
    };
  }, [dropPendingSave, flushBrief]);

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

    const pages = usablePages(existing.analyses);

    if (pages.length === 0) {
      setBriefState({
        status: "error",
        // Про виключені сказано окремо: інакше «немає жодної» суперечило б
        // списку сторінок, який видно поруч, і виглядало б як помилка.
        message: existing.analyses.some((analysis) => analysis.excluded)
          ? "Усі проаналізовані сторінки виключено з основи для ТЗ. Поверніть хоча б одну."
          : "Немає жодної успішно проаналізованої сторінки.",
      });
      return;
    }

    setBriefState({ status: "running" });

    const controller = new AbortController();
    briefRequest.current = controller;

    try {
      const brief = await requestBrief(
        existing.topic || existing.name,
        pages,
        existing.contentLanguage,
        controller.signal,
      );

      // Ручні правки попереднього ТЗ разом із ним і зникають, тому
      // відкладений запис уже нічого корисного не несе.
      dropPendingSave();
      pendingOriginal.current = null;

      // Нове ТЗ знімає попередження про відкинуте старе.
      await updateSession(existing.id, {
        brief,
        // Машинною версією стає воно саме: ручних правок у щойно
        // згенерованому немає, і рахуються вони від цієї миті.
        originalBrief: brief,
        legacyBriefRemoved: false,
      });
      patch(() => ({ brief, originalBrief: brief, legacyBriefRemoved: false }));

      setBriefSave({ status: "idle" });
      setBriefState({ status: "idle" });
    } catch (error) {
      // Скасування — рішення користувача, а не збій: повертаємося в спокійний
      // стан, без червоного повідомлення про те, що він і зробив сам.
      if (error instanceof ApiRequestError && error.code === "aborted") {
        setBriefState({ status: "idle" });
        return;
      }

      setBriefState({ status: "error", message: errorMessage(error) });
    } finally {
      briefRequest.current = null;
    }
  }, [dropPendingSave, patch]);

  const cancelBrief = useCallback((): void => {
    briefRequest.current?.abort();
  }, []);

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

    const competitors = usablePages(existing.analyses);

    if (competitors.length === 0) {
      setComparisonState({
        status: "error",
        message: existing.analyses.some((analysis) => analysis.excluded)
          ? "Усі сторінки конкурентів виключено. Поверніть хоча б одну у вкладці «Аналіз»."
          : "Немає жодної успішно проаналізованої сторінки конкурента.",
      });
      return;
    }

    setComparisonState({ status: "running" });

    const controller = new AbortController();
    comparisonRequest.current = controller;

    try {
      const comparison = await requestComparison(
        existing.topic || existing.name,
        own,
        competitors,
        existing.contentLanguage,
        controller.signal,
      );

      await updateSession(existing.id, { comparison });
      patch(() => ({ comparison }));

      setComparisonState({ status: "idle" });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "aborted") {
        setComparisonState({ status: "idle" });
        return;
      }

      setComparisonState({ status: "error", message: errorMessage(error) });
    } finally {
      comparisonRequest.current = null;
    }
  }, [patch]);

  const cancelComparison = useCallback((): void => {
    comparisonRequest.current?.abort();
  }, []);

  /**
   * Публікація сесії.
   *
   * Разом із посиланням локально виставляється `updatedAt` із відповіді:
   * сервер зробив зліпок із сесії, яку бачить база, і саме її дата означає
   * «опубліковане відповідає робочому». Поточний час клієнта на цьому місці
   * робив би щойно опубліковану версію застарілою в ту саму мить.
   */
  const publish = useCallback(
    async (sections: SharedSections): Promise<void> => {
      const existing = current.current;
      if (!existing) return;

      setShareState({ status: "running" });

      try {
        const share = await publishShare(existing.id, sections);
        patch(() => ({ share, updatedAt: share.capturedAt }));
        setShareState({ status: "idle" });
      } catch (error) {
        setShareState({ status: "error", message: errorMessage(error) });
      }
    },
    [patch],
  );

  const unpublish = useCallback(async (): Promise<void> => {
    const existing = current.current;
    if (!existing?.share) return;

    const previous = existing.share;

    // Прибирається одразу, без очікування: посилання перестало діяти —
    // це подія, а не процес. Помилка повертає стан назад.
    patch(() => ({ share: null }));
    setShareState({ status: "idle" });

    await unpublishShare(existing.id).catch((error: unknown) => {
      patch(() => ({ share: previous }));
      setShareState({ status: "error", message: errorMessage(error) });
    });
  }, [patch]);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const existing = current.current;
      const trimmed = text.trim();

      if (!existing || !existing.brief || !trimmed) return;

      // Історія для моделі — те, що було ДО цієї репліки.
      const history = existing.messages;
      const pages = usablePages(existing.analyses);

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
          // Модель отримала вже відредаговану версію й повернула її разом зі
          // своїми змінами, тому її відповідь — теж машинна версія. Позначки
          // ручних правок обнуляються: рахувати їх від старого оригіналу
          // означало б позначити чужу роботу як свою.
          dropPendingSave();
          pendingOriginal.current = null;

          await updateSession(existing.id, {
            brief: result.brief,
            originalBrief: result.brief,
          });
          setBriefSave({ status: "idle" });
        }

        patch((s) => ({
          messages: [...s.messages, assistantMessage],
          ...(result.brief
            ? { brief: result.brief, originalBrief: result.brief }
            : {}),
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
    [dropPendingSave, patch],
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

  /**
   * Мова застосовується одразу, а запис у базу йде після — як і в `rename`.
   * Чекати на відповідь перед промальовкою означало б завмерлий список вибору
   * на кожен вибір мови.
   */
  const setContentLanguage = useCallback(
    async (code: string | null): Promise<void> => {
      const existing = current.current;
      if (!existing || code === existing.contentLanguage) return;

      const previous = existing.contentLanguage;
      patch(() => ({ contentLanguage: code }));

      await updateSession(existing.id, { contentLanguage: code }).catch(() => {
        // Відкат: показана мова, якої немає в базі, гірша за стару — після
        // перезавантаження ТЗ склалося б не тією мовою, що видно в інтерфейсі.
        patch(() => ({ contentLanguage: previous }));
      });
    },
    [patch],
  );

  /**
   * Прапорець застосовується одразу, а запис у базу йде після — як у `rename`
   * і `setContentLanguage`. Чекати на відповідь означало б чекбокс, який
   * ставиться з затримкою: у списку з десяти сторінок їх знімають підряд,
   * і кожна пауза множиться на десять.
   */
  const toggleExcluded = useCallback(
    async (analysisId: string): Promise<void> => {
      const existing = current.current;
      const target = existing?.analyses.find((item) => item.id === analysisId);

      if (!existing || !target) return;

      const next = !target.excluded;

      patch((s) => ({
        analyses: s.analyses.map((analysis) =>
          analysis.id === analysisId
            ? { ...analysis, excluded: next }
            : analysis,
        ),
      }));

      await setAnalysisExcluded(existing.id, analysisId, next).catch(() => {
        // Відкат: знятий чекбокс при сторінці, що лишилася в основі ТЗ,
        // гірший за повернений — інакше ТЗ склалося б із неї попри те,
        // що видно в інтерфейсі.
        patch((s) => ({
          analyses: s.analyses.map((analysis) =>
            analysis.id === analysisId
              ? { ...analysis, excluded: target.excluded ?? false }
              : analysis,
          ),
        }));
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
    shareState,
    briefSave,
    runAnalysis,
    runBrief,
    cancelBrief,
    sendMessage,
    editBrief,
    revertBrief,
    rename,
    setContentLanguage,
    toggleExcluded,
    addOwnPage,
    runOwnAnalysis,
    removeOwnPage,
    runComparison,
    cancelComparison,
    publish,
    unpublish,
  };
}
