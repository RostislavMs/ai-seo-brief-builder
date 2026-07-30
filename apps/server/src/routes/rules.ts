import { Hono } from "hono";
import { z } from "zod";
import {
  ALL_LANGUAGES,
  isRuleLanguage,
  languageName,
  type LanguageRuleCountsResponse,
  type LanguageRuleListResponse,
  type LanguageRuleResponse,
} from "@brief/shared";
import { getConfig } from "../config";
import { requireAdmin } from "../http/admin";
import { requireAuth, type AuthEnv } from "../http/auth";
import { AppError } from "../http/errors";
import { parseBody, readJson } from "../http/validate";
import { getRole } from "../services/account/repository";
import {
  countRulesByLanguage,
  createRule,
  deleteRule,
  languageRuleStats,
  listRules,
  updateRule,
  type RuleViewer,
} from "../services/rules/repository";

/**
 * Правила для мов.
 *
 * Читання й створення відкриті всім, хто ввійшов: користувач має бачити,
 * за якими вимогами генерується його ТЗ, і мати змогу запропонувати нову.
 * Правка, вмикання й видалення — за requireAdmin: текст правила дописується
 * у промпт до моделі, тому пускати туди неперевірений рядок не можна.
 */

/**
 * Межа в 500 символів — та сама, що в схемі бази. Правило на пів сторінки
 * витіснило б із промпта самі дані конкурентів.
 */
const ruleTextSchema = z
  .string()
  .trim()
  .min(3, "правило надто коротке")
  .max(500, "правило задовге — максимум 500 символів");

/** Код ISO 639-1 або "*" — правило для всіх мов. */
const languageCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isRuleLanguage, "невідомий код мови");

const createSchema = z.object({
  languageCode: languageCodeSchema,
  rule: ruleTextSchema,
});

const updateSchema = z
  .object({
    rule: ruleTextSchema.optional(),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    enabled: z.boolean().optional(),
    reviewNote: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "нема чого змінювати",
  });

const querySchema = z.object({
  language: languageCodeSchema.optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

/** Скільки правил одна мова може мати — щоб промпт лишався промптом. */
const MAX_RULES_PER_LANGUAGE = 40;

/** Підпис області дії для тексту помилок. */
function scopeLabel(code: string): string {
  return code === ALL_LANGUAGES ? "всіх мов" : `мови ${languageName(code)}`;
}

export const ruleRoutes = new Hono<AuthEnv>();

ruleRoutes.use("*", requireAuth);

async function viewer(userId: string): Promise<RuleViewer> {
  return { id: userId, role: await getRole(getConfig(), userId) };
}

/**
 * Реєструється до "/:id", інакше Hono прийме "languages" за ідентифікатор.
 * По скільку правил у кожної мови — щоб у списку вибору було видно,
 * де вони вже є.
 */
ruleRoutes.get("/languages", async (c) => {
  const config = getConfig();
  const counts = await countRulesByLanguage(config, await viewer(c.get("user").id));

  const body: LanguageRuleCountsResponse = { counts };
  return c.json(body);
});

/**
 * GET /api/rules — правила однієї мови (?language=it) або зрізом за статусом
 * (?status=pending — черга розгляду в адміна). Без параметрів — усе видиме.
 */
ruleRoutes.get("/", async (c) => {
  const config = getConfig();

  // `|| undefined`, а не сам query(): порожній «?language=» має читатися як
  // «параметра немає», а не як невідомий код мови.
  const query = parseBody(querySchema, {
    language: c.req.query("language") || undefined,
    status: c.req.query("status") || undefined,
  });

  const rules = await listRules(config, await viewer(c.get("user").id), {
    languageCode: query.language,
    status: query.status,
  });

  const body: LanguageRuleListResponse = { rules };
  return c.json(body);
});

/**
 * POST /api/rules — пропозиція від користувача або одразу чинне правило
 * від адміна. Тіло однакове: що вийде, вирішує роль.
 */
ruleRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(createSchema, await readJson(c.req.raw));
  const author = await viewer(c.get("user").id);

  // Дублі й межу перевіряємо до вставки: те саме правило, подане вдруге,
  // дає адміну ще один рядок у черзі й нічого більше.
  const stats = await languageRuleStats(config, body.languageCode, body.rule);

  if (stats.duplicate) {
    throw new AppError(
      "rule_duplicate",
      `Таке правило для ${scopeLabel(body.languageCode)} вже є.`,
      409,
    );
  }

  if (stats.approved >= MAX_RULES_PER_LANGUAGE) {
    throw new AppError(
      "rule_limit",
      `Для ${scopeLabel(body.languageCode)} вже ${MAX_RULES_PER_LANGUAGE} правил. ` +
        "Приберіть зайві — довший перелік витісняє з промпта дані конкурентів.",
      422,
    );
  }

  const rule = await createRule(config, author, {
    languageCode: body.languageCode,
    rule: body.rule,
  });

  const response: LanguageRuleResponse = { rule };
  return c.json(response, 201);
});

/** PATCH /api/rules/:id — розгляд пропозиції, правка тексту, вмикання. */
ruleRoutes.patch("/:id", requireAdmin, async (c) => {
  const config = getConfig();
  const body = parseBody(updateSchema, await readJson(c.req.raw));
  const user = c.get("user");

  const rule = await updateRule(
    config,
    { id: user.id, role: "admin" },
    c.req.param("id"),
    body,
  );

  const response: LanguageRuleResponse = { rule };
  return c.json(response);
});

ruleRoutes.delete("/:id", requireAdmin, async (c) => {
  await deleteRule(getConfig(), c.req.param("id"));
  return c.body(null, 204);
});
