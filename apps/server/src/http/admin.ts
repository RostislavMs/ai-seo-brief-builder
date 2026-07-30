import type { MiddlewareHandler } from "hono";
import { getConfig } from "../config";
import { getRole } from "../services/account/repository";
import type { AuthEnv } from "./auth";
import { AppError } from "./errors";

/**
 * Перевірка ролі — окремим middleware, а не всередині requireAuth.
 *
 * Роль лежить у базі, і читати її на кожен запит до /api/analyze чи
 * /api/sessions означало б додати їм зайвий похід у Postgres. Тому
 * requireAuth лишається без неї, а роль запитується там, де справді
 * потрібна, — на маршрутах правил для мов.
 *
 * У контекст роль не кладемо: маршрут за цим middleware і так знає, що
 * викликач — адмін, а обробникам зі змінною поведінкою (списки правил)
 * потрібна роль будь-якого користувача, і вони беруть її самі.
 */
export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const role = await getRole(getConfig(), c.get("user").id);

  if (role !== "admin") {
    // 403, а не 404: інтерфейс показує адмінські кнопки лише адміну, тож
    // сюди доходить той, хто пішов в API повз інтерфейс. Ховати від нього
    // існування маршруту нема потреби.
    throw new AppError("forbidden", "Дія доступна лише адміністратору.", 403);
  }

  await next();
};
