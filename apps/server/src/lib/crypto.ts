import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../http/errors";

/**
 * Шифрування AI-ключів користувачів (AES-256-GCM).
 *
 * Ключі лежать у Supabase, і RLS закриває їх від клієнта — але не від
 * дампа бази чи витоку сервісного ключа. Тому в таблицю потрапляє лише
 * шифротекст, а майстер-ключ живе в оточенні сервера.
 *
 * GCM, а не CBC: він одразу дає тег автентичності, тож підмінений рядок
 * у базі впаде на розшифруванні, а не поверне сміття, яке потім піде
 * в мережу як «ключ».
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Приймає ключ у hex (64 символи) або base64. Обидва формати дає
 * `openssl rand`, і вимагати саме один — зайва причина для помилки.
 */
function toKey(raw: string): Buffer {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new AppError(
      "encryption_not_configured",
      "Не заданий NITRO_ENCRYPTION_KEY. Без нього неможливо зберігати ключі " +
        "AI-провайдерів. Згенеруйте: openssl rand -hex 32",
      503,
    );
  }

  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== KEY_BYTES) {
    throw new AppError(
      "encryption_key_invalid",
      `NITRO_ENCRYPTION_KEY має бути 32 байти (${key.length} після декодування). ` +
        "Згенеруйте: openssl rand -hex 32",
      503,
    );
  }

  return key;
}

export function encryptSecret(plaintext: string, rawKey: string): EncryptedValue {
  const key = toKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(value: EncryptedValue, rawKey: string): string {
  const key = toKey(rawKey);

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(value.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(value.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Найчастіша причина — змінений NITRO_ENCRYPTION_KEY. Повідомлення
    // має підказати саме це, інакше виглядає як загадковий збій.
    throw new AppError(
      "encryption_key_mismatch",
      "Не вдалося розшифрувати збережений ключ. Ймовірно, змінився " +
        "NITRO_ENCRYPTION_KEY — додайте ключ провайдера заново в налаштуваннях.",
      500,
    );
  }
}

/** Хвіст ключа для показу в інтерфейсі. Секрету не розкриває. */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}
