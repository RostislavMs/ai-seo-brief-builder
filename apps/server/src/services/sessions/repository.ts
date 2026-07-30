import type {
  ChatMessage,
  PageAnalysis,
  PageComparison,
  ParsedPage,
  SeoBrief,
  Session,
  SessionSummary,
} from "@brief/shared";
import type { AppConfig } from "../../config";
import { AppError } from "../../http/errors";
import { supabaseAdmin, throwDbError } from "../../lib/supabase";
import { seoBriefSchema } from "../brief/schema";
import { pageComparisonSchema } from "../compare/schema";

/**
 * Сесії в Supabase (розділ 5 ТЗ).
 *
 * Читання — цілою сесією разом зі сторінками й повідомленнями.
 * Запис — дрібними шматками: одна спарсена сторінка важить сотні кілобайт,
 * і переписувати весь набір щоразу, коли завершився один URL, немає сенсу.
 */

interface SessionRow {
  id: string;
  name: string;
  topic: string;
  urls: string[];
  brief: SeoBrief | null;
  comparison: PageComparison | null;
  legacy_brief_removed: boolean;
  created_at: string;
  updated_at: string;
}

/** Полегшений рядок для списку на бічній панелі — без brief. */
interface SessionListRow {
  id: string;
  name: string;
  topic: string;
  urls: string[];
  created_at: string;
  updated_at: string;
  has_brief: boolean;
}

/** Один рядок session_analyses — сторінка конкурента або власна (role). */
interface AnalysisRow {
  id: string;
  position: number;
  url: string;
  status: PageAnalysis["status"];
  page: ParsedPage | null;
  error: string | null;
  analyzed_at: string | null;
  role: AnalysisRole;
}

type AnalysisRole = "competitor" | "own";

/** Рядок для вставки: id, page, error і analyzed_at заповнюються пізніше. */
interface NewAnalysisRow {
  session_id: string;
  position: number;
  url: string;
  status: PageAnalysis["status"];
  role: AnalysisRole;
}

/**
 * Позиція власної сторінки. Відʼємна навмисно: `position` задає порядок
 * конкурентів, який визначив користувач, і будь-яке невідʼємне значення тут
 * означало б, що власна сторінка стоїть у тій черзі — а вона в ній не стоїть.
 */
const OWN_POSITION = -1;

interface MessageRow {
  id: string;
  role: ChatMessage["role"];
  content: string;
  changed_brief: boolean;
  created_at: string;
}

const SESSION_COLUMNS =
  "id, name, topic, urls, brief, comparison, legacy_brief_removed, " +
  "created_at, updated_at";
const ANALYSIS_COLUMNS =
  "id, position, url, status, page, error, analyzed_at, role";
const MESSAGE_COLUMNS = "id, role, content, changed_brief, created_at";

function toAnalysis(row: AnalysisRow): PageAnalysis {
  return {
    id: row.id,
    url: row.url,
    status: row.status,
    page: row.page,
    error: row.error,
    analyzedAt: row.analyzed_at,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    ...(row.changed_brief ? { changedBrief: true } : {}),
  };
}

function toSession(
  row: SessionRow,
  analyses: AnalysisRow[],
  messages: MessageRow[],
): Session {
  // Власна сторінка лежить у тій самій таблиці, але в сесії це окреме поле:
  // у списку `analyses` вона мовчки пішла б у промпт генерації ТЗ разом
  // із конкурентами.
  const own = analyses.find((analysis) => analysis.role === "own");

  return {
    id: row.id,
    name: row.name,
    topic: row.topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    urls: row.urls,
    analyses: analyses
      .filter((analysis) => analysis.role !== "own")
      .map(toAnalysis),
    messages: messages.map(toMessage),
    brief: row.brief,
    ownPage: own ? toAnalysis(own) : null,
    comparison: row.comparison,
    ...(row.legacy_brief_removed ? { legacyBriefRemoved: true } : {}),
  };
}

/**
 * Бриф, записаний попередньою версією формату, прибирається назавжди.
 *
 * Той самий підхід, що й для localStorage: синтезувати нові поля без AI
 * неможливо, а віддавати їх у фронт означає чорний екран на першому ж читанні
 * поля, якого в даних немає. Результати парсингу лишаються, тому перегенерація —
 * один клік і без повторного завантаження сторінок.
 */
async function forgetLegacyBrief(
  config: AppConfig,
  sessionId: string,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("sessions")
    .update({ brief: null, legacy_brief_removed: true })
    .eq("id", sessionId);

  if (error) console.warn("[sessions] не вдалося прибрати старе ТЗ:", error);
}

