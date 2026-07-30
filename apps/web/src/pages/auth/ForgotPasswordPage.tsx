import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { AuthUnavailable } from "../../components/auth/AuthUnavailable";
import { Callout } from "../../components/ui/Callout";
import { Spinner } from "../../components/ui/Spinner";

export function ForgotPasswordPage() {
  const { requestPasswordReset, configured } = useAuth();

  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) return <AuthUnavailable />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await requestPasswordReset(email);
    setBusy(false);

    if (result.ok) setNotice(result.message ?? "Лист надіслано.");
    else setError(result.error);
  }

  return (
    <AuthLayout
      title="Відновлення пароля"
      description="Надішлемо посилання для встановлення нового пароля."
      footer={
        <p>
          Згадали пароль?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Увійти
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
          Надіслати посилання
        </button>
      </form>
    </AuthLayout>
  );
}
