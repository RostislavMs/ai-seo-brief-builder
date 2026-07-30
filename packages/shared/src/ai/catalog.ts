import type { AiProviderId, ModelOption } from "../types/account";

/**
 * Каталог моделей: ціни, мітки й короткі пояснення.
 *
 * Каталог — не джерело правди про доступність. Що саме доступне, вирішує
 * ключ користувача, тому інтерфейс завжди показує живий перелік від
 * провайдера, а звідси бере лише ціни й мітки. Модель, якої тут немає,
 * усе одно з'явиться у списку — просто без бейджа й без ціни.
 *
 * Ціни — USD за мільйон токенів, стандартний платний рівень.
 * Там, де ціну не вдалося підтвердити, стоїть null: показати «приблизно»
 * гірше, ніж не показати нічого, — на цифру з інтерфейсу планують бюджет.
 */

export interface CatalogEntry {
  id: string;
  label: string;
  tier: NonNullable<ModelOption["tier"]>;
  inputPrice: number | null;
  outputPrice: number | null;
  contextTokens: number | null;
  note: string;
}

/**
 * Anthropic: перелічені лише моделі з підтримкою structured outputs.
 * Бриф приходить строгим JSON за схемою, і модель без цієї можливості
 * не впорається — краще не пропонувати її взагалі, ніж давати помилку
 * після хвилини очікування.
 */
const ANTHROPIC: CatalogEntry[] = [
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    tier: "recommended",
    inputPrice: 5,
    outputPrice: 25,
    contextTokens: 1_000_000,
    note: "Найсильніший аналіз структури конкурентів. Дефолт для складних тем.",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    tier: "balanced",
    inputPrice: 3,
    outputPrice: 15,
    contextTokens: 1_000_000,
    note: "Майже якість Opus за 60% ціни. Розумний вибір для потокової роботи.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    tier: "budget",
    inputPrice: 1,
    outputPrice: 5,
    contextTokens: 200_000,
    note: "Уп'ятеро дешевша за Opus і найшвидша. Для простих тем і чернеток.",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    tier: "balanced",
    inputPrice: 5,
    outputPrice: 25,
    contextTokens: 1_000_000,
    note: "Попереднє покоління Opus. Ціна та ж — брати, лише якщо звикли до неї.",
  },
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    tier: "premium",
    inputPrice: 10,
    outputPrice: 50,
    contextTokens: 1_000_000,
    note: "Удвічі дорожча за Opus 5. Для ТЗ виграш не окупається.",
  },
];

/**
 * Google Gemini. Ціни підтверджені лише для лінійок 2.0 і 2.5;
 * для 3.x вони змінювалися після виходу, тому лишаються порожніми.
 */
const GEMINI: CatalogEntry[] = [
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    tier: "recommended",
    inputPrice: null,
    outputPrice: null,
    contextTokens: 1_000_000,
    note: "Заміряно на цьому проєкті: ТЗ за ~20 с проти ~43 с у 2.5 Pro за схожої якості.",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    tier: "balanced",
    inputPrice: null,
    outputPrice: null,
    contextTokens: 1_000_000,
    note: "Попереднє покоління Flash. Бере, якщо 3.6 недоступна за ключем.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro (preview)",
    tier: "premium",
    inputPrice: null,
    outputPrice: null,
    contextTokens: 1_000_000,
    note: "Найглибший аналіз серед Gemini, але помітно повільніший за Flash.",
  },
  {
    id: "gemini-3-pro-preview",
    label: "Gemini 3 Pro (preview)",
    tier: "premium",
    inputPrice: null,
    outputPrice: null,
    contextTokens: 1_000_000,
    note: "Pro-лінійка попереднього покоління.",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    tier: "budget",
    inputPrice: null,
    outputPrice: null,
    contextTokens: 1_000_000,
    note: "Найдешевша з 3.x. Для коротких тем із двома-трьома конкурентами.",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tier: "balanced",
    inputPrice: 1.25,
    outputPrice: 10,
    contextTokens: 1_000_000,
    note: "Ціна зростає до $2.50/$15 на промптах понад 200K токенів.",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "budget",
    inputPrice: 0.3,
    outputPrice: 2.5,
    contextTokens: 1_000_000,
    note: "Уперше вчетверо дешевша за 2.5 Pro на вході й вчетверо на виході.",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    tier: "budget",
    inputPrice: 0.1,
    outputPrice: 0.4,
    contextTokens: 1_000_000,
    note: "Найдешевший варіант із підтвердженою ціною.",
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    tier: "budget",
    inputPrice: 0.1,
    outputPrice: 0.4,
    contextTokens: 1_000_000,
    note: "Стара лінійка. Структуру ТЗ тримає гірше за 2.5+.",
  },
];

/**
 * OpenAI. Моделі лінійки gpt-5 і o-series — reasoning-моделі:
 * temperature вони не приймають, і провайдер його не надсилає.
 */
