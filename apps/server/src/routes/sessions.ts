import { Hono } from "hono";
import { z } from "zod";
import type {
  AnalysisResponse,
  ImportSessionsResponse,
  MessageResponse,
  SessionListResponse,
  SessionResponse,
  ShareResponse,
} from "@brief/shared";
import { isLanguageCode } from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { parseBody, readJson } from "../http/validate";
import { parsedPageSchema } from "../schemas/page";
import { seoBriefSchema } from "../services/brief/schema";
import { pageComparisonSchema } from "../services/compare/schema";
import { publishShare, unpublishShare } from "../services/shares/publish";
import {
  clearOwnPage,
  createMessage,
  createSession,
  deleteMessage,
  deleteSession,
  getSession,
  importSessions,
  listSessions,
  setOwnPage,
  updateAnalysis,
  updateSession,
} from "../services/sessions/repository";

const MAX_URLS = 10;

const createSchema = z.object({
  name: z.string().trim().min(1, "назва не може бути порожньою").max(120),
  topic: z.string().trim().max(300).default(""),
  urls: z
    .array(z.string().trim().min(1))
    .min(1, "потрібен хоча б один URL")
    .max(MAX_URLS, `максимум ${MAX_URLS} URL`),
  // Порожній рядок від форми — це «не вказано», а не помилка валідації.
  ownUrl: z.string().trim().max(2000).optional(),
});

/**
 * Код мови приймається лише з реєстру: ним вибираються правила для промпта
 * й ним модель пише весь контент ТЗ, тому «xx» тут дорожче за помилку 400.
 */
const languageCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isLanguageCode, "невідомий код мови");

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    topic: z.string().trim().max(300).optional(),
    brief: seoBriefSchema.nullable().optional(),
    comparison: pageComparisonSchema.nullable().optional(),
    legacyBriefRemoved: z.boolean().optional(),
    contentLanguage: languageCodeSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "нема чого змінювати",
  });

const ownPageSchema = z.object({
  url: z.string().trim().min(1, "URL не може бути порожнім").max(2000),
});

/**
 * Одним маршрутом ідуть два різні виклики: результат парсингу (усі чотири
 * поля разом) і прапорець «не використовувати для ТЗ» сам по собі. Тому поля
 * необовʼязкові, а порожнє тіло відсіюється — як і в правці сесії.
 */
const analysisSchema = z
  .object({
    status: z.enum(["pending", "loading", "success", "error"]).optional(),
    page: parsedPageSchema.nullable().optional(),
    error: z.string().max(2000).nullable().optional(),
    analyzedAt: z.string().nullable().optional(),
    excluded: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "нема чого змінювати",
  });

/**
 * Вибір розділів для публічної версії.
 *
 * Самого вмісту в тілі немає навмисно: зліпок збирає сервер із сесії. Приймати
 * його від клієнта означало б дати змогу опублікувати за своїм посиланням
 * будь-що.
 */
const shareSchema = z.object({
  analyses: z.boolean().default(false),
  comparison: z.boolean().default(false),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(20_000),
  changedBrief: z.boolean().default(false),
});

/** Схема локальної сесії для імпорту — навмисно поблажлива. */
const importSchema = z.object({
  sessions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(120),
        topic: z.string().trim().max(300).default(""),
        createdAt: z.string(),
        updatedAt: z.string(),
        urls: z.array(z.string()).max(MAX_URLS),
        analyses: z
          .array(
            z.object({
              id: z.string(),
              url: z.string(),
              status: z.enum(["pending", "loading", "success", "error"]),
              page: parsedPageSchema.nullable(),
              error: z.string().nullable(),
              analyzedAt: z.string().nullable(),
            }),
          )
          .max(MAX_URLS),
        messages: z
          .array(
            z.object({
              id: z.string(),
              role: z.enum(["user", "assistant"]),
              content: z.string(),
              createdAt: z.string(),
              changedBrief: z.boolean().optional(),
            }),
          )
          .max(200),
        // Старе ТЗ може не пройти поточну схему — тоді переносимо сесію
        // без нього, а не відмовляємо в імпорті цілком.
        brief: seoBriefSchema.nullable().catch(null),
        legacyBriefRemoved: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(50, "за раз переносимо не більше 50 сесій"),
});

