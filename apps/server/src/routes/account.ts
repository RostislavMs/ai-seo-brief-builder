import { Hono } from "hono";
import { z } from "zod";
import {
  DEFAULT_MODEL,
  FETCH_SERVICE_IDS,
  FETCH_SERVICE_KEY_PREFIX,
  FETCH_SERVICE_LABEL,
  PROVIDER_KEY_PREFIX,
  PROVIDER_LABEL,
  mergeModels,
  type AiKeySummary,
  type AiProviderId,
  type FetchKeyStatus,
  type FetchKeySummary,
  type FetchServiceId,
  type MeResponse,
  type ModelsResponse,
  type UserProfile,
  type UserSettings,
} from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { AppError } from "../http/errors";
import { parseBody, readJson } from "../http/validate";
import { describeEffectiveProvider } from "../services/ai";
import { listModels } from "../services/ai/models";
import {
  deleteFetchKey,
  deleteKey,
  getDecryptedFetchKey,
  getDecryptedKey,
  getProfile,
  getSettings,
  listFetchKeys,
  listKeys,
  saveFetchKey,
  saveKey,
  updateKeyModel,
  updateProfile,
  updateSettings,
} from "../services/account/repository";
import {
  fetchFirecrawlCredits,
  type FirecrawlCredits,
} from "../services/fetcher/firecrawl";
import { countPendingRules } from "../services/rules/repository";

const providerSchema = z.enum(["gemini", "openai", "anthropic"]);
const fetchServiceSchema = z.enum(["firecrawl"]);
const modelSchema = z.string().trim().min(1, "не обрано модель").max(120);

const saveKeySchema = z.object({
  apiKey: z.string().trim().min(20, "ключ надто короткий"),
  model: modelSchema,
});

const updateKeySchema = z.object({ model: modelSchema });

const previewSchema = z.object({
  apiKey: z.string().trim().min(20, "ключ надто короткий"),
});

const saveFetchKeySchema = z.object({
  apiKey: z.string().trim().min(20, "ключ надто короткий"),
});

const settingsSchema = z.object({
  activeProvider: providerSchema.nullable().optional(),
});

const profileSchema = z.object({
  displayName: z.string().trim().max(80).nullable(),
});

/** Ранній відсів явно чужого ключа — до того, як він піде в мережу. */
function assertKeyShape(provider: AiProviderId, apiKey: string): void {
  const prefix = PROVIDER_KEY_PREFIX[provider];

  if (prefix && !apiKey.startsWith(prefix)) {
    throw new AppError(
      "key_format_invalid",
      `Ключ ${PROVIDER_LABEL[provider]} має починатися з «${prefix}». ` +
        "Схоже, скопійовано ключ іншого сервісу.",
      422,
    );
  }
}

function providerParam(value: string): AiProviderId {
  const parsed = providerSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError(
      "unknown_provider",
      `Невідомий провайдер: ${value}. Доступні: gemini, openai, anthropic.`,
      404,
    );
  }

  return parsed.data;
}

/** Той самий ранній відсів, що для AI: префікс ключа перед виходом у мережу. */
function assertFetchKeyShape(service: FetchServiceId, apiKey: string): void {
  const prefix = FETCH_SERVICE_KEY_PREFIX[service];

  if (prefix && !apiKey.startsWith(prefix)) {
    throw new AppError(
      "key_format_invalid",
      `Ключ ${FETCH_SERVICE_LABEL[service]} має починатися з «${prefix}». ` +
        "Схоже, скопійовано ключ іншого сервісу.",
      422,
    );
  }
}

function fetchServiceParam(value: string): FetchServiceId {
  const parsed = fetchServiceSchema.safeParse(value);

  if (!parsed.success) {
    throw new AppError(
      "unknown_fetch_service",
      `Невідомий сервіс доступу: ${value}. Доступні: ${FETCH_SERVICE_IDS.join(", ")}.`,
      404,
    );
  }

  return parsed.data;
}

/* ── /api/me ─────────────────────────────────────────────────────────────── */

export const meRoutes = new Hono<AuthEnv>();

meRoutes.use("*", requireAuth);

