import { useEffect, useState } from "react";
import type { HealthResponse } from "@brief/shared";
import { api } from "../lib/api";

type State =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse }
  | { kind: "down"; message: string };

/**
 * Індикатор доступності бекенда.
 *
 * Про AI тут нічого немає: ключ належить акаунту, і його стан показує рядок
 * під списком сесій — там, де видно й саму модель.
 */
export function HealthBadge() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    api
      .get<HealthResponse>("/health", controller.signal)
      .then((health) => setState({ kind: "ok", health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "down",
          message: error instanceof Error ? error.message : "Немає зʼєднання",
        });
      });

    return () => controller.abort();
  }, []);

  if (state.kind === "loading") {
    return <span className="text-xs text-subtle">перевірка сервера…</span>;
  }

  if (state.kind === "down") {
    return (
      <span className="flex items-center gap-2 text-xs text-danger">
        <span className="size-2 shrink-0 rounded-full bg-danger-solid" />
        {state.message}
      </span>
    );
  }

  // Крім кольору, стан несе й текст: без авторизації поруч стоїть пояснення,
  // тому зелений і жовтий не доводиться розрізняти на око.
  const { authConfigured } = state.health;

  return (
    <span className="num flex items-center gap-2 text-xs text-subtle">
      <span
        className={`size-2 shrink-0 rounded-full ${
          authConfigured ? "bg-success-solid" : "bg-warn-solid"
        }`}
      />
      {authConfigured ? "сервер на звʼязку" : "сервер без Supabase"}
    </span>
  );
}