/**
 * Звіт порівняння, записаний попередньою версією формату, теж прибирається.
 *
 * Прапорця на кшталт `legacy_brief_removed` тут немає навмисно: ТЗ — головний
 * результат сесії, і його зникнення треба пояснити, а порівняння відтворюється
 * однією кнопкою без повторного завантаження сторінок. Панель у такому разі
 * показує звичайне «ще не порівнювали».
 */
async function forgetLegacyComparison(
  config: AppConfig,
  sessionId: string,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("sessions")
    .update({ comparison: null })
    .eq("id", sessionId);

  if (error) {
    console.warn("[sessions] не вдалося прибрати старий звіт порівняння:", error);
  }
}

function notFound(): AppError {
  // Однакова відповідь для «немає» і «чуже»: інакше за кодом відповіді
  // можна перебором дізнатися, які id взагалі існують.
  return new AppError("session_not_found", "Сесію не знайдено.", 404);
}

export async function listSessions(
  config: AppConfig,
  userId: string,
): Promise<SessionSummary[]> {
  const db = supabaseAdmin(config);

  // Замість brief беремо обчислювану колонку has_brief: списку потрібен
  // лише факт наявності ТЗ, а сам JSON важить десятки кілобайт на сесію.
  const { data, error } = await db
    .from("sessions")
    .select("id, name, topic, urls, created_at, updated_at, has_brief")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<SessionListRow[]>();

  if (error) throwDbError(error, "читання списку сесій");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    topic: row.topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    urlCount: row.urls.length,
    hasBrief: row.has_brief,
  }));
}

export async function getSession(
  config: AppConfig,
  userId: string,
  sessionId: string,
): Promise<Session> {
  const db = supabaseAdmin(config);

  const { data: row, error } = await db
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<SessionRow>();

  if (error) throwDbError(error, "читання сесії");
  if (!row) throw notFound();

  const [analyses, messages] = await Promise.all([
    db
      .from("session_analyses")
      .select(ANALYSIS_COLUMNS)
      .eq("session_id", sessionId)
      .order("position", { ascending: true })
      .returns<AnalysisRow[]>(),
    db
      .from("session_messages")
      .select(MESSAGE_COLUMNS)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .returns<MessageRow[]>(),
  ]);

  if (analyses.error) throwDbError(analyses.error, "читання сторінок сесії");
  if (messages.error) throwDbError(messages.error, "читання чату сесії");

  // Звірка зі схемою, а не з версією формату: у базі лежить JSON, який писали
  // попередні версії коду, і типізація SessionRow у рантаймі нічого не гарантує.
  const briefOk =
    row.brief === null || seoBriefSchema.safeParse(row.brief).success;
  const comparisonOk =
    row.comparison === null ||
    pageComparisonSchema.safeParse(row.comparison).success;

  if (!briefOk) await forgetLegacyBrief(config, sessionId);
  if (!comparisonOk) await forgetLegacyComparison(config, sessionId);

  return toSession(
    {
      ...row,
      ...(briefOk ? {} : { brief: null, legacy_brief_removed: true }),
      ...(comparisonOk ? {} : { comparison: null }),
    },
    analyses.data ?? [],
    messages.data ?? [],
  );
}

/** Перевірка власника без витягування вмісту — для дочірніх записів. */
async function assertOwner(
  config: AppConfig,
  userId: string,
  sessionId: string,
): Promise<void> {
  const { data, error } = await supabaseAdmin(config)
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  if (error) throwDbError(error, "перевірка доступу до сесії");
  if (!data) throw notFound();
}

export interface CreateSessionInput {
  name: string;
  topic: string;
  urls: string[];
  /** Власна сторінка, якщо її вказали одразу при створенні. */
  ownUrl?: string;
}

export async function createSession(
  config: AppConfig,
  userId: string,
  input: CreateSessionInput,
): Promise<Session> {
  const db = supabaseAdmin(config);

  const { data: row, error } = await db
    .from("sessions")
    .insert({
      user_id: userId,
      name: input.name,
      topic: input.topic,
      urls: input.urls,
    })
    .select(SESSION_COLUMNS)
    .single<SessionRow>();

  if (error) throwDbError(error, "створення сесії");

  // Власна сторінка вставляється тим самим запитом, що й конкуренти: окремий
  // запит міг би не пройти, і сесія лишилася б без неї — при тому, що адресу
  // користувач уже вказав, і повторити цей крок йому нема де.
  const rows: NewAnalysisRow[] = input.urls.map((url, position) => ({
    session_id: row.id,
    position,
    url,
    status: "pending",
    role: "competitor",
  }));

  if (input.ownUrl) {
    rows.push({
      session_id: row.id,
      position: OWN_POSITION,
      url: input.ownUrl,
      status: "pending",
      role: "own",
    });
  }

  const { data: analyses, error: analysesError } = await db
    .from("session_analyses")
    .insert(rows)
    .select(ANALYSIS_COLUMNS)
    .order("position", { ascending: true })
    .returns<AnalysisRow[]>();

  if (analysesError) throwDbError(analysesError, "створення списку сторінок");

  return toSession(row, analyses ?? [], []);
}

