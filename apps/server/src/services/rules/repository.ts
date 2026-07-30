import type {
  ActiveRules,
  LanguageRule,
  LanguageRuleCount,
  LanguageRuleStatus,
  UserRole,
} from "@brief/shared";
import { ALL_LANGUAGES } from "@brief/shared";
import type { AppConfig } from "../../config";
import { AppError } from "../../http/errors";
import { supabaseAdmin, throwDbError } from "../../lib/supabase";

/**
 * Правила для мов у Supabase.
 *
 * Видимість вирішується тут, а не в маршруті: «що саме бачить ця роль» —
 * властивість даних, і розкидати її по обробниках означало б рано чи пізно
 * віддати чужу пропозицію в одному з них.
 *
 * Правила читаються двома різними шляхами:
 *
 * - `listRules` — для інтерфейсу: із поштою автора, статусом, ознакою «моє».
 * - `activeRules` — для промпта: лише тексти чинних правил однієї мови.
 *
 * Розділення не косметичне. Генерація ТЗ не має права зачепити пропозицію,
 * що чекає розгляду, тому запит під неї фільтрує в базі, а не в коді.
 */

interface RuleRow {
  id: string;
  language_code: string;
  rule: string;
  status: LanguageRuleStatus;
  enabled: boolean;
  created_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

const RULE_COLUMNS =
  "id, language_code, rule, status, enabled, created_by, review_note, " +
  "created_at, updated_at";

/**
 * Пошта авторів — окремим запитом, а не вкладеним select-ом.
 *
 * language_rules має два зв'язки з profiles (автор і той, хто розглянув),
 * тому вкладений select довелося б розрізняти підказкою на ім'я зв'язку.
 * Явний запит id → email не залежить ні від імені обмеження, ні від стану
 * кеша схеми PostgREST — а коштує один невеликий похід у базу.
 */
async function authorEmails(
  config: AppConfig,
  rows: readonly Pick<RuleRow, "created_by">[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id))),
  ];

  if (ids.length === 0) return new Map();

  const { data, error } = await supabaseAdmin(config)
    .from("profiles")
    .select("id, email")
    .in("id", ids)
    .returns<{ id: string; email: string }[]>();

  if (error) {
    // Ім'я автора — підпис, а не дані правила. Без нього список читається,
    // тому падати через нього не варто.
    console.warn("[rules] не вдалося прочитати авторів правил:", error);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.id, row.email]));
}

