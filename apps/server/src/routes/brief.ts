import { Hono } from "hono";
import { z } from "zod";
import type { BriefResponse, RequirementsResponse } from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { parseBody, readJson } from "../http/validate";
import { parsedPageSchema } from "../schemas/page";
import { providerForUser } from "../services/ai";
import { generateBrief } from "../services/brief/generateBrief";
import { resolvePromptSet } from "../services/prompts/repository";
import { activeRules } from "../services/rules/repository";

const briefSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "тема має містити хоча б 2 символи")
    .max(300, "тема задовга"),
  pages: z
    .array(parsedPageSchema)
    .min(1, "потрібна хоча б одна проаналізована сторінка")
    .max(10, "максимум 10 сторінок"),
  // Невідомий код тут не помилка запиту, а привід довіритися автовизначенню:
  // ТЗ не має падати через мову, яку хтось задав руками в старій сесії.
  languageCode: z.string().trim().toLowerCase().optional(),
});

export const briefRoutes = new Hono<AuthEnv>();

briefRoutes.use("*", requireAuth);

/**
 * GET /api/brief/requirements — чинний текст вимог до тексту.
 *
 * Окремим маршрутом, а не разом із ТЗ: вимоги не залежать від сесії й
 * однакові для всіх, тому вкладати їх у кожну відповідь генерації означало б
 * повторювати кілька кілобайт там, де вистачає одного запиту на відкриття
 * застосунку.
 *
 * І не через `GET /api/prompts`: там віддаються всі промпти разом із
 * початковими текстами й переліком вставок — сотні кілобайт заради одного
 * поля, яке потрібне на кожній сторінці сесії з готовим ТЗ.
 */
briefRoutes.get("/requirements", async (c) => {
  const prompts = await resolvePromptSet(getConfig());

  const body: RequirementsResponse = {
    requirements: prompts["document.requirements"],
  };
  return c.json(body);
});

briefRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(briefSchema, await readJson(c.req.raw));

  // Провайдер і промпти — паралельно: обидва потрібні до першого звернення
  // до моделі й один одного не чекають.
  // Сигнал розриву — щоб «Скасувати» в інтерфейсі обривало запит до моделі,
  // а не лише очікування в браузері.
  const [provider, prompts] = await Promise.all([
    providerForUser(config, c.get("user").id, c.req.raw.signal),
    resolvePromptSet(config),
  ]);

  // Мова визначається зі самих сторінок конкурентів. `languageCode` приходить
  // лише тоді, коли користувач виправив її вручну у вкладці «Аналіз»: там
  // видно і визначену мову, і те, на чому визначення трималося.
  //
  // Правила підтягуються за остаточною мовою, тому передаються функцією:
  // на цей момент ще не відомо, якою мовою писані конкуренти. Разом із ними
  // приходять і спільні для всіх мов — це вирішує activeRules().
  const brief = await generateBrief(
    {
      topic: body.topic,
      pages: body.pages,
      ...(body.languageCode ? { languageCode: body.languageCode } : {}),
      loadRules: (languageCode) => activeRules(config, languageCode),
      prompts,
    },
    provider,
  );

  const response: BriefResponse = { brief };
  return c.json(response);
});
