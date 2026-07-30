import { useState } from "react";
import { useSessions } from "../../sessions/SessionsContext";
import {
  clearLocalSessions,
  countLocalSessions,
  readLocalSessions,
} from "../../services/localSessions";
import { importSessions } from "../../services/sessions";
import { plural } from "../../lib/format";
import { Callout } from "../ui/Callout";
import { Spinner } from "../ui/Spinner";

/**
 * Перенесення сесій, що лишилися в localStorage від версії без акаунтів.
 *
 * Показується рівно доти, доки в браузері щось лежить. Мовчки переносити
 * не можна: сесії могли створюватися на спільному комп'ютері, і прив'язати
 * їх до чужого акаунта — гірше, ніж не перенести взагалі.
 */
export function ImportLocalBanner() {
  const { refresh } = useSessions();

  // Кількість читається один раз при монтуванні: під час імпорту вона
  // не змінюється, а перечитувати сховище на кожен рендер немає сенсу.
  const [count, setCount] = useState(() => countLocalSessions());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      const sessions = readLocalSessions();
      const outcome = await importSessions(sessions);

      clearLocalSessions();
      setCount(0);
      await refresh();

      setResult(
        outcome.skipped > 0
          ? `Перенесено ${outcome.imported}, пропущено ${outcome.skipped} ` +
              "(пошкоджені дані)."
          : `Перенесено ${outcome.imported} ` +
              `${plural(outcome.imported, "сесію", "сесії", "сесій")}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не вдалося перенести сесії.",
      );
    } finally {
      setBusy(false);
    }
  }

  function discard(): void {
    if (
      !window.confirm(
        "Видалити локальні сесії без перенесення? Відновити їх буде неможливо.",
      )
    ) {
      return;
    }

    clearLocalSessions();
    setCount(0);
  }

  if (result) {
    return (
      <Callout tone="info" live>
        {result}
      </Callout>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">
          У цьому браузері лежать старі сесії
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-subtle">
          {count} {plural(count, "сесія", "сесії", "сесій")} збереглися з часів,
          коли застосунок працював без акаунтів. Перенесіть їх — і вони стануть
          доступні з будь-якого пристрою.
        </p>
      </div>

      {error && (
        <Callout tone="danger" size="xs" live>
          {error}
        </Callout>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void run()}
          disabled={busy}
        >
          {busy && <Spinner tone="on-accent" />}
          Перенести в акаунт
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={discard}
          disabled={busy}
        >
          Видалити локальні
        </button>
      </div>
    </div>
  );
}
