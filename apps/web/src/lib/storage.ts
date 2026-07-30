/**
 * Типізована обгортка над localStorage та sessionStorage.
 * Уся робота зі сховищем іде через цей модуль — компоненти
 * не звертаються до localStorage напряму.
 */

export class StorageQuotaError extends Error {
  constructor() {
    super(
      "Сховище браузера заповнене. Видаліть старі сесії, щоб продовжити роботу.",
    );
    this.name = "StorageQuotaError";
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      // Стара назва, яку досі повертає Safari.
      error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function readJson<T>(storage: Storage, key: string, fallback: T): T {
  let raw: string | null;

  try {
    raw = storage.getItem(key);
  } catch {
    // Сховище може бути недоступним (приватний режим, вимкнені куки).
    return fallback;
  }

  if (raw === null) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Пошкоджені дані не мають ламати застосунок — краще почати з чистого.
    console.warn(`[storage] пошкоджені дані під ключем ${key}, скидаю`);
    try {
      storage.removeItem(key);
    } catch {
      /* нічого не поробиш */
    }
    return fallback;
  }
}

export function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (isQuotaError(error)) throw new StorageQuotaError();
    throw error;
  }
}

export function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* нічого не поробиш */
  }
}
