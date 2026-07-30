import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SessionSummary } from "@brief/shared";
import { useAuth } from "../auth/AuthContext";
import { ApiRequestError } from "../lib/api";
import {
  createSession,
  deleteSession,
  listSessions,
  type CreateSessionInput,
} from "../services/sessions";

/**
 * Список сесій для бічної панелі.
 *
 * Він потрібен одночасно панелі й сторінкам, тому живе в контексті:
 * інакше після створення сесії панель показувала б застарілий список,
 * доки користувач не перезавантажить сторінку.
 */

interface SessionsContextValue {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: CreateSessionInput) => Promise<Session>;
  remove: (id: string) => Promise<void>;
  /** Оновлює назву в списку, не перечитуючи його з сервера. */
  renameLocal: (id: string, name: string) => void;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setSessions(await listSessions(signal));
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === "aborted") return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Не вдалося завантажити список сесій.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      setSessions([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [status, load]);

  const refresh = useCallback(() => load(), [load]);

  const create = useCallback(
    async (input: CreateSessionInput): Promise<Session> => {
      const session = await createSession(input);

      // Додаємо в початок замість перечитування списку: сесія щойно
      // створена, тож вона гарантовано найсвіжіша.
      setSessions((previous) => [
        {
          id: session.id,
          name: session.name,
          topic: session.topic,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          urlCount: session.urls.length,
          hasBrief: false,
        },
        ...previous,
      ]);

      return session;
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteSession(id);
    setSessions((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const renameLocal = useCallback((id: string, name: string): void => {
    setSessions((previous) =>
      previous.map((item) => (item.id === id ? { ...item, name } : item)),
    );
  }, []);

  const value = useMemo<SessionsContextValue>(
    () => ({ sessions, loading, error, refresh, create, remove, renameLocal }),
    [sessions, loading, error, refresh, create, remove, renameLocal],
  );

  return <SessionsContext value={value}>{children}</SessionsContext>;
}

export function useSessions(): SessionsContextValue {
  const value = use(SessionsContext);

  if (!value) {
    throw new Error("useSessions використано поза SessionsProvider");
  }

  return value;
}
