import type {
  AiKeySummary,
  AiProviderId,
  UserProfile,
  UserRole,
  UserSettings,
} from "@brief/shared";
import type { AppConfig } from "../../config";
import type { AuthUser } from "../../http/auth";
import { decryptSecret, encryptSecret, keyHint } from "../../lib/crypto";
import { supabaseAdmin, throwDbError } from "../../lib/supabase";

/**
 * Доступ до профілю, налаштувань і ключів.
 *
 * Кожна функція приймає userId з уже перевіреного токена й сама додає його
 * у where. Сервісний ключ Supabase обходить RLS, тому фільтр тут —
 * єдине, що відділяє дані одного користувача від іншого.
 */

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

const PROFILE_COLUMNS = "id, email, display_name, role, created_at";

function toProfile(row: ProfileRow, fallbackEmail = ""): UserProfile {
  return {
    id: row.id,
    email: row.email || fallbackEmail,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

interface SettingsRow {
  active_provider: AiProviderId | null;
}

interface KeyRow {
  provider: AiProviderId;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  hint: string;
  model: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: UserSettings = { activeProvider: null };

function isAdminEmail(config: AppConfig, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && config.adminEmails.includes(normalized);
}

/**
 * Роль адміна за списком пошт із NITRO_ADMIN_EMAILS.
 *
 * Тільки підвищення, ніколи зниження: адміна могли призначити вручну в базі,
 * і прибрана з .env пошта не має цього скасовувати. Знімається роль лише
 * там само, де й видавалася вручну, — у SQL.
 */
async function promoteIfListed(
  config: AppConfig,
  profile: UserProfile,
): Promise<UserProfile> {
  if (profile.role === "admin" || !isAdminEmail(config, profile.email)) {
    return profile;
  }

  const { error } = await supabaseAdmin(config)
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", profile.id);

  if (error) {
    // Не привід валити вхід: користувач лишається зі своєю роллю,
    // а причина видна в логах.
    console.warn("[account] не вдалося видати роль адміна:", error);
    return profile;
  }

  console.info(`[account] ${profile.email} отримав роль адміна за NITRO_ADMIN_EMAILS`);
  return { ...profile, role: "admin" };
}

/**
 * Профіль створюється тригером on_auth_user_created. Але акаунт міг
 * з'явитися до накатування міграції — тоді рядка немає, і замість 500
 * ми його дописуємо.
 */
export async function getProfile(
  config: AppConfig,
  user: AuthUser,
): Promise<UserProfile> {
  const db = supabaseAdmin(config);

  const { data, error } = await db
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (error) throwDbError(error, "читання профілю");

  if (data) return promoteIfListed(config, toProfile(data, user.email));

  const { data: created, error: insertError } = await db
    .from("profiles")
    .insert({ id: user.id, email: user.email })
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>();

  if (insertError) throwDbError(insertError, "створення профілю");

  return promoteIfListed(config, toProfile(created, user.email));
}

export async function updateProfile(
  config: AppConfig,
  user: AuthUser,
  displayName: string | null,
): Promise<UserProfile> {
  const db = supabaseAdmin(config);

  // Роль в upsert не входить навмисно: PATCH /api/me змінює лише ім'я,
  // і випадково перезаписати нею роль має бути неможливо.
  const { data, error } = await db
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email, display_name: displayName },
      { onConflict: "id" },
    )
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>();

  if (error) throwDbError(error, "оновлення профілю");

  return toProfile(data, user.email);
}

/**
 * Роль без решти профілю — для перевірки прав у middleware.
 * Окремий запит на одну колонку дешевший, ніж повне читання профілю
 * на кожен адмінський виклик.
 */
export async function getRole(
  config: AppConfig,
  userId: string,
): Promise<UserRole> {
  const { data, error } = await supabaseAdmin(config)
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: UserRole }>();

  if (error) throwDbError(error, "читання ролі");

  // Рядка ще немає — акаунт створено до міграції. Права мінімальні:
  // profiles заповнить перше ж читання /api/me.
  return data?.role ?? "user";
}

