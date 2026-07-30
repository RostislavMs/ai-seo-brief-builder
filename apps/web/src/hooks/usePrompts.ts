import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromptTemplate } from "@brief/shared";
import { ApiRequestError } from "../lib/api";
import {
  fetchPrompts,
  resetPrompt as resetPromptRequest,
  savePrompt as savePromptRequest,
} from "../services/prompts";

/**
 * Стан сторінки промптів.
 *
 * Після зміни оновлюється рівно один промпт — той, що змінився: сервер
 * повертає його новий стан у відповіді, і перечитувати через це решту сімох
 * немає сенсу. Тим відрізняється від правил для мов, де одна дія зачіпає
 * і список мови, і чергу розгляду, і підрахунки.
 */

export type PromptsLoadState = "loading" | "ready" | "error";

export interface UsePromptsResult {
  loadState: PromptsLoadState;
  error: string | null;
  prompts: PromptTemplate[];
  /** Ключ промпта, над яким зараз виконується дія. */
  busyKey: string | null;
  /** Помилка останньої дії — окремо від помилки завантаження. */
  actionError: string | null;
  clearActionError: () => void;
  /** Повертає true, якщо текст збережено — тоді картка виходить із правки. */
  save: (key: string, body: string, note: string | null) => Promise<boolean>;
  reset: (key: string) => Promise<void>;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Невідома помилка";
}

function aborted(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "aborted";
}

export function usePrompts(): UsePromptsResult {
  const [loadState, setLoadState] = useState<PromptsLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoadState("loading");
      setError(null);

      try {
        setPrompts(await fetchPrompts(controller.signal));
        setLoadState("ready");
      } catch (caught) {
        if (aborted(caught)) return;
        setError(errorText(caught));
        setLoadState("error");
      }
    })();

    return () => controller.abort();
  }, []);

  /** Підставляє новий стан промпта на місце старого, зберігаючи порядок. */
  const replace = useCallback((updated: PromptTemplate): void => {
    setPrompts((current) =>
      current.map((prompt) => (prompt.key === updated.key ? updated : prompt)),
    );
  }, []);

  const save = useCallback(
    async (key: string, body: string, note: string | null): Promise<boolean> => {
      setBusyKey(key);
      setActionError(null);

      try {
        replace(await savePromptRequest(key, body, note));
        return true;
      } catch (caught) {
        // Текст правки лишається в полі: помилка тут майже завжди про вставки,
        // і змусити набирати промпт заново було б найгіршою реакцією на неї.
        setActionError(errorText(caught));
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [replace],
  );

  const reset = useCallback(
    async (key: string): Promise<void> => {
      setBusyKey(key);
      setActionError(null);

      try {
        replace(await resetPromptRequest(key));
      } catch (caught) {
        setActionError(errorText(caught));
      } finally {
        setBusyKey(null);
      }
    },
    [replace],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  return useMemo(
    () => ({
      loadState,
      error,
      prompts,
      busyKey,
      actionError,
      clearActionError,
      save,
      reset,
    }),
    [loadState, error, prompts, busyKey, actionError, clearActionError, save, reset],
  );
}
