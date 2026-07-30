import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MODEL,
  PROVIDER_KEY_URL,
  PROVIDER_LABEL,
  type AiKeySummary,
  type AiProviderId,
  type ModelsResponse,
} from "@brief/shared";
import {
  changeKeyModel,
  fetchModels,
  previewModels,
  removeApiKey,
  saveApiKey,
} from "../../services/account";
import { ApiRequestError } from "../../lib/api";
import { Badge } from "../ui/Badge";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";
import { KeyIcon, TrashIcon } from "../ui/Icon";
import { ModelPicker } from "./ModelPicker";

/**
 * Ключ одного провайдера: додати, змінити модель, замінити, видалити.
 *
 * Ключ ніколи не повертається з сервера — його видно лише в момент
 * введення. Далі лишається підказка на кшталт «••••a1b2», щоб упізнати
 * свій ключ серед кількох.
 */

interface ProviderCardProps {
  provider: AiProviderId;
  existing: AiKeySummary | null;
  active: boolean;
  onActivate: () => void;
  /** Викликається після будь-якої зміни — щоб перечитати /api/me. */
  onChanged: () => Promise<void> | void;
}

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Невідома помилка";
}

export function ProviderCard({
  provider,
  existing,
  active,
  onActivate,
  onChanged,
}: ProviderCardProps) {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [model, setModel] = useState(existing?.model ?? DEFAULT_MODEL[provider]);
  const [apiKey, setApiKey] = useState("");
  const [editing, setEditing] = useState(existing === null);
  const [busy, setBusy] = useState<null | "checking" | "saving" | "deleting">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Перелік для вже збереженого ключа тягнемо одразу: без нього поле
  // вибору моделі показувало б каталог замість реально доступного.
  useEffect(() => {
    if (!existing) {
      setModels(null);
      return;
    }

    const controller = new AbortController();

    void fetchModels(provider, controller.signal)
      .then(setModels)
      .catch((caught: unknown) => {
        if (caught instanceof ApiRequestError && caught.code === "aborted") return;
        setError(errorText(caught));
      });

    return () => controller.abort();
  }, [provider, existing]);

  useEffect(() => {
    if (existing) setModel(existing.model);
  }, [existing]);

  const checkKey = useCallback(async (): Promise<void> => {
    setBusy("checking");
    setError(null);
    setNotice(null);

    try {
      const data = await previewModels(provider, apiKey.trim());
      setModels(data);

      if (data.warning) setError(data.warning);
      else setModel(data.recommended);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }, [provider, apiKey]);

  async function save(): Promise<void> {
    setBusy("saving");
    setError(null);
    setNotice(null);

    try {
      await saveApiKey(provider, apiKey.trim(), model);
      setApiKey("");
      setEditing(false);
      setNotice("Ключ збережено.");
      await onChanged();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  async function switchModel(next: string): Promise<void> {
    const previous = model;
    setModel(next);

    if (!existing) return;

    setError(null);
    setNotice(null);

    try {
      await changeKeyModel(provider, next);
      setNotice("Модель змінено.");
      await onChanged();
    } catch (caught) {
      setModel(previous);
      setError(errorText(caught));
    }
  }

  async function remove(): Promise<void> {
    if (
      !window.confirm(
        `Видалити ключ ${PROVIDER_LABEL[provider]}? Його доведеться вводити заново.`,
      )
    ) {
      return;
    }

    setBusy("deleting");
    setError(null);

    try {
      await removeApiKey(provider);
      setModels(null);
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

  const canSave = apiKey.trim().length > 0 && model.length > 0 && busy === null;

  return (
    <div className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{PROVIDER_LABEL[provider]}</h3>
            {existing && <Badge tone="success">ключ додано</Badge>}
            {active && <Badge tone="accent">активний</Badge>}
          </div>

          {existing ? (
            <p className="num mt-1 text-2xs text-subtle">
              {existing.hint} · модель {existing.model}
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Ключ береться на{" "}
              <a
                href={PROVIDER_KEY_URL[provider]}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                сторінці провайдера
              </a>
              . Оплата йде з вашого рахунку в нього.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {existing && !active && (
            <button type="button" className="btn-quiet" onClick={onActivate}>
              Зробити активним
            </button>
          )}
          {existing && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy !== null}
              aria-label={`Видалити ключ ${PROVIDER_LABEL[provider]}`}
              className="grid size-8 place-items-center rounded-inset text-subtle
                transition-colors duration-150 ease-out
                hover:bg-danger-soft hover:text-danger
                disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy === "deleting" ? <Spinner /> : <TrashIcon />}
            </button>
          )}
        </div>
      </div>

      {existing && !editing && models && (
        <ModelPicker
          data={models}
          value={model}
          onChange={(next) => void switchModel(next)}
        />
      )}

      {existing && !editing && !models && (
        <div className="flex items-center gap-2 text-xs text-subtle">
          <Spinner />
          Читаю перелік доступних моделей…
        </div>
      )}

      {existing && !editing && (
        <button
          type="button"
          className="btn-quiet -ml-2.5"
          onClick={() => {
            setEditing(true);
            setModels(null);
            setNotice(null);
          }}
        >
          Замінити ключ
        </button>
      )}

      {editing && (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">API-ключ</span>
            {/* type="password": ключ бачить будь-хто, хто дивиться в екран,
                а вводять його часто не на самоті. */}
            <input
              type="password"
              className="input font-mono"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                provider === "anthropic"
                  ? "sk-ant-…"
                  : provider === "openai"
                    ? "sk-…"
                    : "AIza… або AQ.…"
              }
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <button
            type="button"
            className="btn-ghost w-full sm:w-auto"
            onClick={() => void checkKey()}
            disabled={apiKey.trim().length === 0 || busy !== null}
          >
            {busy === "checking" ? <Spinner /> : <KeyIcon />}
            Перевірити ключ і показати моделі
          </button>

          {models && (
            <ModelPicker
              data={models}
              value={model}
              onChange={setModel}
              disabled={busy !== null}
            />
          )}

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
            Ключ шифрується на сервері й більше ніколи не повертається
            в браузер — навіть вам. Побачити його знову не вийде, лише замінити.
          </p>
        </div>
      )}

      {models?.warning && !error && (
        <Callout tone="warn" size="xs">
          {models.warning}
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