export interface UpdateSessionInput {
  name?: string;
  topic?: string;
  brief?: SeoBrief | null;
  comparison?: PageComparison | null;
  legacyBriefRemoved?: boolean;
}

export async function updateSession(
  config: AppConfig,
  userId: string,
  sessionId: string,
  patch: UpdateSessionInput,
): Promise<Session> {
  const changes: Record<string, unknown> = {};

  if (patch.name !== undefined) changes["name"] = patch.name;
  if (patch.topic !== undefined) changes["topic"] = patch.topic;
  if (patch.brief !== undefined) changes["brief"] = patch.brief;
  if (patch.comparison !== undefined) changes["comparison"] = patch.comparison;
  if (patch.legacyBriefRemoved !== undefined) {
    changes["legacy_brief_removed"] = patch.legacyBriefRemoved;
  }

  if (Object.keys(changes).length > 0) {
    const { data, error } = await supabaseAdmin(config)
      .from("sessions")
      .update(changes)
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) throwDbError(error, "оновлення сесії");
    if (!data) throw notFound();
  }

  return getSession(config, userId, sessionId);
}

export async function deleteSession(
  config: AppConfig,
  userId: string,
  sessionId: string,
): Promise<void> {
  // Сторінки й повідомлення підчищає on delete cascade зі схеми.
  const { error } = await supabaseAdmin(config)
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throwDbError(error, "видалення сесії");
}

export interface UpdateAnalysisInput {
  status: PageAnalysis["status"];
  page: ParsedPage | null;
  error: string | null;
  analyzedAt: string | null;
}

export async function updateAnalysis(
  config: AppConfig,
  userId: string,
  sessionId: string,
  analysisId: string,
  patch: UpdateAnalysisInput,
): Promise<PageAnalysis> {
  await assertOwner(config, userId, sessionId);

  const { data, error } = await supabaseAdmin(config)
    .from("session_analyses")
    .update({
      status: patch.status,
      page: patch.page,
      error: patch.error,
      analyzed_at: patch.analyzedAt,
    })
    .eq("id", analysisId)
    .eq("session_id", sessionId)
    .select(ANALYSIS_COLUMNS)
    .maybeSingle<AnalysisRow>();

  if (error) throwDbError(error, "збереження результату аналізу");
  if (!data) {
    throw new AppError("analysis_not_found", "Сторінку в сесії не знайдено.", 404);
  }

  // Сесія змінилася — без цього вона не підніметься вгору в списку.
  await touchSession(config, sessionId);

  return toAnalysis(data);
}

/**
 * Задає або замінює власну сторінку сесії.
 *
 * Разом із нею скидається звіт порівняння: він прив'язаний до конкретної
 * адреси, і залишити старий звіт біля нової сторінки означало б показувати
 * вирок над чужим текстом. Результати парсингу конкурентів не чіпаються —
 * повторне порівняння не завантажує їх заново.
 */
export async function setOwnPage(
  config: AppConfig,
  userId: string,
  sessionId: string,
  url: string,
): Promise<PageAnalysis> {
  await assertOwner(config, userId, sessionId);

  const db = supabaseAdmin(config);

  // Порядок трьох записів обраний так, щоб обрив на будь-якому з них лишав
  // сесію в стані, який не бреше. Звіт скидається першим: якби він ішов
  // останнім, обрив після вставки лишив би нову сторінку поряд зі звітом про
  // попередню — рівно те, чого ця функція має не допускати.
  await clearComparison(config, sessionId);

  // Частковий унікальний індекс не дозволяє двох власних сторінок в одній
  // сесії, тому заміна — це delete з наступним insert, а не upsert
  // по невідомому наперед id.
  const { error: deleteError } = await db
    .from("session_analyses")
    .delete()
    .eq("session_id", sessionId)
    .eq("role", "own" satisfies AnalysisRole);

  if (deleteError) throwDbError(deleteError, "заміна власної сторінки");

  const { data, error } = await db
    .from("session_analyses")
    .insert({
      session_id: sessionId,
      position: OWN_POSITION,
      url,
      status: "pending" as const,
      role: "own" satisfies AnalysisRole,
    })
    .select(ANALYSIS_COLUMNS)
    .single<AnalysisRow>();

  if (error) throwDbError(error, "додавання власної сторінки");

  return toAnalysis(data);
}

