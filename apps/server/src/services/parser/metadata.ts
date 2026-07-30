import type { CheerioAPI } from "cheerio";
import type { PageMeta } from "@brief/shared";
import type { AcquiredPage } from "../fetcher/acquire";
import { normalizeText } from "./text";

/**
 * Шукає <meta> за name або property без урахування регістру.
 * Селектори cheerio чутливі до регістру значень, а в реальному HTML
 * трапляється і `Description`, і `og:Title`.
 */
function metaContent($: CheerioAPI, wanted: string[]): string | null {
  const targets = new Set(wanted.map((name) => name.toLowerCase()));
  let found: string | null = null;

  $("meta").each((_, el) => {
    if (found) return false;

    const attribs = el.attribs ?? {};
    const key = (attribs["name"] ?? attribs["property"] ?? "").toLowerCase();
    if (!targets.has(key)) return;

    const content = normalizeText(attribs["content"] ?? "");
    if (content) found = content;
    return;
  });

  return found;
}

/** Робить URL абсолютним відносно сторінки; невалідні значення відкидає. */
function absoluteUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed, base).href;
  } catch {
    return null;
  }
}

/**
 * Витягує метадані сторінки (розділ 6 ТЗ).
 * Викликати ДО cleanDocument: очищення видаляє частину службової розмітки.
 */
export function extractMeta($: CheerioAPI, fetched: AcquiredPage): PageMeta {
  const title =
    normalizeText($("head title").first().text()) ||
    metaContent($, ["og:title", "twitter:title"]) ||
    null;

  const description = metaContent($, [
    "description",
    "og:description",
    "twitter:description",
  ]);

  const canonicalHref = $("link[rel='canonical']").first().attr("href");
  const canonical = canonicalHref
    ? absoluteUrl(canonicalHref, fetched.finalUrl)
    : null;

  const lang = normalizeText($("html").attr("lang") ?? "") || null;

  return {
    url: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    title,
    description,
    canonical,
    lang,
    source: fetched.source,
    archivedAt: fetched.archivedAt,
  };
}
