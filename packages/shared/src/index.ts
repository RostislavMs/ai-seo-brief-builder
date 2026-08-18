export type * from "./types/page";
export type * from "./types/brief";
export type * from "./types/comparison";
export type * from "./types/session";
export type * from "./types/share";
export type * from "./types/api";
export type * from "./types/account";
export type * from "./types/rules";
export type * from "./types/prompts";

export type {
  WriterRequirement,
  WriterRequirementGroup,
} from "./brief/requirements";
export {
  DEFAULT_REQUIREMENTS,
  WRITER_REQUIREMENTS,
  parseRequirements,
  requirementsProblem,
} from "./brief/requirements";

export { isUsable, readyCount, usablePages } from "./utils/analyses";
export { groupHeadings, outlineToText } from "./utils/headings";
export { formatRange, normalizeRange, sumRanges } from "./utils/range";
export { median } from "./utils/stats";

export type { LanguageEntry } from "./languages/registry";
export {
  LANGUAGES,
  isLanguageCode,
  languageByCode,
  languageCodeByName,
  languageName,
  normalizeLanguageTag,
} from "./languages/registry";
export { ALL_LANGUAGES, isRuleLanguage } from "./languages/scope";
export type { LanguageDetection, LanguageSource } from "./languages/detect";
export {
  detectContentLanguage,
  resolveContentLanguage,
} from "./languages/detect";

export {
  FETCH_SERVICE_IDS,
  FETCH_SERVICE_KEY_PREFIX,
  FETCH_SERVICE_KEY_URL,
  FETCH_SERVICE_LABEL,
  FETCH_SERVICE_NOTE,
  isFetchServiceId,
} from "./fetch/services";

export type { CatalogEntry } from "./ai/catalog";
export {
  AI_PROVIDER_IDS,
  DEFAULT_MODEL,
  PROVIDER_KEY_PREFIX,
  PROVIDER_KEY_URL,
  PROVIDER_LABEL,
  catalogEntry,
  catalogFor,
  isAiProviderId,
  mergeModels,
} from "./ai/catalog";
