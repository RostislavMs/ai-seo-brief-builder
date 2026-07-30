import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

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