/** Прибирає власну сторінку разом зі звітом, який на ній тримався. */
export async function clearOwnPage(
  config: AppConfig,
  userId: string,
  sessionId: string,
): Promise<void> {
  await assertOwner(config, userId, sessionId);

  // Знову звіт першим: сирота-звіт без сторінки нікому не показується,
  // а сторінка без звіту — звичайний стан «ще не порівнювали».
  await clearComparison(config, sessionId);

  const { error } = await supabaseAdmin(config)
    .from("session_analyses")
    .delete()
    .eq("session_id", sessionId)
    .eq("role", "own" satisfies AnalysisRole);

  if (error) throwDbError(error, "видалення власної сторінки");
}

/**
 * Скидає звіт і піднімає сесію в списку одним запитом: touchSession() тут
 * зробив би другий UPDATE того самого рядка.
 */
async function clearComparison(
  config: AppConfig,
  sessionId: string,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("sessions")
    .update({ comparison: null, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throwDbError(error, "скидання звіту порівняння");
}

export interface CreateMessageInput {
  role: ChatMessage["role"];
  content: string;
  changedBrief: boolean;
}

export async function createMessage(
  config: AppConfig,
  userId: string,
  sessionId: string,
  input: CreateMessageInput,
): Promise<ChatMessage> {
  await assertOwner(config, userId, sessionId);

  const { data, error } = await supabaseAdmin(config)
    .from("session_messages")
    .insert({
      session_id: sessionId,
      role: input.role,
      content: input.content,
      changed_brief: input.changedBrief,
    })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();

  if (error) throwDbError(error, "збереження повідомлення");

  await touchSession(config, sessionId);
  return toMessage(data);
}

export async function deleteMessage(
  config: AppConfig,
  userId: string,
  sessionId: string,
  messageId: string,
): Promise<void> {
  await assertOwner(config, userId, sessionId);

  const { error } = await supabaseAdmin(config)
    .from("session_messages")
    .delete()
    .eq("id", messageId)
    .eq("session_id", sessionId);

  if (error) throwDbError(error, "видалення повідомлення");
}

/**
 * Оновлює updated_at, не змінюючи вмісту.
 * Тригер touch_sessions_updated_at спрацьовує лише на UPDATE, тому
 * запис у дочірню таблицю сам по собі сесію «не чіпає».
 */
async function touchSession(config: AppConfig, sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) console.warn("[sessions] не вдалося оновити updated_at:", error);
}

/**
 * Те, що переноситься з локальної сесії.
 *
 * Власної сторінки й звіту порівняння тут немає, і це не пропуск: у версії
 * без акаунтів їх не існувало, тому в localStorage їх немає в жодної сесії.
 */
export type ImportableSession = Pick<
  Session,
  "name" | "topic" | "urls" | "analyses" | "messages" | "brief" | "legacyBriefRemoved"
>;

/**
 * Перенесення сесій із localStorage в акаунт.
 *
 * id з локальної сесії не переносяться: у базі вони генеруються самі,
 * а колізія з чужим uuid зламала б чужу сесію.
 */
export async function importSessions(
  config: AppConfig,
  userId: string,
  sessions: readonly ImportableSession[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const source of sessions) {
    try {
      const created = await createSession(config, userId, {
        name: source.name,
        topic: source.topic,
        urls: source.urls,
      });

      await updateSession(config, userId, created.id, {
        brief: source.brief,
        legacyBriefRemoved: source.legacyBriefRemoved ?? false,
      });

      // Позиції збігаються: createSession створює рядки в порядку urls,
      // а локальні analyses лежать у тому самому порядку.
      await Promise.all(
        created.analyses.map((target, index) => {
          const origin = source.analyses[index];
          if (!origin || origin.status === "pending") return Promise.resolve();

          return updateAnalysis(config, userId, created.id, target.id, {
            status: origin.status,
            page: origin.page,
            error: origin.error,
            analyzedAt: origin.analyzedAt,
          });
        }),
      );

      for (const message of source.messages) {
        await createMessage(config, userId, created.id, {
          role: message.role,
          content: message.content,
          changedBrief: message.changedBrief ?? false,
        });
      }

      imported += 1;
    } catch (error) {
      // Одна зіпсована сесія не має зривати перенесення решти —
      // це разова операція, повторювати її користувач не стане.
      console.warn("[sessions] не вдалося імпортувати сесію:", error);
      skipped += 1;
    }
  }

  return { imported, skipped };
}