meRoutes.get("/", async (c) => {
  const config = getConfig();
  const user = c.get("user");

  // Незалежні читання — паралельно: послідовно вони дали б помітну паузу
  // на першому екрані після входу.
  //
  // Ключі сервісів доступу читаються тут само, і навмисно без залишку кредитів:
  // за ним стоїть запит до чужого API, а /api/me читається на кожному екрані.
  // Кредити тягне лише сторінка налаштувань — окремим маршрутом.
  const [profile, keys, fetchKeys, settings, effective] = await Promise.all([
    getProfile(config, user),
    listKeys(config, user.id),
    listFetchKeys(config, user.id),
    getSettings(config, user.id),
    describeEffectiveProvider(config, user.id),
  ]);

  // Після профілю, а не разом із ним: скільки пропозицій показати в бейджі,
  // залежить від ролі — адмін бачить усі, решта лише власні.
  const pendingRules = await countPendingRules(config, {
    id: user.id,
    role: profile.role,
  });

  const body: MeResponse = {
    profile,
    keys,
    fetchKeys,
    settings,
    effective,
    pendingRules,
  };

  return c.json(body);
});

meRoutes.patch("/", async (c) => {
  const config = getConfig();
  const body = parseBody(profileSchema, await readJson(c.req.raw));

  const profile: UserProfile = await updateProfile(
    config,
    c.get("user"),
    body.displayName?.trim() || null,
  );

  return c.json({ profile });
});

/* ── /api/keys ───────────────────────────────────────────────────────────── */

export const keyRoutes = new Hono<AuthEnv>();

keyRoutes.use("*", requireAuth);

keyRoutes.get("/", async (c) => {
  const keys = await listKeys(getConfig(), c.get("user").id);
  return c.json({ keys });
});

keyRoutes.put("/:provider", async (c) => {
  const config = getConfig();
  const user = c.get("user");
  const provider = providerParam(c.req.param("provider"));
  const body = parseBody(saveKeySchema, await readJson(c.req.raw));

  assertKeyShape(provider, body.apiKey);

  // Ключ перевіряється живим запитом до провайдера. Інакше про помилку
  // користувач дізнався б лише після хвилини очікування першого ТЗ.
  const available = await listModels(provider, body.apiKey);

  if (!available.includes(body.model)) {
    throw new AppError(
      "model_unavailable",
      `Модель ${body.model} недоступна за цим ключем. ` +
        `Доступні, зокрема: ${available.slice(0, 5).join(", ")}.`,
      422,
    );
  }

  const key: AiKeySummary = await saveKey(
    config,
    user.id,
    provider,
    body.apiKey,
    body.model,
  );

  // Перший доданий ключ одразу стає активним: додати ключ і не побачити
  // жодних змін — найгірший можливий результат цієї дії.
  const settings = await getSettings(config, user.id);
  if (!settings.activeProvider) {
    await updateSettings(config, user.id, { activeProvider: provider });
  }

  return c.json({ key });
});

keyRoutes.patch("/:provider", async (c) => {
  const config = getConfig();
  const user = c.get("user");
  const provider = providerParam(c.req.param("provider"));
  const body = parseBody(updateKeySchema, await readJson(c.req.raw));

  const existing = await getDecryptedKey(config, user.id, provider);

  if (!existing) {
    throw new AppError(
      "key_not_found",
      `Ключ ${PROVIDER_LABEL[provider]} не додано.`,
      404,
    );
  }

  const available = await listModels(provider, existing.apiKey);

  if (!available.includes(body.model)) {
    throw new AppError(
      "model_unavailable",
      `Модель ${body.model} недоступна за цим ключем.`,
      422,
    );
  }

  await updateKeyModel(config, user.id, provider, body.model);

  const keys = await listKeys(config, user.id);
  return c.json({ keys });
});

keyRoutes.delete("/:provider", async (c) => {
  const config = getConfig();
  const user = c.get("user");
  const provider = providerParam(c.req.param("provider"));

  await deleteKey(config, user.id, provider);

  // Активний провайдер без ключа зламав би генерацію ТЗ мовчки,
  // тому разом із ключем знімаємо й вибір.
  const settings = await getSettings(config, user.id);
  if (settings.activeProvider === provider) {
    await updateSettings(config, user.id, { activeProvider: null });
  }

  return c.body(null, 204);
});

