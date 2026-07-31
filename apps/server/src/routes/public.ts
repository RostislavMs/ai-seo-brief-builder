import { Hono } from "hono";
import type { PublicShareResponse } from "@brief/shared";
import { getConfig } from "../config";
import { readPublicShare } from "../services/shares/repository";

/**
 * Маршрути без входу.
 *
 * Єдиний роутер застосунку, у якому немає requireAuth, — і саме тому він один
 * і окремий: у решті захист підключається всередині роутера, тож додати
 * маршрут і забути про нього неможливо. Тут навпаки — сам факт, що обробник
 * лежить у цьому файлі, означає «доступно всім», тому нового сюда додавати не
 * варто без такої самої причини.
 *
 * Що саме віддається: замерзлий зліпок сесії за токеном. Ні id сесії, ні
 * автора, ні чату в ньому немає за побудовою (див. services/shares/snapshot.ts),
 * а сам токен — 22 випадкові символи, тому перебором список опублікованого
 * не дістати.
 */
export const publicRoutes = new Hono();

publicRoutes.get("/shares/:token", async (c) => {
  const share = await readPublicShare(getConfig(), c.req.param("token"));

  const body: PublicShareResponse = { share };
  return c.json(body);
});
