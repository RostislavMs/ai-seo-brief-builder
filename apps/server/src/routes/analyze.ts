import { Hono } from "hono";
import { z } from "zod";
import type { AnalyzeResponse } from "@brief/shared";
import { getConfig } from "../config";
import { requireAuth, type AuthEnv } from "../http/auth";
import { parseBody, readJson } from "../http/validate";
import { getDecryptedFetchKey } from "../services/account/repository";
import { analyzePages } from "../services/analyze/analyzePages";

const analyzeSchema = z.object({
  urls: z
    .array(z.string().trim().min(1, "URL не може бути порожнім"))
    .min(1, "потрібен хоча б один URL"),
});

export const analyzeRoutes = new Hono<AuthEnv>();

// Парсинг ходить у зовнішню мережу з нашого IP — без входу це відкритий
// проксі для будь-кого.
analyzeRoutes.use("*", requireAuth);

analyzeRoutes.post("/", async (c) => {
  const config = getConfig();
  const body = parseBody(analyzeSchema, await readJson(c.req.raw));

  const urls = body.urls.slice(0, config.maxUrlsPerRequest);

  // Ступінь 6 каскаду працює ключем самого користувача, тому читається тут, а
  // не з конфігурації сервера. null — ступінь просто не виконується: це
  // звичайний стан, а не помилка, і решта каскаду від нього не залежить.
  const firecrawlKey = await getDecryptedFetchKey(
    config,
    c.get("user").id,
    "firecrawl",
  );

  const results = await analyzePages(urls, {
    timeoutMs: config.fetchTimeoutMs,
    maxBytes: config.fetchMaxBytes,
    userAgent: config.fetchUserAgent,
    allowPrivateHosts: config.allowPrivateHosts,
    budgetMs: config.fetchBudgetMs,
    browserEnabled: config.browserEnabled,
    browserTimeoutMs: config.browserTimeoutMs,
    browserPath: config.browserPath,
    browserSettleMs: config.browserSettleMs,
    readerEnabled: config.readerEnabled,
    readerTimeoutMs: config.readerTimeoutMs,
    readerKey: config.readerKey,
    proxyUrl: config.proxyUrl,
    proxyTimeoutMs: config.proxyTimeoutMs,
    firecrawlKey: firecrawlKey ?? "",
    firecrawlTimeoutMs: config.firecrawlTimeoutMs,
    scraperUrl: config.scraperUrl,
    scraperKey: config.scraperKey,
    scraperTimeoutMs: config.scraperTimeoutMs,
    archiveEnabled: config.archiveEnabled,
    archiveOnDemandEnabled: config.archiveOnDemandEnabled,
    archiveSaveTimeoutMs: config.archiveSaveTimeoutMs,
  });

  const response: AnalyzeResponse = { results };
  return c.json(response);
});