/* ── /api/fetch-keys ─────────────────────────────────────────────────────── */

/** Чужий API опитується лише для перевірки — терпіння коротке. */
const CREDITS_TIMEOUT_MS = 10_000;

/**
 * Чим перевіряти ключ кожного сервісу. Вичерпний запис, а не виклик навпростець:
 * коли у FetchServiceId додасться друге значення, TypeScript зажадає й читача
 * для нього — інакше новий сервіс мовчки перевірявся б чужим API.
 *
 * Повертає лічильники в спільному вигляді; сервіс, у якого немає кредитів як
 * поняття, віддасть тут null-и, і це нормально — перевіркою є сам факт, що
 * запит пройшов.
 */
const CREDIT_READERS: Record<
  FetchServiceId,
  (apiKey: string, timeoutMs: number) => Promise<FirecrawlCredits>
> = {
  firecrawl: fetchFirecrawlCredits,
};

export const fetchKeyRoutes = new Hono<AuthEnv>();

fetchKeyRoutes.use("*", requireAuth);

/**
 * Ключі платних сервісів доступу до сторінок.
 *
 * Окремий роутер, а не /api/keys: там кожен ключ обов'язково має модель і один
 * із провайдерів обирається активним, а тут ні моделі, ні вибору немає — ключі
 * діють одночасно, кожен на своїй ступені каскаду. Спроба зліпити їх в одному
 * маршруті дала б купу полів, які для половини значень не мають сенсу.
 */
fetchKeyRoutes.get("/", async (c) => {
  const keys = await listFetchKeys(getConfig(), c.get("user").id);
  return c.json({ keys });
});

/** Стан рахунку за збереженим ключем. Живий запит, тому окремо від /api/me. */
fetchKeyRoutes.get("/:service/status", async (c) => {
  const config = getConfig();
  const service = fetchServiceParam(c.req.param("service"));
  const apiKey = await getDecryptedFetchKey(config, c.get("user").id, service);

  if (!apiKey) {
    throw new AppError(
      "key_not_found",
      `Ключ ${FETCH_SERVICE_LABEL[service]} не додано.`,
      404,
    );
  }

  return c.json(await creditsStatus(service, apiKey));
});

fetchKeyRoutes.put("/:service", async (c) => {
  const config = getConfig();
  const user = c.get("user");
  const service = fetchServiceParam(c.req.param("service"));
  const body = parseBody(saveFetchKeySchema, await readJson(c.req.raw));

  assertFetchKeyShape(service, body.apiKey);

  // Ключ перевіряється живим запитом — так само, як AI-ключ звіркою переліку
  // моделей. Інакше про неробочий ключ користувач дізнався б аж із переліку
  // спроб каскаду, де рядок про Firecrawl легко прийняти за проблему сайту.
  //
  // Саме запит про кредити, а не пробний scrape: він безкоштовний, тому
  // перевірка ключа не коштує користувачеві нічого.
  const credits = await CREDIT_READERS[service](
    body.apiKey,
    CREDITS_TIMEOUT_MS,
  ).catch((error: unknown) => {
    throw new AppError(
      "fetch_key_rejected",
      error instanceof Error
        ? error.message
        : `Не вдалося перевірити ключ ${FETCH_SERVICE_LABEL[service]}.`,
      422,
    );
  });

  const key: FetchKeySummary = await saveFetchKey(
    config,
    user.id,
    service,
    body.apiKey,
  );

  return c.json({
    key,
    status: {
      service,
      remainingCredits: credits.remainingCredits,
      planCredits: credits.planCredits,
      periodEnd: credits.periodEnd,
      live: true,
      warning: null,
    } satisfies FetchKeyStatus,
  });
});

fetchKeyRoutes.delete("/:service", async (c) => {
  const service = fetchServiceParam(c.req.param("service"));

  await deleteFetchKey(getConfig(), c.get("user").id, service);

  // Нічого більше знімати не треба: активного вибору серед цих сервісів немає,
  // а каскад без ключа просто не виконує відповідну ступінь.
  return c.body(null, 204);
});

