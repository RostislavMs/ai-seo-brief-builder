import type { PromptTemplate, PromptVersion } from "@brief/shared";
import type { AppConfig } from "../../config";
import { supabaseAdmin, throwDbError } from "../../lib/supabase";
import { profileEmails } from "../account/emails";
import {
  PROMPT_DEFINITIONS,
  defaultBody,
  type PromptKey,
} from "./registry";

/**
 * Промпти в Supabase.
 *
 * У базі лежать лише правки: рядок є — діє його текст, рядка немає — діє
 * початковий текст із реєстру. Через це «скинути до початкового» — це delete,
 * а не пошук першої редакції в історії, і початковий текст завжди рівно один.
 *
 * Промпти читаються двома різними шляхами, як і правила для мов:
 *
 * - `listPrompts` — для сторінки: з початковим текстом, автором і лічильником
 *   правок.
 * - `resolvePromptSet` — для генерації: лише ключ → чинний текст.
 *
 * Розділення не косметичне. Другий шлях виконується перед кожним зверненням
 * до моделі, і тягнути через нього історію правок означало б платити за неї
 * у найгарячішому місці.
 */

interface TemplateRow {
  key: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
}

interface HistoryRow {
  id: string;
  key: string;
  body: string | null;
  note: string | null;
  changed_by: string | null;
  created_at: string;
}

const TEMPLATE_COLUMNS = "key, body, updated_by, updated_at";
const HISTORY_COLUMNS = "id, key, body, note, changed_by, created_at";

/** Ключ → чинний текст промпта. Містить рівно ключі з реєстру. */
export type PromptSet = Readonly<Record<PromptKey, string>>;

/** Початкові тексти — стан «правок не було». */
function defaultSet(): PromptSet {
  return Object.fromEntries(
    PROMPT_DEFINITIONS.map((definition) => [definition.key, definition.body]),
  ) as Record<PromptKey, string>;
}

/**
 * Чинні тексти всіх промптів — те, що йде в модель.
 *
 * Помилка читання не зриває генерацію: краще ТЗ за початковими промптами, ніж
 * порожній екран замість ТЗ. Те саме рішення, що й для правил для мов, і з тієї
 * ж причини — сторінки вже завантажені, і втратити їх через недоступну базу
 * було б найдорожчим можливим збоєм.
 *
 * Невідомий ключ із бази ігнорується: промпт могли перейменувати в коді, а
 * рядок із правкою лишився. Підставляти його нікуди, і падати через нього
 * теж нема сенсу.
 */
export async function resolvePromptSet(config: AppConfig): Promise<PromptSet> {
  const prompts = defaultSet();

  const { data, error } = await supabaseAdmin(config)
    .from("prompt_templates")
    .select("key, body")
    .returns<Pick<TemplateRow, "key" | "body">[]>();

  if (error) {
    console.warn("[prompts] не вдалося прочитати правки промптів:", error);
    return prompts;
  }

  const overrides: Record<string, string> = { ...prompts };

  for (const row of data ?? []) {
    if (row.key in prompts) overrides[row.key] = row.body;
  }

  return overrides as PromptSet;
}

/**
 * Скільки разів кожен промпт правили. Одним запитом по всій історії, а не
 * count на кожен ключ: промптів вісім, і вісім походів у базу заради восьми
 * чисел дорожчі за перебір кількох десятків рядків у пам'яті.
 */
async function revisionCounts(config: AppConfig): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin(config)
    .from("prompt_template_history")
    .select("key")
    .returns<Pick<HistoryRow, "key">[]>();

  if (error) {
    // Лічильник правок — підпис на картці, а не сам промпт.
    console.warn("[prompts] не вдалося підрахувати правки:", error);
    return new Map();
  }

  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
  }

  return counts;
}

/**
 * Усі промпти для сторінки: чинний текст, початковий, хто правив останнім.
 *
 * Порядок — з реєстру, а не з бази: він групує промпти за сценарієм
 * (генерація, чат, порівняння, спільні), і сортування за датою правки
 * перемішувало б їх після кожної зміни.
 */