function toRule(
  row: RuleRow,
  viewerId: string,
  emails: Map<string, string>,
): LanguageRule {
  return {
    id: row.id,
    languageCode: row.language_code,
    rule: row.rule,
    status: row.status,
    enabled: row.enabled,
    authorEmail: (row.created_by && emails.get(row.created_by)) || null,
    mine: row.created_by === viewerId,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Рядки з бази → правила для клієнта, разом із поштами авторів. */
async function toRules(
  config: AppConfig,
  rows: readonly RuleRow[],
  viewerId: string,
): Promise<LanguageRule[]> {
  const emails = await authorEmails(config, rows);
  return rows.map((row) => toRule(row, viewerId, emails));
}

function notFound(): AppError {
  return new AppError("rule_not_found", "Правило не знайдено.", 404);
}

export interface RuleViewer {
  id: string;
  role: UserRole;
}

export interface ListRulesFilter {
  /** Код ISO 639-1. Не задано — усі мови. */
  languageCode?: string;
  /** Не задано — усі статуси, доступні цій ролі. */
  status?: LanguageRuleStatus;
}

/**
 * Що бачить не-адмін: чинні правила плюс власні пропозиції в будь-якому
 * статусі. Один вираз на всі запити навмисно — розійтися між списком
 * і підрахунками вони не мають права.
 */
function visibleToUser(userId: string): string {
  return `and(status.eq.approved,enabled.is.true),created_by.eq.${userId}`;
}

/**
 * Правила, які має бачити цей користувач.
 *
 * Адмін бачить усе — інакше нічого не розглянув би. Звичайний користувач
 * бачить чинні правила (вони впливають на його ТЗ) і власні пропозиції
 * в будь-якому статусі: подати правило й не дізнатися вироку — найгірший
 * можливий результат цієї дії.
 */
export async function listRules(
  config: AppConfig,
  viewer: RuleViewer,
  filter: ListRulesFilter = {},
): Promise<LanguageRule[]> {
  let query = supabaseAdmin(config).from("language_rules").select(RULE_COLUMNS);

  if (filter.languageCode) query = query.eq("language_code", filter.languageCode);
  if (filter.status) query = query.eq("status", filter.status);

  if (viewer.role !== "admin") query = query.or(visibleToUser(viewer.id));

  // Порядок додавання, а не за статусом: групує правила сам інтерфейс,
  // а всередині групи важлива послідовність, у якій їх писали — саме в ній
  // вони потім ідуть у промпт.
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .returns<RuleRow[]>();

  if (error) throwDbError(error, "читання правил для мов");

  return toRules(config, data ?? [], viewer.id);
}

/**
 * По скільку правил у кожної мови — щоб у списку вибору було видно, де вони
 * вже є, і не доводилося відкривати всі 183 мови по черзі.
 *
 * Рахуємо в пам'яті, а не group by: правил на проєкт десятки, а PostgREST
 * агрегації вимагають окремого view.
 */
export async function countRulesByLanguage(
  config: AppConfig,
  viewer: RuleViewer,
): Promise<LanguageRuleCount[]> {
  let query = supabaseAdmin(config)
    .from("language_rules")
    .select("language_code, status, enabled, created_by");

  if (viewer.role !== "admin") query = query.or(visibleToUser(viewer.id));

  const { data, error } = await query.returns<
    Pick<RuleRow, "language_code" | "status" | "enabled" | "created_by">[]
  >();

  if (error) throwDbError(error, "підрахунок правил для мов");

  const counts = new Map<string, LanguageRuleCount>();

  for (const row of data ?? []) {
    const entry = counts.get(row.language_code) ?? {
      languageCode: row.language_code,
      active: 0,
      pending: 0,
    };

    if (row.status === "approved" && row.enabled) entry.active += 1;
    if (row.status === "pending") entry.pending += 1;

    counts.set(row.language_code, entry);
  }

  return [...counts.values()];
}

/**
 * Скільки пропозицій чекає розгляду: адміну — всі, користувачу — його власні.
 * Використовується бейджем у бічній панелі, тому просимо в базі лише число.
 */
export async function countPendingRules(
  config: AppConfig,
  viewer: RuleViewer,
): Promise<number> {
  let query = supabaseAdmin(config)
    .from("language_rules")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (viewer.role !== "admin") query = query.eq("created_by", viewer.id);

  const { count, error } = await query;

  if (error) {
    // Бейдж — не критична частина екрана. Валити /api/me через нього
    // означало б, що ненакочена міграція гасить весь застосунок.
    console.warn("[rules] не вдалося підрахувати пропозиції:", error);
    return 0;
  }

  return count ?? 0;
}

export interface LanguageRuleStats {
  /** Таке саме правило для цієї мови вже існує — у будь-якому статусі. */
  duplicate: boolean;
  /** Скільки правил уже схвалено: далі за межу приймати нові не варто. */
  approved: number;
}

/**
 * Стан мови перед створенням правила: чи є вже таке саме й скільки схвалених.
 *
 * Окремим запитом, а не через listRules: той фільтрує за видимістю, і
 * перевірка на дубль побачила б лише частину даних — користувач створив би
 * копію чужої пропозиції, яку йому не показують, і дізнався б про це вже
 * від адміна.
 */
export async function languageRuleStats(
  config: AppConfig,
  languageCode: string,
  text: string,
): Promise<LanguageRuleStats> {
  const { data, error } = await supabaseAdmin(config)
    .from("language_rules")
    .select("rule, status")
    .eq("language_code", languageCode)
    .returns<Pick<RuleRow, "rule" | "status">[]>();

  if (error) throwDbError(error, "перевірка правил мови");

  const rows = data ?? [];
  // Порівнюємо без регістру й зайвих пробілів: «Не використовувати» і
  // «не  використовувати» це одне правило, а не два.
  const needle = text.trim().toLowerCase().replace(/\s+/g, " ");

  return {
    duplicate: rows.some(
      (row) => row.rule.trim().toLowerCase().replace(/\s+/g, " ") === needle,
    ),
    approved: rows.filter((row) => row.status === "approved").length,
  };
}

/** Один рядок за id — щоб перевірити наявність до правки чи видалення. */
async function findRule(
  config: AppConfig,
  viewer: RuleViewer,
  id: string,
): Promise<LanguageRule> {
  const { data, error } = await supabaseAdmin(config)
    .from("language_rules")
    .select(RULE_COLUMNS)
    .eq("id", id)
    .maybeSingle<RuleRow>();

  if (error) throwDbError(error, "читання правила");
  if (!data) throw notFound();

  return toRule(data, viewer.id, await authorEmails(config, [data]));
}

export interface CreateRuleInput {
  languageCode: string;
  rule: string;
}

/**
 * Створює правило. Статус визначає роль, а не клієнт: у користувача виходить
 * пропозиція, в адміна — одразу чинне правило.
 */
export async function createRule(
  config: AppConfig,
  viewer: RuleViewer,
  input: CreateRuleInput,
): Promise<LanguageRule> {
  const admin = viewer.role === "admin";

  const { data, error } = await supabaseAdmin(config)
    .from("language_rules")
    .insert({
      language_code: input.languageCode,
      rule: input.rule,
      status: admin ? "approved" : "pending",
      enabled: true,
      created_by: viewer.id,
      // Своє власне правило адмін не «розглядає», але автор рішення
      // все одно він — інакше в історії лишилася б порожнеча.
      ...(admin ? { reviewed_by: viewer.id, reviewed_at: new Date().toISOString() } : {}),
    })
    .select(RULE_COLUMNS)
    .single<RuleRow>();

  if (error) throwDbError(error, "збереження правила");

  return toRule(data, viewer.id, await authorEmails(config, [data]));
}

export interface UpdateRuleInput {
  rule?: string;
  status?: LanguageRuleStatus;
  enabled?: boolean;
  reviewNote?: string | null;
}

/**
 * Правка правила — лише для адміна (перевіряється в маршруті через
 * requireAdmin). Зміна статусу відмічається як розгляд: хто і коли.
 */
export async function updateRule(
  config: AppConfig,
  viewer: RuleViewer,
  id: string,
  patch: UpdateRuleInput,
): Promise<LanguageRule> {
  const changes: Record<string, unknown> = {};

  if (patch.rule !== undefined) changes["rule"] = patch.rule;
  if (patch.enabled !== undefined) changes["enabled"] = patch.enabled;
  if (patch.reviewNote !== undefined) changes["review_note"] = patch.reviewNote;

  if (patch.status !== undefined) {
    changes["status"] = patch.status;
    changes["reviewed_by"] = viewer.id;
    changes["reviewed_at"] = new Date().toISOString();

    // Схвалене правило має починати діяти. Інакше «прийняти» нічого
    // не змінювало б для того, хто вимкнув його перед відхиленням.
    if (patch.status === "approved" && patch.enabled === undefined) {
      changes["enabled"] = true;
    }

    // Причина відхилення знімається разом із відхиленням: «діє» поряд
    // з «не годиться» — суперечливий стан, а не історія.
    if (patch.status === "approved" && patch.reviewNote === undefined) {
      changes["review_note"] = null;
    }
  }

  if (Object.keys(changes).length === 0) {
    return findRule(config, viewer, id);
  }

  const { data, error } = await supabaseAdmin(config)
    .from("language_rules")
    .update(changes)
    .eq("id", id)
    .select(RULE_COLUMNS)
    .maybeSingle<RuleRow>();

  if (error) throwDbError(error, "оновлення правила");
  if (!data) throw notFound();

  return toRule(data, viewer.id, await authorEmails(config, [data]));
}

export async function deleteRule(
  config: AppConfig,
  id: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin(config)
    .from("language_rules")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) throwDbError(error, "видалення правила");
  if (!data) throw notFound();
}

/**
 * Тексти правил, які реально йдуть у промпт для цієї мови.
 *
 * Два набори окремо, а не одним списком: правило для всіх мов і правило
 * саме для цієї мови в промпті мають різну вагу, і другому треба перебивати
 * перше. Злиті в один перелік, вони цю різницю втрачають.
 *
 * Єдина функція, якою правила потрапляють до AI, — і вона фільтрує в базі:
 * пропозиція, що чекає розгляду, не має жодного шансу дійти до моделі.
 *
 * Помилка читання не зриває генерацію: краще ТЗ без правил, ніж
 * порожній екран замість ТЗ після хвилини очікування.
 */
export async function activeRules(
  config: AppConfig,
  languageCode: string,
): Promise<ActiveRules> {
  const { data, error } = await supabaseAdmin(config)
    .from("language_rules")
    .select("language_code, rule")
    // Один запит на обидві області: два послідовних дали б ту саму
    // відповідь удвічі довше, а генерація ТЗ і без того не швидка.
    .in("language_code", [ALL_LANGUAGES, languageCode])
    .eq("status", "approved")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .returns<Pick<RuleRow, "language_code" | "rule">[]>();

  if (error) {
    console.warn(`[rules] не вдалося прочитати правила для ${languageCode}:`, error);
    return { global: [], language: [] };
  }

  const rows = data ?? [];

  return {
    global: rows
      .filter((row) => row.language_code === ALL_LANGUAGES)
      .map((row) => row.rule),
    language: rows
      .filter((row) => row.language_code !== ALL_LANGUAGES)
      .map((row) => row.rule),
  };
}