/**
 * Кредити з живого запиту. Помилка сервісу не 500: ключ збережений і робочий
 * учора може не відповісти сьогодні, а сторінка налаштувань має показати
 * причину, а не порожній екран.
 */
async function creditsStatus(
  service: FetchServiceId,
  apiKey: string,
): Promise<FetchKeyStatus> {
  try {
    const credits = await CREDIT_READERS[service](apiKey, CREDITS_TIMEOUT_MS);

    return {
      service,
      remainingCredits: credits.remainingCredits,
      planCredits: credits.planCredits,
      periodEnd: credits.periodEnd,
      live: true,
      warning: null,
    };
  } catch (error) {
    return {
      service,
      remainingCredits: null,
      planCredits: null,
      periodEnd: null,
      live: false,
      warning:
        error instanceof Error
          ? error.message
          : `Не вдалося звірити рахунок ${FETCH_SERVICE_LABEL[service]}.`,
    };
  }
}

/* ── /api/settings ───────────────────────────────────────────────────────── */

export const settingsRoutes = new Hono<AuthEnv>();

settingsRoutes.use("*", requireAuth);

settingsRoutes.patch("/", async (c) => {
  const config = getConfig();
  const user = c.get("user");
  const body = parseBody(settingsSchema, await readJson(c.req.raw));

  if (body.activeProvider) {
    const key = await getDecryptedKey(config, user.id, body.activeProvider);

    if (!key) {
      throw new AppError(
        "key_not_found",
        `Спершу додайте ключ ${PROVIDER_LABEL[body.activeProvider]}.`,
        422,
      );
    }
  }

  const patch: Partial<UserSettings> = {};
  if (body.activeProvider !== undefined) patch.activeProvider = body.activeProvider;

  const settings = await updateSettings(config, user.id, patch);
  const effective = await describeEffectiveProvider(config, user.id);

  return c.json({ settings, effective });
});

/* ── /api/models ─────────────────────────────────────────────────────────── */

export const modelRoutes = new Hono<AuthEnv>();

modelRoutes.use("*", requireAuth);

/**
 * Перелік для провайдера, ключ якого вже збережено.
 * Без ключа віддаємо самий каталог — щоб поле вибору не було порожнім
 * і було видно, що взагалі буває.
 */
modelRoutes.get("/:provider", async (c) => {
  const config = getConfig();
  const provider = providerParam(c.req.param("provider"));
  const key = await getDecryptedKey(config, c.get("user").id, provider);

  if (!key) {
    const body: ModelsResponse = {
      provider,
      models: mergeModels(provider, null),
      recommended: DEFAULT_MODEL[provider],
      live: false,
      warning: null,
    };
    return c.json(body);
  }

  return c.json(await withLiveModels(provider, key.apiKey));
});

/**
 * Перелік за щойно введеним, ще не збереженим ключем.
 * POST, а не GET із параметром: ключ у рядку запиту потрапляє в логи
 * проксі та в історію браузера.
 */
modelRoutes.post("/:provider/preview", async (c) => {
  const provider = providerParam(c.req.param("provider"));
  const body = parseBody(previewSchema, await readJson(c.req.raw));

  assertKeyShape(provider, body.apiKey);

  return c.json(await withLiveModels(provider, body.apiKey));
});

async function withLiveModels(
  provider: AiProviderId,
  apiKey: string,
): Promise<ModelsResponse> {
  try {
    const live = await listModels(provider, apiKey);
    const models = mergeModels(provider, live);
    const preferred = DEFAULT_MODEL[provider];

    return {
      provider,
      models,
      // Рекомендованої моделі може не бути за цим ключем — тоді
      // підставляємо першу доступну, а не неробочий ідентифікатор.
      recommended: live.includes(preferred)
        ? preferred
        : (models.find((model) => model.available)?.id ?? preferred),
      live: true,
      warning: null,
    };
  } catch (error) {
    // Помилка переліку не має ховати сам список: користувач усе одно
    // побачить каталог і причину, чому доступність не перевірено.
    return {
      provider,
      models: mergeModels(provider, null),
      recommended: DEFAULT_MODEL[provider],
      live: false,
      warning:
        error instanceof AppError
          ? error.message
          : "Не вдалося звірити список моделей із провайдером.",
    };
  }
}
