import { defineEventHandler, setResponseHeader, setResponseStatus } from "h3";
import { useStorage } from "nitropack/runtime";
import { toApiError } from "../src/http/errors";

/**
 * Оболонка SPA для всього, що не `/api/**` і не знайдено серед статики.
 *
 * React Router тримає адреси на кшталт `/sessions/:id`, і файлу за такою
 * адресою не існує. Перехід усередині застосунку працює й без цього маршруту,
 * а от перезавантаження сторінки або посилання, надіслане колезі, — ні:
 * запит доходить до сервера, а сервер про такий шлях нічого не знає.
 *
 * Радікс-роутер Nitro віддає перевагу вужчому шляху, тому `/api/**`
 * (routes/api/[...].ts) цей обробник не перехоплює.
 */
export default defineEventHandler(async (event) => {
  // Не GET на невідомий шлях — це не навігація, і оболонка тут була б
  // брехнею: клієнт отримав би 200 на POST, якого ніхто не обробив.
  if (event.method !== "GET" && event.method !== "HEAD") {
    setResponseStatus(event, 404);
    return toApiError("not_found", `Маршрут ${event.path} не існує`);
  }

  const html = await useStorage("assets:spa").getItem<string>("index.html");

  if (typeof html !== "string") {
    setResponseStatus(event, 503);
    setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
    return "Фронтенд не зібрано. Виконайте `pnpm build` — Nitro роздає apps/web/dist.";
  }

  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  // Оболонка посилається на бандли з хешем у назві, тому кешувати її не можна:
  // після деплою старий index.html просив би вже видалені файли.
  setResponseHeader(event, "cache-control", "no-cache");

  return html;
});
