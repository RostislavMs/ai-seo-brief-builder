import {
  defineEventHandler,
  getRequestURL,
  getRequestWebStream,
  type H3Event,
} from "h3";
import { app } from "../../src/app";

/**
 * Точка зшивання Nitro та Hono: усе, що приходить на /api/**,
 * передається у Hono як стандартний Web Request.
 *
 * Request складається вручну, а не через toWebRequest() із h3: той не
 * проставляє signal, і Hono отримував запит, скасувати який неможливо. А
 * скасувати потрібно: генерація ТЗ триває хвилини, і коли користувач тисне
 * «Скасувати» або йде зі сторінки, єдиний спосіб не платити за решту
 * відповіді — обірвати з'єднання з моделлю. Сигнал звідси доходить до SDK
 * провайдера через providerForUser().
 */
export default defineEventHandler(async (event) => {
  // На веб-пресетах платформа віддає готовий Request зі власним signal —
  // він точніший за наш, бо про розрив знає сама.
  const web = event.web?.request;
  if (web) return app.fetch(web);

  const aborted = new AbortController();

  /**
   * "close" на відповіді, а не "aborted" на запиті: другий у Node вважається
   * застарілим. Спрацьовує в обох випадках — і коли клієнт пішов, і коли
   * відповідь дописано; другий відрізняємо по writableEnded, інакше обривали
   * б уже завершений запит.
   */
  const onClose = (): void => {
    if (!event.node.res.writableEnded) aborted.abort();
  };

  event.node.res.on("close", onClose);

  try {
    return await app.fetch(toWebRequest(event, aborted.signal));
  } finally {
    event.node.res.off("close", onClose);
  }
});

function toWebRequest(event: H3Event, signal: AbortSignal): Request {
  return new Request(getRequestURL(event), {
    method: event.method,
    headers: event.headers,
    // Для GET і HEAD h3 віддає undefined — тіла в них немає.
    body: getRequestWebStream(event),
    // Тіло приходить потоком, і без duplex undici відмовляється його надсилати.
    // У типах RequestInit цього поля немає, звідси приведення.
    duplex: "half",
    signal,
  } as RequestInit);
}
