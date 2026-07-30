import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

/**
 * ⚠️ jsdom тримається на 26.x навмисно — не оновлювати без перевірки на Vercel.
 *
 * З 27-ї версії jsdom залежить від @exodus/bytes, а це чистий ESM, до якого
 * CommonJS-пакети (html-encoding-sniffer, whatwg-url) звертаються через
 * require(). Node таке дозволяє з 22.12, а завантажувач модулів Vercel — ні:
 * кожен запит до API падав з ERR_REQUIRE_ESM ще до входу в маршрут, бо jsdom
 * вантажиться разом з усім API одним чанком. Вмирав навіть /api/health.
 *
 * Забандлити цю межу замість зовнішніх модулів не вийшло: інлайн jsdom тягне
 * за собою інлайн усього дерева, а на ньому ламається вже interop інших
 * CommonJS-пакетів (`util.inherits` у jws із ланцюжка @google/genai).
 *
 * Перевірити перед підняттям версії: зібрати з `NITRO_PRESET=vercel` і
 * запустити функцію з прапорцем `node --no-experimental-require-module` —
 * він відтворює поведінку завантажувача Vercel локально.
 */

export interface MainContent {
  /** HTML лише основного контенту — далі з нього дістається структура. */
  contentHtml: string;
  textContent: string;
  /** Заголовок статті за версією Readability. */
  title: string | null;
}

/**
 * Виділяє основний контент сторінки алгоритмом Firefox Reader View.
 * Повертає null, якщо Readability не впізнав статтю, — тоді викликач
 * переходить на резервний шлях через селектори (`findContentScope`).
 */
export function extractMainContent(html: string, url: string): MainContent | null {
  // Сторонні сторінки сиплять помилками CSS і JS. Без глушника
  // virtualConsole перекидає їх у наш stderr.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});

  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url, virtualConsole });
  } catch {
    return null;
  }

  try {
    const reader = new Readability(dom.window.document, {
      // Дефолтні 500 символів відсікають короткі, але валідні сторінки.
      charThreshold: 200,
      keepClasses: false,
    });

    const article = reader.parse();
    if (!article?.content) return null;

    return {
      contentHtml: article.content,
      textContent: article.textContent ?? "",
      title: article.title ?? null,
    };
  } catch {
    return null;
  } finally {
    dom.window.close();
  }
}