export async function getSettings(
  config: AppConfig,
  userId: string,
): Promise<UserSettings> {
  const { data, error } = await supabaseAdmin(config)
    .from("user_settings")
    .select("active_provider")
    .eq("user_id", userId)
    .maybeSingle<SettingsRow>();

  if (error) throwDbError(error, "читання налаштувань");
  if (!data) return DEFAULT_SETTINGS;

  return { activeProvider: data.active_provider };
}

export async function updateSettings(
  config: AppConfig,
  userId: string,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await getSettings(config, userId);
  const next: UserSettings = { ...current, ...patch };

  const { error } = await supabaseAdmin(config).from("user_settings").upsert(
    { user_id: userId, active_provider: next.activeProvider },
    { onConflict: "user_id" },
  );

  if (error) throwDbError(error, "збереження налаштувань");
  return next;
}

export async function listKeys(
  config: AppConfig,
  userId: string,
): Promise<AiKeySummary[]> {
  const { data, error } = await supabaseAdmin(config)
    .from("user_ai_keys")
    .select("provider, hint, model, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<Pick<KeyRow, "provider" | "hint" | "model" | "created_at" | "updated_at">[]>();

  if (error) throwDbError(error, "читання ключів");

  return (data ?? []).map((row) => ({
    provider: row.provider,
    hint: row.hint,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveKey(
  config: AppConfig,
  userId: string,
  provider: AiProviderId,
  apiKey: string,
  model: string,
): Promise<AiKeySummary> {
  const encrypted = encryptSecret(apiKey.trim(), config.encryptionKey);

  const { data, error } = await supabaseAdmin(config)
    .from("user_ai_keys")
    .upsert(
      {
        user_id: userId,
        provider,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        hint: keyHint(apiKey),
        model,
      },
      { onConflict: "user_id,provider" },
    )
    .select("provider, hint, model, created_at, updated_at")
    .single<Pick<KeyRow, "provider" | "hint" | "model" | "created_at" | "updated_at">>();

  if (error) throwDbError(error, "збереження ключа");

  return {
    provider: data.provider,
    hint: data.hint,
    model: data.model,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** Змінює лише модель — щоб перемкнути її, не вводячи ключ заново. */
export async function updateKeyModel(
  config: AppConfig,
  userId: string,
  provider: AiProviderId,
  model: string,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("user_ai_keys")
    .update({ model })
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) throwDbError(error, "зміна моделі");
}

export async function deleteKey(
  config: AppConfig,
  userId: string,
  provider: AiProviderId,
): Promise<void> {
  const { error } = await supabaseAdmin(config)
    .from("user_ai_keys")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) throwDbError(error, "видалення ключа");
}

export interface DecryptedKey {
  provider: AiProviderId;
  apiKey: string;
  model: string;
}

/**
 * Розшифрований ключ. Єдина функція, що повертає секрет, — далі він
 * живе лише в пам'яті запиту й у клієнта провайдера.
 */
export async function getDecryptedKey(
  config: AppConfig,
  userId: string,
  provider: AiProviderId,
): Promise<DecryptedKey | null> {
  const { data, error } = await supabaseAdmin(config)
    .from("user_ai_keys")
    .select("provider, ciphertext, iv, auth_tag, model")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle<Pick<KeyRow, "provider" | "ciphertext" | "iv" | "auth_tag" | "model">>();

  if (error) throwDbError(error, "читання ключа");
  if (!data) return null;

  return {
    provider: data.provider,
    model: data.model,
    apiKey: decryptSecret(
      { ciphertext: data.ciphertext, iv: data.iv, authTag: data.auth_tag },
      config.encryptionKey,
    ),
  };
}

/**
 * Ключ, яким треба працювати зараз: явно обраний у налаштуваннях, а якщо
 * вибору не було — найсвіжіший доданий. Без другої гілки додавання
 * першого ключа нічого б не змінювало, і це виглядало б як поломка.
 *
 * null означає, що генерація недоступна: серверного ключа-замінника немає.
 */
export async function resolveActiveKey(
  config: AppConfig,
  userId: string,
): Promise<DecryptedKey | null> {
  const settings = await getSettings(config, userId);

  if (settings.activeProvider) {
    return getDecryptedKey(config, userId, settings.activeProvider);
  }

  const keys = await listKeys(config, userId);
  const newest = keys[0];

  return newest ? getDecryptedKey(config, userId, newest.provider) : null;
}
