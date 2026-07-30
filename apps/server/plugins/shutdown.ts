import type { NitroApp } from "nitropack/types";
import { closeBrowser } from "../src/services/fetcher/browser";
import { closeProxy } from "../src/services/fetcher/proxy";

/**
 * Браузер і пул тунелів до проксі живуть одним екземпляром на весь процес,
 * тому їх треба закрити явно — інакше після кожного перезапуску dev-сервера
 * в системі лишається висіти процес Chrome, а відкриті з'єднання не дають
 * процесу завершитися.
 */
export default function shutdownPlugin(nitroApp: NitroApp): void {
  nitroApp.hooks.hook("close", async () => {
    await closeBrowser();
    await closeProxy();
  });
}
