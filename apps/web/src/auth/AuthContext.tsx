import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isAuthConfigured, requireSupabase, supabase } from "../lib/supabase";

/**
 * Стан авторизації Supabase.
 *
 * Контекст навмисно тонкий: він знає лише про сесію та дії з нею.
 * Профіль, ключі й налаштування живуть окремо (AccountContext) —
 * вони приходять із нашого API, а не з Supabase.
 */

export type AuthStatus = "loading" | "authenticated" | "anonymous";

/** Результат дії з формою: успіх або текст помилки для показу. */
export type AuthResult = { ok: true; message?: string } | { ok: false; error: string };

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** false — у .env немає ключів Supabase; форми входу показувати нема сенсу. */
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Перекладає технічні відповіді Supabase у зрозумілі фрази. */
function toMessage(raw: string): string {
  const known: [RegExp, string][] = [
    [/invalid login credentials/i, "Невірна пошта або пароль."],
    [/email not confirmed/i, "Пошту ще не підтверджено. Перевірте вхідні."],
    [/user already registered/i, "Акаунт із такою поштою вже існує."],
    [
      /password should be at least/i,
      "Пароль закороткий — потрібно щонайменше 6 символів.",
    ],
    [
      /for security purposes|rate limit|too many/i,
      "Забагато спроб поспіль. Спробуйте за хвилину.",
    ],
    [/unable to validate email|invalid email/i, "Некоректна адреса пошти."],
    [
      /signups not allowed|signup is disabled/i,
      "Реєстрацію вимкнено в налаштуваннях проєкту Supabase.",
    ],
  ];

  return known.find(([pattern]) => pattern.test(raw))?.[1] ?? raw;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isAuthConfigured ? "loading" : "anonymous",
  );
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;
    let active = true;

    // getSession читає збережену сесію й за потреби оновлює токен —
    // без цього перезавантаження сторінки викидало б користувача.
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? "authenticated" : "anonymous");
    });

    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
        setStatus(next ? "authenticated" : "anonymous");
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { error } = await requireSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      return error ? { ok: false, error: toMessage(error.message) } : { ok: true };
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
    ): Promise<AuthResult> => {
      const { data, error } = await requireSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Ім'я підхоплює тригер handle_new_user і кладе у profiles.
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) return { ok: false, error: toMessage(error.message) };

      // Порожня session означає, що проєкт вимагає підтвердження пошти:
      // акаунт створено, але входу ще немає.
      if (!data.session) {
        return {
          ok: true,
          message:
            "Акаунт створено. Перевірте пошту й підтвердьте адресу — " +
            "після цього зможете увійти.",
        };
      }

      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await requireSupabase().auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );

      if (error) return { ok: false, error: toMessage(error.message) };

      return {
        ok: true,
        message: "Якщо така адреса зареєстрована, лист із посиланням уже надіслано.",
      };
    },
    [],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const { error } = await requireSupabase().auth.updateUser({ password });

      return error
        ? { ok: false, error: toMessage(error.message) }
        : { ok: true, message: "Пароль змінено." };
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      configured: isAuthConfigured,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [
      status,
      session,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);

  if (!value) {
    throw new Error("useAuth використано поза AuthProvider");
  }

  return value;
}
