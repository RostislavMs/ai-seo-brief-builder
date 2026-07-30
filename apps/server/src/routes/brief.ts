import { Hono } from "hono";
import { z } from "zod";
import type { BriefResponse } from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { parseBody, readJson } from "../http/validate";
import { parsedPageSchema } from "../schemas/page";
import { providerForUser } from "../services/ai";
import { generateBrief } from "../services/brief/generateBrief";
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
});

export const briefRoutes = new Hono<AuthEnv>();

briefRoutes.use("*", requireAuth);

briefRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(briefSchema, await readJson(c.req.raw));
  const provider = await providerForUser(config, c.get("user").id);

  // Мова ТЗ не налаштовується: вона визначається зі самих сторінок
  // конкурентів. Ручний вибір тут лише розходився б із даними.
  //
  // Правила підтягуються за визначеною мовою, тому передаються функцією:
  // на цей момент ще не відомо, якою мовою писані конкуренти. Разом із ними
  // приходять і спільні для всіх мов — це вирішує activeRules().
  const brief = await generateBrief(
    {
      topic: body.topic,
      pages: body.pages,
      loadRules: (languageCode) => activeRules(config, languageCode),
    },
    provider,
  );

  const response: BriefResponse = { brief };
  return c.json(response);
});