export async function listPrompts(config: AppConfig): Promise<PromptTemplate[]> {
  const { data, error } = await supabaseAdmin(config)
    .from("prompt_templates")
    .select(TEMPLATE_COLUMNS)
    .returns<TemplateRow[]>();

  if (error) throwDbError(error, "читання промптів");

  const rows = data ?? [];
  const [emails, revisions] = await Promise.all([
    profileEmails(config, rows.map((row) => row.updated_by)),
    revisionCounts(config),
  ]);

  const byKey = new Map(rows.map((row) => [row.key, row]));

  return PROMPT_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);

    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      group: definition.group,
      variables: [...definition.variables],
      body: row?.body ?? definition.body,
      defaultBody: definition.body,
      isDefault: row === undefined,
      updatedAt: row?.updated_at ?? null,
      updatedByEmail: (row?.updated_by && emails.get(row.updated_by)) || null,
      revisions: revisions.get(definition.key) ?? 0,
    };
  });
}

/** Один промпт після зміни — щоб клієнт не перечитував увесь список. */
export async function getPrompt(
  config: AppConfig,
  key: PromptKey,
): Promise<PromptTemplate> {
  const all = await listPrompts(config);

  // Ключ звірений із реєстром типом, тому промпт у списку є завжди.
  return all.find((prompt) => prompt.key === key)!;
}

/** Історія правок одного промпта — найновіші зверху. */
export async function promptHistory(
  config: AppConfig,
  key: PromptKey,
): Promise<PromptVersion[]> {
  const { data, error } = await supabaseAdmin(config)
    .from("prompt_template_history")
    .select(HISTORY_COLUMNS)
    .eq("key", key)
    .order("created_at", { ascending: false })
    .returns<HistoryRow[]>();

  if (error) throwDbError(error, "читання історії промпта");

  const rows = data ?? [];
  const emails = await profileEmails(config, rows.map((row) => row.changed_by));

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    note: row.note,
    authorEmail: (row.changed_by && emails.get(row.changed_by)) || null,
    createdAt: row.created_at,
  }));
}

/**
 * Дописує редакцію в історію.
 *
 * Помилка тут не скасовує саму правку: промпт уже змінено, і відкат означав би
 * другу дію в базі, яка теж може не пройти. Втратити рядок історії неприємно,
 * але вимагати від адміна повторити правку через це — гірше.
 */
async function recordHistory(
  config: AppConfig,
  key: PromptKey,
  body: string | null,
  userId: string,
  note: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("prompt_template_history")
    .insert({ key, body, changed_by: userId, note });

  if (error) console.warn("[prompts] не вдалося записати історію правки:", error);
}

/**
 * Зберігає правку промпта.
 *
 * Текст, що дослівно дорівнює початковому, зберігається як скидання — інакше
 * «повернув як було руками» лишало б у базі рядок-перевизначення, і промпт
 * назавжди рахувався б зміненим, хоч і збігався з початковим.
 *
 * Історія пишеться після самої зміни, а не до: рядок в історії про правку,
 * якої не сталося, вводив би в оману сильніше, ніж її відсутність.
 */
export async function savePrompt(
  config: AppConfig,
  userId: string,
  key: PromptKey,
  body: string,
  note: string | null,
): Promise<PromptTemplate> {
  if (body === defaultBody(key)) return resetPrompt(config, userId, key, note);

  const { error } = await supabaseAdmin(config)
    .from("prompt_templates")
    .upsert({ key, body, updated_by: userId }, { onConflict: "key" });

  if (error) throwDbError(error, "збереження промпта");

  await recordHistory(config, key, body, userId, note);

  return getPrompt(config, key);
}

/**
 * Повертає промпт до початкового тексту: прибирає перевизначення.
 *
 * В історію йде рядок із body = null — саме він відрізняє скидання від правки,
 * що випадково збіглася з початковим текстом.
 */
export async function resetPrompt(
  config: AppConfig,
  userId: string,
  key: PromptKey,
  note: string | null,
): Promise<PromptTemplate> {
  const { data, error } = await supabaseAdmin(config)
    .from("prompt_templates")
    .delete()
    .eq("key", key)
    .select("key")
    .maybeSingle<{ key: string }>();

  if (error) throwDbError(error, "скидання промпта");

  // Рядка не було — промпт і так початковий. Записувати скидання, якого
  // не сталося, означало б наповнювати історію повторними натисканнями.
  if (data) await recordHistory(config, key, null, userId, note);

  return getPrompt(config, key);
}
