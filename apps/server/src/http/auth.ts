import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getConfig, type AppConfig } from "../config";
import { AppError } from "./errors";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Перевірка токена Supabase.
 *
 * Основний шлях — локальна перевірка підпису за JWKS проєкту: жодного
 * мережевого запиту на кожен виклик API. Запасний — звернення до
 * /auth/v1/user, бо старі проєкти Supabase підписують токени симетричним
 * HS256, і JWKS у них порожній.
 */

export interface AuthUser {
  id: string;
  email: string;
}

/** Тип оточення Hono: після requireAuth у контексті гарантовано є user. */
export type AuthEnv = {
  Variables: {
    user: AuthUser;
  };
};

type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

// createRemoteJWKSet сам кешує ключі й ходить за ними лише при зміні kid,
// але лише в межах свого екземпляра — тому екземпляр має бути один.
let jwksCache: { url: string; resolver: JwksResolver } | null = null;

function jwks(url: string): JwksResolver {
  if (jwksCache?.url === url) return jwksCache.resolver;

  const resolver = createRemoteJWKSet(new URL(url));
  jwksCache = { url, resolver };
  return resolver;
}

function bearerToken(header: string | undefined): string {
  const value = header?.trim() ?? "";

  if (!value.toLowerCase().startsWith("bearer ")) {
    throw new AppError(
      "unauthorized",
      "Потрібен вхід в акаунт.",
      401,
    );
  }

  const token = value.slice(7).trim();

  if (!token) {
    throw new AppError("unauthorized", "Потрібен вхід в акаунт.", 401);
  }

  return token;
}

async function verifyLocally(
  token: string,
  config: AppConfig,
): Promise<AuthUser | null> {
  if (!config.supabaseJwksUrl) return null;

  try {
    const { payload } = await jwtVerify(token, jwks(config.supabaseJwksUrl), {
      issuer: `${config.supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });

    const id = typeof payload.sub === "string" ? payload.sub : "";
    if (!id) return null;

    return {
      id,
      email: typeof payload["email"] === "string" ? payload["email"] : "",
    };
  } catch (error) {
    // Порожній JWKS (симетричний підпис) — не помилка користувача,
    // а привід спитати Supabase напряму. Інші причини теж варто
    // перевірити другим шляхом: він точний і поверне однозначне «ні».
    console.warn(
      "[auth] локальна перевірка не вдалася, запитую Supabase:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function verifyRemotely(
  token: string,
  config: AppConfig,
): Promise<AuthUser> {
  const { data, error } = await supabaseAdmin(config).auth.getUser(token);

  if (error || !data.user) {
    throw new AppError(
      "unauthorized",
      "Сесія недійсна або застаріла. Увійдіть знову.",
      401,
    );
  }

  return { id: data.user.id, email: data.user.email ?? "" };
}

/** Пропускає далі лише запити з дійсним токеном Supabase. */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const config = getConfig();

  if (!config.supabaseUrl) {
    // Nitro читає .env один раз при старті процесу, тому найчастіша причина —
    // не відсутній рядок, а сервер, запущений до того, як його дописали.
    throw new AppError(
      "auth_not_configured",
      "Сервер не бачить NITRO_SUPABASE_URL. Якщо рядок є в apps/server/.env — " +
        "перезапустіть pnpm dev: змінні оточення читаються лише при старті.",
      503,
    );
  }

  const token = bearerToken(c.req.header("Authorization"));
  const user =
    (await verifyLocally(token, config)) ?? (await verifyRemotely(token, config));

  c.set("user", user);
  await next();
};