const OPENAI: CatalogEntry[] = [
  {
    id: "gpt-5",
    label: "GPT-5",
    tier: "recommended",
    inputPrice: 1.25,
    outputPrice: 10,
    contextTokens: 400_000,
    note: "Найкращий баланс у OpenAI: вчетверо дешевший за Opus 5 на вході.",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    tier: "budget",
    inputPrice: 0.25,
    outputPrice: 2,
    contextTokens: 400_000,
    note: "Уп'ятеро дешевший за GPT-5. Достатньо для типової статті-огляду.",
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    tier: "budget",
    inputPrice: 0.05,
    outputPrice: 0.4,
    contextTokens: 400_000,
    note: "Найдешевша модель у списку. Структура ТЗ виходить поверхневою.",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    tier: "balanced",
    inputPrice: 2,
    outputPrice: 8,
    contextTokens: 1_047_576,
    note: "Не reasoning-модель: відповідає швидше, аналізує поверхневіше.",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    tier: "budget",
    inputPrice: 0.4,
    outputPrice: 1.6,
    contextTokens: 1_047_576,
    note: "Швидка й дешева. Гарна для правок ТЗ через чат.",
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    tier: "budget",
    inputPrice: 0.1,
    outputPrice: 0.4,
    contextTokens: 1_047_576,
    note: "Мінімальна ціна серед 4.1.",
  },
  {
    id: "o4-mini",
    label: "o4-mini",
    tier: "balanced",
    inputPrice: 1.1,
    outputPrice: 4.4,
    contextTokens: 200_000,
    note: "Reasoning-модель середнього рівня. Повільніша за gpt-5-mini.",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    tier: "balanced",
    inputPrice: 2.5,
    outputPrice: 10,
    contextTokens: 128_000,
    note: "Стара флагманська модель. Дорожча за gpt-5 без переваг для ТЗ.",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    tier: "budget",
    inputPrice: 0.15,
    outputPrice: 0.6,
    contextTokens: 128_000,
    note: "Стара дешева модель.",
  },
];

const CATALOG: Record<AiProviderId, CatalogEntry[]> = {
  anthropic: ANTHROPIC,
  gemini: GEMINI,
  openai: OPENAI,
};

/** Модель, яку інтерфейс підставляє, коли користувач щойно додав ключ. */
export const DEFAULT_MODEL: Record<AiProviderId, string> = {
  anthropic: "claude-opus-5",
  gemini: "gemini-3.6-flash",
  openai: "gpt-5",
};

export const PROVIDER_LABEL: Record<AiProviderId, string> = {
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
  openai: "OpenAI",
};

/** Де взяти ключ. Показується поруч із полем вводу. */
export const PROVIDER_KEY_URL: Record<AiProviderId, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
};

/** Префікс ключа — рання перевірка, щоб не ганяти явно чужий ключ у мережу. */
export const PROVIDER_KEY_PREFIX: Record<AiProviderId, string | null> = {
  anthropic: "sk-ant-",
  // Ключі AI Studio історично починалися з AIza, нові — з AQ.
  // Спільного префікса немає, тому перевірка лише на довжину.
  gemini: null,
  openai: "sk-",
};

export const AI_PROVIDER_IDS: AiProviderId[] = ["gemini", "openai", "anthropic"];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return (
    typeof value === "string" &&
    (AI_PROVIDER_IDS as string[]).includes(value)
  );
}

export function catalogFor(provider: AiProviderId): readonly CatalogEntry[] {
  return CATALOG[provider];
}

export function catalogEntry(
  provider: AiProviderId,
  modelId: string,
): CatalogEntry | null {
  return CATALOG[provider].find((entry) => entry.id === modelId) ?? null;
}

/**
 * Зводить живий перелік провайдера з каталогом.
 *
 * Порядок навмисно з каталогу, а не з відповіді API: провайдери віддають
 * моделі в довільному порядку й упереміш зі службовими (tts, image, robotics),
 * а користувачеві потрібні спочатку рекомендовані.
 */
export function mergeModels(
  provider: AiProviderId,
  liveIds: readonly string[] | null,
): ModelOption[] {
  const live = liveIds ? new Set(liveIds) : null;
  const entries = CATALOG[provider];
  const known = new Set(entries.map((entry) => entry.id));

  const fromCatalog: ModelOption[] = entries
    // Без живого переліку показуємо весь каталог: інакше поле вибору
    // порожнє, і незрозуміло, що взагалі буває.
    .filter((entry) => (live ? live.has(entry.id) : true))
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      tier: entry.tier,
      inputPrice: entry.inputPrice,
      outputPrice: entry.outputPrice,
      contextTokens: entry.contextTokens,
      note: entry.note,
      available: live ? live.has(entry.id) : false,
    }));

  const extra: ModelOption[] = (liveIds ?? [])
    .filter((id) => !known.has(id))
    .sort()
    .map((id) => ({
      id,
      label: id,
      tier: null,
      inputPrice: null,
      outputPrice: null,
      contextTokens: null,
      note: null,
      available: true,
    }));

  return [...fromCatalog, ...extra];
}
