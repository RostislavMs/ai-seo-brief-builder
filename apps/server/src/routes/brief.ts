import { Hono } from "hono";
import { z } from "zod";
import type { BriefResponse } from "@brief/shared";
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

briefRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(briefSchema, await readJson(c.req.raw));

  // Провайдер і промпти — паралельно: обидва потрібні до першого звернення
  // до моделі й один одного не чекають.
  const [provider, prompts] = await Promise.all([
    providerForUser(config, c.get("user").id),
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
