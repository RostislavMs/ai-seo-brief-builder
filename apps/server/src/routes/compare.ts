import { Hono } from "hono";
import { z } from "zod";
import type { CompareResponse } from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { parseBody, readJson } from "../http/validate";
import { parsedPageSchema } from "../schemas/page";
import { providerForUser } from "../services/ai";
import { comparePage } from "../services/compare/comparePage";
import { resolvePromptSet } from "../services/prompts/repository";
import { activeRules } from "../services/rules/repository";

const compareSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(2, "тема має містити хоча б 2 символи")
    .max(300, "тема задовга"),
  page: parsedPageSchema,
  competitors: z
    .array(parsedPageSchema)
    .min(1, "потрібна хоча б одна проаналізована сторінка конкурента")
    .max(10, "максимум 10 сторінок"),
  // Як і в /brief: невідомий код означає «визначай сам», а не 400.
  languageCode: z.string().trim().toLowerCase().optional(),
});

export const compareRoutes = new Hono<AuthEnv>();

compareRoutes.use("*", requireAuth);

compareRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(compareSchema, await readJson(c.req.raw));

  // Сигнал розриву — як і в генерації ТЗ: скасування має доходити до моделі.
  const [provider, prompts] = await Promise.all([
    providerForUser(config, c.get("user").id, c.req.raw.signal),
    resolvePromptSet(config),
  ]);

  // Мова, як і в генерації ТЗ, визначається зі самих сторінок, тому правила
  // передаються способом їх дістати, а не готовим списком. Перевизначення
  // з вкладки «Аналіз» діє на обидва сценарії — мова в сесії одна.
  const comparison = await comparePage(
    {
      topic: body.topic,
      own: body.page,
      competitors: body.competitors,
      ...(body.languageCode ? { languageCode: body.languageCode } : {}),
      loadRules: (languageCode) => activeRules(config, languageCode),
      prompts,
    },
    provider,
  );

  const response: CompareResponse = { comparison };
  return c.json(response);
});
