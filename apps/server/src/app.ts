import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { HealthResponse } from "@brief/shared";
import { getConfig } from "./config";
import { AppError, toApiError } from "./http/errors";
import { isSupabaseConfigured } from "./lib/supabase";
import {
  keyRoutes,
  meRoutes,
  modelRoutes,
  settingsRoutes,
} from "./routes/account";
import { analyzeRoutes } from "./routes/analyze";
import { briefRoutes } from "./routes/brief";
import { chatRoutes } from "./routes/chat";
import { compareRoutes } from "./routes/compare";
import { promptRoutes } from "./routes/prompts";
import { ruleRoutes } from "./routes/rules";
import { sessionRoutes } from "./routes/sessions";

/**
 * Hono-застосунок з усім API. Nitro лише хостить його
 * (див. routes/api/[...].ts) — уся маршрутизація тут.
 *
 * Публічний лише /health. Решта проходить через requireAuth, який
 * підключається всередині кожного роутера — так неможливо додати
 * маршрут і забути про захист.
 */
export const app = new Hono().basePath("/api");

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => {
  // Про AI тут нічого немає: ключ належить акаунту, а не серверу,
  // тому стан AI віддає /api/me, і лише для того, хто ввійшов.
  const body: HealthResponse = {
    ok: true,
    authConfigured: isSupabaseConfigured(getConfig()),
  };
  return c.json(body);
});

app.route("/me", meRoutes);
app.route("/keys", keyRoutes);
app.route("/settings", settingsRoutes);
app.route("/models", modelRoutes);
app.route("/rules", ruleRoutes);
app.route("/prompts", promptRoutes);
app.route("/sessions", sessionRoutes);

app.route("/analyze", analyzeRoutes);
app.route("/brief", briefRoutes);
app.route("/chat", chatRoutes);
app.route("/compare", compareRoutes);

app.notFound((c) =>
  c.json(toApiError("not_found", `Маршрут ${c.req.path} не існує`), 404),
);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(toApiError(err.code, err.message), err.status);
  }

  console.error("[api] необроблена помилка:", err);
  return c.json(toApiError("internal_error", "Внутрішня помилка сервера"), 500);
});
