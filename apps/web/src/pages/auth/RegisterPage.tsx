import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { AuthUnavailable } from "../../components/auth/AuthUnavailable";
import { PasswordField } from "../../components/auth/PasswordField";
import { Callout } from "../../components/ui/Callout";
import { Spinner } from "../../components/ui/Spinner";

const MIN_PASSWORD = 8;

export function RegisterPage() {
  const { signUp, status, configured } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) return <AuthUnavailable />;

  // Якщо проєкт не вимагає підтвердження пошти, signUp одразу дає сесію —
  // і показувати форму реєстрації вже нема сенсу.
  if (status === "authenticated") return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (password.length < MIN_PASSWORD) {
      setError(`Пароль має містити щонайменше ${MIN_PASSWORD} символів.`);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await signUp(email, password, displayName);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (result.message) setNotice(result.message);
  }

  return (
    <AuthLayout
      title="Реєстрація"
      description="Один акаунт на всі сесії, ТЗ і ключі AI-провайдерів."
      footer={
        <p>
          Уже є акаунт?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Увійти
          </Link>
        </p>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">
            Імʼя{" "}
            <span className="font-normal text-subtle">— необовʼязково</span>
          </span>
          <input
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            placeholder="Як до вас звертатися"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted">Пошта</span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <PasswordField
          label="Пароль"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          hint={`Щонайменше ${MIN_PASSWORD} символів.`}
        />

        {error && (
          <Callout tone="danger" live>
            {error}
          </Callout>
        )}

        {notice && (
          <Callout tone="info" live>
            {notice}
          </Callout>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner tone="on-accent" />}
          Створити акаунт
        </button>
      </form>
    </AuthLayout>
  );
}
