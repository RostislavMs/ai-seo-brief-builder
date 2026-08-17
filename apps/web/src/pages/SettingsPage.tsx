import { useEffect, useState } from "react";
import {
  AI_PROVIDER_IDS,
  FETCH_SERVICE_IDS,
  type AiProviderId,
  type FetchServiceId,
} from "@brief/shared";
import { useAccount } from "../auth/AccountContext";
import { useAuth } from "../auth/AuthContext";
import { FetchServiceCard } from "../components/settings/FetchServiceCard";
import { ProviderCard } from "../components/settings/ProviderCard";
import { Badge } from "../components/ui/Badge";
import { Callout } from "../components/ui/Callout";
import { Spinner } from "../components/ui/Spinner";
import { saveDisplayName, saveSettings } from "../services/account";
import { ApiRequestError } from "../lib/api";

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Невідома помилка";
}

export function SettingsPage() {
  const { me, loading, error, refresh } = useAccount();
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [profileState, setProfileState] = useState<{
    busy: boolean;
    message: string | null;
    error: string | null;
  }>({ busy: false, message: null, error: null });
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (me) setDisplayName(me.profile.displayName ?? "");
  }, [me]);

  if (loading && !me) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (error && !me) {
    return <Callout tone="danger">{error}</Callout>;
  }

  if (!me) return null;

  async function submitProfile(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setProfileState({ busy: true, message: null, error: null });

    try {
      await saveDisplayName(displayName.trim() || null);
      await refresh();
      setProfileState({ busy: false, message: "Збережено.", error: null });
    } catch (caught) {
      setProfileState({ busy: false, message: null, error: errorText(caught) });
    }
  }

  async function activate(provider: AiProviderId): Promise<void> {
    setSettingsError(null);

    try {
      await saveSettings({ activeProvider: provider });
      await refresh();
    } catch (caught) {
      setSettingsError(errorText(caught));
    }
  }

  const keyFor = (provider: AiProviderId) =>
    me.keys.find((key) => key.provider === provider) ?? null;

  const fetchKeyFor = (service: FetchServiceId) =>
    me.fetchKeys.find((key) => key.service === service) ?? null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Налаштування</h1>
        <p className="mt-1 text-sm leading-relaxed text-subtle">
          Профіль, ключі AI-провайдерів і доступ до закритих сторінок.
        </p>
      </div>

      {/* ── Профіль ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Профіль</h2>

        <form
          onSubmit={(event) => void submitProfile(event)}
          className="card space-y-4 p-4 sm:p-5"
        >
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Пошта</span>
            <p className="num text-sm text-fg">
              {me.profile.email || user?.email}
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Роль</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={me.profile.role === "admin" ? "accent" : "neutral"}>
                {me.profile.role === "admin" ? "адміністратор" : "користувач"}
              </Badge>
              <span className="text-xs leading-relaxed text-subtle">
                {me.profile.role === "admin"
                  ? "Розглядаєте пропозиції правил для мов, пишете власні, вмикаєте й видаляєте їх."
                  : "Можете пропонувати правила для мов; вводить їх у дію адміністратор."}
              </span>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Імʼя</span>
            <input
              className="input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Як до вас звертатися"
              maxLength={80}
            />
          </label>

          {profileState.error && (
            <Callout tone="danger" size="xs" live>
              {profileState.error}
            </Callout>
          )}

          {profileState.message && !profileState.error && (
            <Callout tone="info" size="xs" live>
              {profileState.message}
            </Callout>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={profileState.busy}
          >
            {profileState.busy && <Spinner tone="on-accent" />}
            Зберегти
          </button>
        </form>
      </section>

      {/* ── AI ──────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">AI-провайдери</h2>
          <p className="mt-1 text-sm leading-relaxed text-subtle">
            Ключ потрібен власний — спільного ключа сервера немає. Запити
            йдуть через ваш ключ, а оплата — з вашого рахунку в провайдера.
          </p>
        </div>

        <div className="panel flex flex-wrap items-center gap-2 p-3 text-xs">
          <span className="text-subtle">Зараз працює:</span>
          {me.effective.source === "none" ? (
            <Badge tone="danger">не налаштовано</Badge>
          ) : (
            <>
              <Badge tone="success">ваш ключ</Badge>
              <span className="num text-fg">{me.effective.model}</span>
            </>
          )}
        </div>

        {me.effective.source === "none" && (
          <Callout tone="warn" size="xs">
            Генерація ТЗ не запрацює, доки не додано ключа. Парсинг сторінок
            працює і без нього.
          </Callout>
        )}

        {settingsError && (
          <Callout tone="danger" size="xs" live>
            {settingsError}
          </Callout>
        )}

        <div className="space-y-3">
          {AI_PROVIDER_IDS.map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              existing={keyFor(provider)}
              active={me.settings.activeProvider === provider}
              onActivate={() => void activate(provider)}
              onChanged={refresh}
            />
          ))}
        </div>
      </section>

      {/* ── Доступ до закритих сторінок ──────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Доступ до закритих сторінок</h2>
          <p className="mt-1 text-sm leading-relaxed text-subtle">
            Необовʼязково. Сторінку конкурента сервіс дістає послідовністю
            безкоштовних спроб — прямий запит, браузер, зовнішній сервіс
            читання, — і для більшості сайтів цього достатньо. Ключ нижче
            додає ще одну спробу для тих сторінок, які не беруться нічим
            безкоштовним: за них платите ви, і лише за ті, де до неї дійшло.
          </p>
        </div>

        <div className="space-y-3">
          {FETCH_SERVICE_IDS.map((service) => (
            <FetchServiceCard
              key={service}
              service={service}
              existing={fetchKeyFor(service)}
              onChanged={refresh}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
