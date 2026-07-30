import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MeResponse } from "@brief/shared";
import { ApiRequestError } from "../lib/api";
import { fetchMe } from "../services/account";
import { useAuth } from "./AuthContext";

/**
 * Дані акаунта з нашого API: профіль, ключі провайдерів, налаштування
 * і те, який провайдер зараз реально обслуговує запити.
 *
 * Окремо від AuthContext, бо джерела різні: там Supabase, тут наш бекенд.
 * Об'єднувати їх означало б, що збій бази ламає ще й вхід.
 */

interface AccountContextValue {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setMe(await fetchMe(signal));
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === "aborted") return;
      setError(
        caught instanceof Error ? caught.message : "Не вдалося завантажити акаунт.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      // Вихід має гасити дані одразу: інакше після зміни акаунта
      // на екрані на мить лишається чужа пошта.
      setMe(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [status, load]);

  const refresh = useCallback(() => load(), [load]);

  const value = useMemo<AccountContextValue>(
    () => ({ me, loading, error, refresh }),
    [me, loading, error, refresh],
  );

  return <AccountContext value={value}>{children}</AccountContext>;
}

export function useAccount(): AccountContextValue {
  const value = use(AccountContext);

  if (!value) {
    throw new Error("useAccount використано поза AccountProvider");
  }

  return value;
}
