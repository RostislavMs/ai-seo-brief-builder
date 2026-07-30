import type { NitroApp } from "nitropack/types";
import { closeBrowser } from "../src/services/fetcher/browser";

/**
 * Браузер живе одним екземпляром на весь процес, тому його треба закрити
 * явно — інакше після кожного перезапуску dev-сервера в системі
 * лишається висіти процес Chrome.
 */
export default function shutdownPlugin(nitroApp: NitroApp): void {
  nitroApp.hooks.hook("close", async () => {
    await closeBrowser();
  });
}
