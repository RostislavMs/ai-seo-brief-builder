import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LanguageRule,
  LanguageRuleCount,
  UpdateLanguageRuleRequest,
} from "@brief/shared";
import { ALL_LANGUAGES } from "@brief/shared";
import { ApiRequestError } from "../lib/api";
import {
  createLanguageRule,
  deleteLanguageRule,
  fetchLanguageRules,
  fetchPendingRules,
  fetchRuleCounts,
  updateLanguageRule,
} from "../services/rules";

/**
 * Стан сторінки правил: вибрана мова, її правила, черга розгляду
 * й підрахунки по всіх мовах.
 *
 * Після кожної зміни перечитуються всі три набори, а не той, що змінився.
 * Схвалення пропозиції одночасно прибирає рядок із черги, додає його до
 * списку мови й змінює підрахунок — тримати три часткові оновлення
 * узгодженими дорожче, ніж зробити один запит на кожен набір: правил
 * на проєкт десятки, а не десятки тисяч.
 */

export type RulesLoadState = "loading" | "ready" | "error";

/**
 * Область дії за замовчуванням, коли правил ще немає ніде.
 *
 * «Усі мови», а не англійська: перше правило на проєкті майже завжди
 * загальне, а не привʼязане саме до англійських конкурентів.
 */
const FALLBACK_LANGUAGE = ALL_LANGUAGES;

export interface UseLanguageRulesResult {
  loadState: RulesLoadState;
  error: string | null;
  /** Скільки правил у кожної мови — для списку вибору. */
  counts: LanguageRuleCount[];
  language: string;
  selectLanguage: (code: string) => void;
  /** Правила вибраної мови. */
  rules: LanguageRule[];
  /** true, поки читаються правила щойно вибраної мови. */
  listLoading: boolean;
  /** Пропозиції на розгляд: адміну — усі мови, решті — власні. */
  pending: LanguageRule[];
  /** id правила, над яким зараз виконується дія. */
  busyId: string | null;
  /** Помилка останньої дії — окремо від помилки завантаження. */
  actionError: string | null;
  clearActionError: () => void;
  propose: (rule: string) => Promise<boolean>;
  review: (id: string, patch: UpdateLanguageRuleRequest) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Невідома помилка";
}

function aborted(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "aborted";
}

/**
 * @param onChanged Викликається після кожної зміни — щоб перечитати
 *   /api/me: бейдж із кількістю пропозицій живе в бічній панелі.
 */
export function useLanguageRules(
  onChanged: () => void | Promise<void>,
): UseLanguageRulesResult {
  const [loadState, setLoadState] = useState<RulesLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<LanguageRuleCount[]>([]);
  const [pending, setPending] = useState<LanguageRule[]>([]);
  const [rules, setRules] = useState<LanguageRule[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * null — мову ще не вибрано: перший вибір робиться за підрахунками,
   * коли вони приїдуть. Показувати «English» на проєкті, де правила є
   * лише для італійської, означало б відкривати сторінку на порожньому
   * екрані.
   */
  const [language, setLanguage] = useState<string | null>(null);

  /**
   * Актуальна мова поза циклом рендеру: після дії треба перечитати правила
   * саме тієї мови, що відкрита зараз, а колбеки створюються один раз.
   */
  const currentLanguage = useRef<string | null>(null);

  /** Єдина точка зміни мови — щоб стан і ref не могли розійтися. */
  const applyLanguage = useCallback((code: string): void => {
    currentLanguage.current = code;
    setLanguage(code);
  }, []);

  const loadShared = useCallback(
    async (signal?: AbortSignal): Promise<LanguageRuleCount[]> => {
      const [nextCounts, nextPending] = await Promise.all([
        fetchRuleCounts(signal),
        fetchPendingRules(signal),
      ]);

      setCounts(nextCounts);
      setPending(nextPending);

      return nextCounts;
    },
    [],
  );

  // Перше завантаження: підрахунки й черга розгляду. Мова вибирається
  // з підрахунків — там, де правил найбільше.
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoadState("loading");
      setError(null);

      try {
        const nextCounts = await loadShared(controller.signal);

        const busiest = [...nextCounts].sort(
          (a, b) => b.active + b.pending - (a.active + a.pending),
        )[0];

        applyLanguage(busiest?.languageCode ?? FALLBACK_LANGUAGE);
        setLoadState("ready");
      } catch (caught) {
        if (aborted(caught)) return;
        setError(errorText(caught));
        setLoadState("error");
      }
    })();

    return () => controller.abort();
  }, [loadShared, applyLanguage]);

  // Правила вибраної мови — окремим запитом: мова змінюється частіше,
  // ніж усе інше, і тягнути через це чергу розгляду немає сенсу.
  useEffect(() => {
    if (!language) return;

    const controller = new AbortController();
    setListLoading(true);

    void (async () => {
      try {
        setRules(await fetchLanguageRules(language, controller.signal));
      } catch (caught) {
        if (aborted(caught)) return;
        setRules([]);
        setError(errorText(caught));
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
      }
    })();

    return () => controller.abort();
  }, [language]);

  /** Перечитує все після зміни. Помилку тут не показуємо: сама дія вдалася. */
  const refresh = useCallback(async (): Promise<void> => {
    const code = currentLanguage.current;

    await Promise.all([
      loadShared(),
      code ? fetchLanguageRules(code).then(setRules) : Promise.resolve(),
      onChanged(),
    ]).catch((caught: unknown) => {
      console.warn("[rules] не вдалося перечитати правила:", caught);
    });
  }, [loadShared, onChanged]);

  const propose = useCallback(
    async (rule: string): Promise<boolean> => {
      const code = currentLanguage.current;
      const trimmed = rule.trim();

      if (!code || !trimmed) return false;

      setBusyId("new");
      setActionError(null);

      try {
        await createLanguageRule(code, trimmed);
        await refresh();
        return true;
      } catch (caught) {
        setActionError(errorText(caught));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const review = useCallback(
    async (id: string, patch: UpdateLanguageRuleRequest): Promise<void> => {
      setBusyId(id);
      setActionError(null);

      try {
        await updateLanguageRule(id, patch);
        await refresh();
      } catch (caught) {
        setActionError(errorText(caught));
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setBusyId(id);
      setActionError(null);

      try {
        await deleteLanguageRule(id);
        await refresh();
      } catch (caught) {
        setActionError(errorText(caught));
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const selectLanguage = useCallback(
    (code: string) => {
      applyLanguage(code);
      setActionError(null);
    },
    [applyLanguage],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  return useMemo(
    () => ({
      loadState,
      error,
      counts,
      language: language ?? FALLBACK_LANGUAGE,
      selectLanguage,
      rules,
      listLoading,
      pending,
      busyId,
      actionError,
      clearActionError,
      propose,
      review,
      remove,
    }),
    [
      loadState,
      error,
      counts,
      language,
      selectLanguage,
      rules,
      listLoading,
      pending,
      busyId,
      actionError,
      clearActionError,
      propose,
      review,
      remove,
    ],
  );
}