export const sessionRoutes = new Hono<AuthEnv>();

sessionRoutes.use("*", requireAuth);

sessionRoutes.get("/", async (c) => {
  const sessions = await listSessions(getConfig(), c.get("user").id);
  const body: SessionListResponse = { sessions };
  return c.json(body);
});

sessionRoutes.post("/", async (c) => {
  const body = parseBody(createSchema, await readJson(c.req.raw));

  const session = await createSession(getConfig(), c.get("user").id, {
    name: body.name,
    // Тема порожня — беремо назву: далі вона йде в промпт як цільовий ключ.
    topic: body.topic || body.name,
    urls: body.urls,
    ...(body.ownUrl ? { ownUrl: body.ownUrl } : {}),
  });

  const response: SessionResponse = { session };
  return c.json(response, 201);
});

// Реєструється до "/:id", інакше Hono прийме "import" за ідентифікатор.
sessionRoutes.post("/import", async (c) => {
  const body = parseBody(importSchema, await readJson(c.req.raw));

  const result = await importSessions(
    getConfig(),
    c.get("user").id,
    body.sessions,
  );

  const response: ImportSessionsResponse = result;
  return c.json(response);
});

sessionRoutes.get("/:id", async (c) => {
  const session = await getSession(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
  );

  const body: SessionResponse = { session };
  return c.json(body);
});

sessionRoutes.patch("/:id", async (c) => {
  const body = parseBody(updateSchema, await readJson(c.req.raw));

  const session = await updateSession(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
    body,
  );

  const response: SessionResponse = { session };
  return c.json(response);
});

sessionRoutes.delete("/:id", async (c) => {
  await deleteSession(getConfig(), c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});

sessionRoutes.patch("/:id/analyses/:analysisId", async (c) => {
  const body = parseBody(analysisSchema, await readJson(c.req.raw));

  const analysis = await updateAnalysis(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
    c.req.param("analysisId"),
    body,
  );

  const response: AnalysisResponse = { analysis };
  return c.json(response);
});

/**
 * Власна сторінка сесії — та, яку порівнюємо з конкурентами.
 *
 * PUT, а не POST: сторінка в сесії одна, і повторний виклик має замінювати її.
 * Результат парсингу зберігається звичайним PATCH .../analyses/:analysisId —
 * власна сторінка проходить рівно той самий шлях, що й конкуренти.
 */
sessionRoutes.put("/:id/own-page", async (c) => {
  const body = parseBody(ownPageSchema, await readJson(c.req.raw));

  const analysis = await setOwnPage(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
    body.url,
  );

  const response: AnalysisResponse = { analysis };
  return c.json(response, 201);
});

sessionRoutes.delete("/:id/own-page", async (c) => {
  await clearOwnPage(getConfig(), c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});

/**
 * Публічна версія сесії.
 *
 * PUT, а не POST: публічна версія в сесії одна, і повторний виклик має
 * перезаписувати її зліпок, а не створювати друге посилання. Токен при цьому
 * лишається той самий — інакше «оновити публічну версію» ламало б посилання,
 * яке вже надіслали клієнтові.
 *
 * Сама сесія у відповіді не повертається: вона важить стільки ж, скільки весь
 * розібраний контент, а змінюється тут лише публічна версія.
 */
sessionRoutes.put("/:id/share", async (c) => {
  const body = parseBody(shareSchema, await readJson(c.req.raw));

  const share = await publishShare(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
    body,
  );

  const response: ShareResponse = { share };
  return c.json(response);
});

sessionRoutes.delete("/:id/share", async (c) => {
  await unpublishShare(getConfig(), c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});

sessionRoutes.post("/:id/messages", async (c) => {
  const body = parseBody(messageSchema, await readJson(c.req.raw));

  const message = await createMessage(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
    body,
  );

  const response: MessageResponse = { message };
  return c.json(response, 201);
});

// Репліка користувача, що лишилася без відповіді AI, прибирається:
// два повідомлення user підряд ламають діалог у наступному запиті.
sessionRoutes.delete("/:id/messages/:messageId", async (c) => {
  await deleteMessage(
    getConfig(),
    c.get("user").id,
    c.req.param("id"),
    c.req.param("messageId"),
  );

  return c.body(null, 204);
});
