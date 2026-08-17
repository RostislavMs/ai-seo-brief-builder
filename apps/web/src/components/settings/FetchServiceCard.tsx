import { useEffect, useState } from "react";
import {
  FETCH_SERVICE_KEY_PREFIX,
  FETCH_SERVICE_KEY_URL,
  FETCH_SERVICE_LABEL,
  FETCH_SERVICE_NOTE,
  type FetchKeyStatus,
  type FetchKeySummary,
  type FetchServiceId,
} from "@brief/shared";
import {
  fetchKeyStatus,
  removeFetchKey,
  saveFetchKey,
} from "../../services/account";
import { ApiRequestError } from "../../lib/api";
import { Badge } from "../ui/Badge";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";
import { TrashIcon } from "../ui/Icon";

/**
 * Ключ одного платного сервісу доступу: додати, замінити, видалити.
 *
 * Простіше за ProviderCard навмисно: моделі тут немає, «активним» робити нічого
 * не треба — ключ або є, і тоді відповідна ступінь каскаду працює, або його
 * немає, і каскад обходиться безкоштовними ступенями.
 *
 * Ключ, як і в AI, ніколи не повертається з сервера — лишається підказка
 * на кшталт «••••a1b2».
 */

interface FetchServiceCardProps {
  service: FetchServiceId;
  existing: FetchKeySummary | null;
  /** Викликається після будь-якої зміни — щоб перечитати /api/me. */
  onChanged: () => Promise<void> | void;
}

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Невідома помилка";
}

/** Числа з розрядами: чотиризначний залишок кредитів інакше читається важко. */
function formatCount(value: number): string {
  return value.toLocaleString("uk-UA");
}

export function FetchServiceCard({
  service,
  existing,
  onChanged,
}: FetchServiceCardProps) {
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(existing === null);
  const [status, setStatus] = useState<FetchKeyStatus | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "deleting">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Залишок кредитів тягнемо на монтуванні: у /api/me його немає навмисно —
  // за ним стоїть запит до чужого API, а профіль читається на кожному екрані.
  useEffect(() => {
    if (!existing) {
      setStatus(null);
      return;
    }

    const controller = new AbortController();

    void fetchKeyStatus(service, controller.signal)
      .then(setStatus)
      .catch((caught: unknown) => {
        if (caught instanceof ApiRequestError && caught.code === "aborted") return;
        setError(errorText(caught));
      });

    return () => controller.abort();
  }, [service, existing]);

  async function save(): Promise<void> {
    setBusy("saving");
    setError(null);
    setNotice(null);

    try {
      const saved = await saveFetchKey(service, apiKey.trim());
      setApiKey("");
      setEditing(false);
      setStatus(saved.status);
      setNotice("Ключ збережено й перевірено.");
      await onChanged();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove(): Promise<void> {
    if (
      !window.confirm(
        `Видалити ключ ${FETCH_SERVICE_LABEL[service]}? ` +
          "Аналіз працюватиме далі, але без цієї ступені доступу.",
      )
    ) {
      return;
    }

    setBusy("deleting");
    setError(null);

    try {
      await removeFetchKey(service);
      setStatus(null);
      setApiKey("");
      setEditing(true);
      setNotice(null);
      await onChanged();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  const prefix = FETCH_SERVICE_KEY_PREFIX[service];
  const canSave = apiKey.trim().length > 0 && busy === null;

  return (
    <div className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {FETCH_SERVICE_LABEL[service]}
            </h3>
            {existing && <Badge tone="success">ключ додано</Badge>}
            {existing && status?.remainingCredits === 0 && (
              <Badge tone="danger">кредити закінчилися</Badge>
            )}
          </div>

          {existing ? (
            <p className="num mt-1 text-2xs text-subtle">
              {existing.hint}
              {status?.live && status.remainingCredits !== null && (
                <>
                  {" · "}
                  {formatCount(status.remainingCredits)} кредитів
                  {status.planCredits !== null &&
                    ` з ${formatCount(status.planCredits)}`}
                </>
              )}
              {existing && !status && " · читаю залишок…"}
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              {FETCH_SERVICE_NOTE[service]}{" "}
              <a
                href={FETCH_SERVICE_KEY_URL[service]}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Узяти ключ
              </a>
              . Оплата йде з вашого рахунку в сервісі.
            </p>
          )}
        </div>

        {existing && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy !== null}
            aria-label={`Видалити ключ ${FETCH_SERVICE_LABEL[service]}`}
            className="grid size-8 shrink-0 place-items-center rounded-inset text-subtle
              transition-colors duration-150 ease-out
              hover:bg-danger-soft hover:text-danger
              disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === "deleting" ? <Spinner /> : <TrashIcon />}
          </button>
        )}
      </div>

      {existing && !editing && (
        <button
          type="button"
          className="btn-quiet -ml-2.5"
          onClick={() => {
            setEditing(true);
            setNotice(null);
          }}
        >
          Замінити ключ
        </button>
      )}

      {editing && (
        <div className="space-y-3">
          {/*
            Власна <form> навколо поля ключа — з тієї самої причини, що
            й у ProviderCard: без неї Chrome вважає «формою входу» всю сторінку
            й підставляє в поле ключа збережений пароль.
          */}
          <form autoComplete="off" onSubmit={(event) => event.preventDefault()}>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">API-ключ</span>
              <input
                type="password"
                className="input font-mono"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={prefix ? `${prefix}…` : ""}
                name={`${service}-api-key`}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                spellCheck={false}
              />
            </label>
          </form>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void save()}
              disabled={!canSave}
            >
              {busy === "saving" && <Spinner tone="on-accent" />}
              Зберегти ключ
            </button>

            {existing && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setApiKey("");
                  setError(null);
                }}
              >
                Скасувати
              </button>
            )}
          </div>

          <p className="text-2xs leading-relaxed text-subtle">
            Ключ перевіряється запитом про залишок кредитів — це безкоштовно.
            Далі він шифрується на сервері й більше ніколи не повертається
            в браузер, навіть вам.
          </p>
        </div>
      )}

      {status?.warning && !error && (
        <Callout tone="warn" size="xs">
          {status.warning}
        </Callout>
      )}

      {error && (
        <Callout tone="danger" size="xs" live>
          {error}
        </Callout>
      )}

      {notice && !error && (
        <Callout tone="info" size="xs" live>
          {notice}
        </Callout>
      )}
    </div>
  );
}
