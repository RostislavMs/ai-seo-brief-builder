import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { AuthUnavailable } from "../../components/auth/AuthUnavailable";
import { PasswordField } from "../../components/auth/PasswordField";
import { Callout } from "../../components/ui/Callout";
import { Spinner } from "../../components/ui/Spinner";

const MIN_PASSWORD = 8;

/**
 * Сторінка з листа відновлення.
 *
 * Supabase кладе токен у посилання й обмінює його на сесію ще до рендеру
 * (detectSessionInUrl). Тому тут уже є авторизований користувач, і лишається
 * тільки записати новий пароль.
 */
export function ResetPasswordPage() {
  const { updatePassword, status, configured } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) return <AuthUnavailable />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (password.length < MIN_PASSWORD) {
      setError(`Пароль має містити щонайменше ${MIN_PASSWORD} символів.`);
      return;
    }

    setBusy(true);
    setError(null);

    const result = await updatePassword(password);
    setBusy(false);

    if (result.ok) navigate("/", { replace: true });
    else setError(result.error);
  }

  if (status === "loading") {
    return (
      <AuthLayout title="Новий пароль">
        <div className="flex justify-center py-6">
          <Spinner className="size-6" />
        </div>
      </AuthLayout>
    );
  }

  // Посилання одноразове й живе близько години. Прострочене не дає сесії —
  // і без цієї гілки форма мовчки не спрацювала б.
  if (status === "anonymous") {
    return (
      <AuthLayout
        title="Посилання недійсне"
        description="Схоже, воно вже використане або застаріле."
        footer={
          <p>
            <Link to="/forgot-password" className="text-accent hover:underline">
              Надіслати нове посилання
            </Link>
          </p>
        }
      >
        <Callout tone="warn">
          Запросіть лист повторно й перейдіть за свіжим посиланням.
        </Callout>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Новий пароль"
      description="Після збереження ви одразу увійдете в акаунт."
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <PasswordField
          label="Новий пароль"
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

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner tone="on-accent" />}
          Зберегти пароль
        </button>
      </form>
    </AuthLayout>
  );
}
