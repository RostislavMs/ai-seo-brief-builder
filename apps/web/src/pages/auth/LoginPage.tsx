import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Callout } from "../../components/ui/Callout";
import { Spinner } from "../../components/ui/Spinner";
import { PasswordField } from "../../components/auth/PasswordField";
import { AuthUnavailable } from "../../components/auth/AuthUnavailable";

export function LoginPage() {
  const { signIn, status, configured } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) return <AuthUnavailable />;

  if (status === "authenticated") {
    // Повертаємо туди, звідки прийшли: інакше після входу за прямим
    // посиланням на сесію користувач опиняється на головній.
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await signIn(email, password);

    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <AuthLayout
      title="Вхід"
      description="Сесії, ТЗ і ключі AI зберігаються в акаунті — доступні з будь-якого браузера."
      footer={
        <p>
          Немає акаунта?{" "}
          <Link to="/register" className="text-accent hover:underline">
            Зареєструватися
          </Link>
        </p>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Пошта</span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
        </label>

        <PasswordField
          label="Пароль"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {error && (
          <Callout tone="danger" live>
            {error}
          </Callout>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner tone="on-accent" />}
          Увійти
        </button>

        <p className="text-center">
          <Link
            to="/forgot-password"
            className="text-xs text-subtle hover:text-fg hover:underline"
          >
            Забули пароль?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
