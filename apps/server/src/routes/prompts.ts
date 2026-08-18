import { Hono } from "hono";
import { z } from "zod";
import type {
  PromptHistoryResponse,
  PromptListResponse,
  PromptResponse,
} from "@brief/shared";
import { getConfig } from "../config";
import { requireAdmin } from "../http/admin";
import { requireAuth, type AuthEnv } from "../http/auth";
import { AppError } from "../http/errors";
import { parseBody, readJson } from "../http/validate";
import {
  isPromptKey,
  promptDefinition,
  type PromptKey,
} from "../services/prompts/registry";
import { assertValidBody } from "../services/prompts/render";
import {
  listPrompts,
  promptHistory,
  resetPrompt,
  savePrompt,
} from "../services/prompts/repository";

/**
 * Промпти до моделі — і, як виняток, вимоги до тексту в самому ТЗ
 * (`document.requirements`): вони потребують того самого — початкового тексту
 * в коді, правки лише адміном, історії й скидання, — тому йдуть тим самим
 * маршрутом, а не другою копією цієї машинерії.
 *
 * Читання відкрите всім, хто ввійшов: за цими текстами генерується ТЗ, і
 * бачити, що саме просять у моделі, має кожен — рівно як і правила для мов.
 * Правка, скидання й історія правок — за requireAdmin.
 *
 * Пропозицій, як у правилах, тут немає навмисно. Правило додається до
 * переліку й може почекати розгляду, не ламаючи нічого. Промпт існує в
 * єдиному екземплярі: «пропозиція нового тексту завдання для моделі» — це
 * або новий текст, або нічого, і проміжного стану в неї бути не може.
 */

/**
 * Межа в 20 000 символів — та сама, що в схемі бази. Промпт цілком іде
 * в кожен запит до моделі, тому текст на дві сторінки коштує токенів
 * на кожній генерації.
 */
const bodySchema = z
  .string()
  // Без .trim(): переноси рядків і відступи — частина промпта, а порожні
  // рядки на його межах впливають на те, як склеюються сусідні блоки.
  .min(10, "промпт надто короткий")
  .max(20_000, "промпт задовгий — максимум 20 000 символів")
  .refine((value) => value.trim().length >= 10, "промпт надто короткий");

const updateSchema = z.object({
  body: bodySchema,
  note: z.string().trim().max(500).nullable().optional(),
});

/** Ключ із маршруту, звірений із реєстром у коді. */
function keyParam(value: string): PromptKey {
  if (!isPromptKey(value)) {
    throw new AppError("prompt_not_found", `Промпта ${value} не існує.`, 404);
  }

  return value;
}

export const promptRoutes = new Hono<AuthEnv>();

promptRoutes.use("*", requireAuth);

/**
 * GET /api/prompts — усі промпти разом із початковим текстом і переліком
 * допустимих вставок. Одним запитом, а не по одному: їх вісім, вони показуються
 * на одному екрані, і вісім запитів дали б вісім спінерів.
 */
promptRoutes.get("/", async (c) => {
  const prompts = await listPrompts(getConfig());

  const body: PromptListResponse = { prompts };
  return c.json(body);
});

/**
 * GET /api/prompts/:key/history — редакції одного промпта.
 *
 * Лише для адміна: сам текст промпта бачить кожен, а от хто і коли його
 * правив — службова інформація про роботу команди, і на генерацію ТЗ вона
 * не впливає.
 */
promptRoutes.get("/:key/history", requireAdmin, async (c) => {
  const versions = await promptHistory(getConfig(), keyParam(c.req.param("key")));

  const body: PromptHistoryResponse = { versions };
  return c.json(body);
});

/**
 * PUT /api/prompts/:key — новий текст промпта.
 *
 * Текст звіряється з реєстром до збереження: вставка з опискою або прибрана
 * обовʼязкова вставка відхиляються з поясненням. Це єдиний машинний
 * запобіжник на цьому шляху — розгляду, як у правил, промпт не проходить.
 */
promptRoutes.put("/:key", requireAdmin, async (c) => {
  const key = keyParam(c.req.param("key"));
  const input = parseBody(updateSchema, await readJson(c.req.raw));

  // Ключ уже звірений, тому опис існує.
  const definition = promptDefinition(key)!;

  assertValidBody(definition, input.body);
  // Понад звірку вставок: у тексту може бути ще й форма — див. PromptDefinition.
  definition.validate?.(input.body);

  const prompt = await savePrompt(
    getConfig(),
    c.get("user").id,
    key,
    input.body,
    input.note ?? null,
  );

  const response: PromptResponse = { prompt };
  return c.json(response);
});

/** DELETE /api/prompts/:key — повернути початковий текст із коду. */
promptRoutes.delete("/:key", requireAdmin, async (c) => {
  const prompt = await resetPrompt(
    getConfig(),
    c.get("user").id,
    keyParam(c.req.param("key")),
    null,
  );

  const response: PromptResponse = { prompt };
  return c.json(response);
});
