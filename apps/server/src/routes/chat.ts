import { Hono } from "hono";
import { z } from "zod";
import { ALL_LANGUAGES, languageCodeByName, type ChatResponse } from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { parseBody, readJson } from "../http/validate";
import { parsedPageSchema } from "../schemas/page";
import { providerForUser } from "../services/ai";
import { editBrief } from "../services/brief/editBrief";
import { seoBriefSchema } from "../services/brief/schema";
import { resolvePromptSet } from "../services/prompts/repository";
import { activeRules } from "../services/rules/repository";

const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
  changedBrief: z.boolean().optional(),
});

const chatSchema = z.object({
  topic: z.string().trim().min(1).max(300),
  // Поточне ТЗ приходить від клієнта — валідуємо тією ж схемою,
  // якою перевіряли відповідь моделі.
  brief: seoBriefSchema,
  history: z.array(chatMessageSchema).max(200),
  message: z
    .string()
    .trim()
    .min(1, "повідомлення не може бути порожнім")
    .max(2000, "повідомлення задовге"),
  // Мова правок береться з самого брифу (contentLanguage), тому в запиті її нема.
  pages: z.array(parsedPageSchema).max(10),
});

export const chatRoutes = new Hono<AuthEnv>();

chatRoutes.use("*", requireAuth);

chatRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(chatSchema, await readJson(c.req.raw));
  // Сигнал розриву: правка коротша за генерацію, але кинута вкладка так само
  // не має тримати запит до моделі.
  const provider = await providerForUser(
    config,
    c.get("user").id,
    c.req.raw.signal,
  );

  // Мову правка не змінює, тому код виводимо з назви, збереженої в брифі.
  // Назва не з реєстру (стара сесія, вільна форма від моделі) не скасовує
  // правил: спільні для всіх мов діють і без розпізнаної мови, тому в такому
  // разі просимо правила за самим сентинелом.
  const languageCode = languageCodeByName(body.brief.contentLanguage);

  const [rules, prompts] = await Promise.all([
    activeRules(config, languageCode ?? ALL_LANGUAGES),
    resolvePromptSet(config),
  ]);

  const result = await editBrief(
    {
      topic: body.topic,
      brief: body.brief,
      history: body.history,
      message: body.message,
      pages: body.pages,
      rules,
      prompts,
    },
    provider,
  );

  const response: ChatResponse = { reply: result.reply, brief: result.brief };
  return c.json(response);
});
