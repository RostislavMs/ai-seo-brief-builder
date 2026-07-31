import { randomBytes } from "node:crypto";
import type {
  PublicShare,
  SessionShare,
  ShareSnapshot,
  SharedSections,
} from "@brief/shared";
import type { AppConfig } from "../../config";
import { AppError } from "../../http/errors";
import { isMissingTable, supabaseAdmin, throwDbError } from "../../lib/supabase";
import { shareSnapshotSchema } from "./snapshot";

/**
 * Публічні версії сесій у Supabase.
 *
 * Модуль навмисно нічого не знає про сесії: він читає й пише рядок
 * session_shares, а зліпок отримує вже готовим. Інакше вийшло б коло —
 * сесія читає свою публічну версію, а публікація читає сесію.
 */

interface ShareRow {
  token: string;
  include_analyses: boolean;
  include_comparison: boolean;
  captured_at: string;
  updated_at: string;
}

/**
 * snapshot тут відсутній навмисно: у ньому лежить розібраний контент усіх
 * сторінок, і сторінці сесії, якій потрібні лише посилання й дати, він
 * коштував би мегабайти на кожне відкриття.
 */
const SHARE_COLUMNS =
  "token, include_analyses, include_comparison, captured_at, updated_at";

function toShare(row: ShareRow): SessionShare {
  return {
    token: row.token,
    sections: {
      analyses: row.include_analyses,
      comparison: row.include_comparison,
    },
    publishedAt: row.updated_at,
    capturedAt: row.captured_at,
  };
}

/**
 * Токен публічного посилання: 16 випадкових байтів у base64url — 22 символи.
 *
 * Це і є весь контроль доступу до опублікованого, тому взято
 * криптографічний генератор, а не Math.random чи id сесії: перший передбачуваний
 * за станом, другий взагалі не секрет і зайве розкриває внутрішній ідентифікатор.
 */
function createToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Публічна версія сесії або null, якщо її не публікували. */
export async function readShare(
  config: AppConfig,
  sessionId: string,
): Promise<SessionShare | null> {
  const { data, error } = await supabaseAdmin(config)
    .from("session_shares")
    .select(SHARE_COLUMNS)
    .eq("session_id", sessionId)
    .maybeSingle<ShareRow>();

  if (error) {
    // Міграцію 0008 могли ще не виконати — а це читання йде в складі кожного
    // відкриття сесії. Валити через нього всю сесію не можна: публічна версія
    // тут додаткова можливість, а не її частина. Спроба опублікувати натомість
    // скаже прямо — вона пише в ту саму таблицю через звичайний throwDbError.
    if (isMissingTable(error)) {
      console.warn(
        "[shares] таблиці session_shares немає — виконайте міграцію 0008",
      );
      return null;
    }

    throwDbError(error, "читання публічної версії сесії");
  }

  return data ? toShare(data) : null;
}

export interface SaveShareInput {
  sections: SharedSections;
  snapshot: ShareSnapshot;
  /** `updatedAt` сесії, з якої зроблено зліпок. */
  capturedAt: string;
}

/**
 * Створює публічну версію або перезаписує наявну.
 *
 * Токен наявної не змінюється — це головна вимога до оновлення: посилання вже
 * могли надіслати, і новий токен на кожне «оновити публічну версію» означав би
 * мертве посилання в чужій переписці. Саме тому це не upsert: він писав би в
 * рядок новий токен разом з усім іншим.
 */
export async function saveShare(
  config: AppConfig,
  sessionId: string,
  input: SaveShareInput,
): Promise<SessionShare> {
  const db = supabaseAdmin(config);
  const existing = await readShare(config, sessionId);

  const values = {
    include_analyses: input.sections.analyses,
    include_comparison: input.sections.comparison,
    captured_at: input.capturedAt,
    snapshot: input.snapshot,
  };

  if (existing) {
    const { data, error } = await db
      .from("session_shares")
      .update(values)
      .eq("token", existing.token)
      .select(SHARE_COLUMNS)
      .maybeSingle<ShareRow>();

    if (error) throwDbError(error, "оновлення публічної версії");
    // Рядок зник між читанням і записом — публічну версію прибрали в іншій
    // вкладці. Створюємо заново замість помилки: користувач натиснув
    // «оновити», і новий зліпок — саме те, чого він хотів.
    if (data) return toShare(data);
  }

  const { data, error } = await db
    .from("session_shares")
    .insert({ token: createToken(), session_id: sessionId, ...values })
    .select(SHARE_COLUMNS)
    .single<ShareRow>();

  if (error) throwDbError(error, "публікація сесії");

  return toShare(data);
}

export async function deleteShare(
  config: AppConfig,
  sessionId: string,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("session_shares")
    .delete()
    .eq("session_id", sessionId);

  if (error) throwDbError(error, "прибирання сесії з публічного доступу");
}

/**
 * Формат токена. Перевіряється до запиту в базу: у маршрут без авторизації
 * приходить будь-що, і сотні символів сміття не мають ставати запитом.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function notFound(): AppError {
  // Однакова відповідь для «не існує» і «прибрали з публічного»: за різницею
  // можна було б перебором дізнатися, які токени колись існували.
  return new AppError(
    "share_not_found",
    "Публічної версії за цим посиланням немає. Можливо, автор прибрав її з публічного доступу.",
    404,
  );
}

/**
 * Зліпок за публічним токеном. Єдина функція, яку викликає маршрут без входу,
 * тому вона віддає рівно вміст зліпка — без токена, id сесії й автора.
 */
export async function readPublicShare(
  config: AppConfig,
  token: string,
): Promise<PublicShare> {
  if (!TOKEN_PATTERN.test(token)) throw notFound();

  const { data, error } = await supabaseAdmin(config)
    .from("session_shares")
    .select("snapshot, updated_at")
    .eq("token", token)
    .maybeSingle<{ snapshot: unknown; updated_at: string }>();

  if (error) throwDbError(error, "читання публічної версії");
  if (!data) throw notFound();

  // Звірка зі схемою, а не з версією формату: у jsonb лежить зліпок, який
  // писали попередні версії коду, і типізація в рантаймі нічого не гарантує.
  // Без цієї перевірки зліпок, у якому немає полів поточного формату, дав би
  // читачеві чорний екран — і жодної підказки, що з цим робити.
  const parsed = shareSnapshotSchema.safeParse(data.snapshot);

  if (!parsed.success) {
    throw new AppError(
      "share_outdated",
      "Публічну версію створено в попередньому форматі даних. Попросіть автора " +
        "натиснути «Оновити публічну версію» — посилання при цьому не зміниться.",
      410,
    );
  }

  return { snapshot: parsed.data, publishedAt: data.updated_at };
}
