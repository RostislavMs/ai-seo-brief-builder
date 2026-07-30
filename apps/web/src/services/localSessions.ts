import type { Session, SessionSummary } from "@brief/shared";
import { readJson, removeKey } from "../lib/storage";
import { migrateSession } from "./sessionMigration";

/**
 * Сесії, що лишилися в localStorage від версії без акаунтів.
 *
 * Модуль існує рівно для одного сценарію: перенести їх в акаунт і забути.
 * Нічого сюди більше не пишеться — новий код працює тільки з API.
 */

const INDEX_KEY = "brief.sessions.index";
const sessionKey = (id: string): string => `brief.session.${id}`;

function store(): Storage {
  return window.localStorage;
}

/** Скільки локальних сесій лежить у браузері. Дешева перевірка для банера. */
export function countLocalSessions(): number {
  return readJson<SessionSummary[]>(store(), INDEX_KEY, []).length;
}

/**
 * Читає локальні сесії, приводячи їх до поточного формату.
 * Пошкоджені пропускаються: одна бита сесія не має зривати перенесення решти.
 */
export function readLocalSessions(): Session[] {
  const index = readJson<SessionSummary[]>(store(), INDEX_KEY, []);
  const sessions: Session[] = [];

  for (const summary of index) {
    const raw = readJson<unknown>(store(), sessionKey(summary.id), null);
    if (raw === null) continue;

    const migrated = migrateSession(raw);
    if (migrated) sessions.push(migrated.session);
  }

  return sessions;
}

/** Прибирає локальні сесії після успішного перенесення. */
export function clearLocalSessions(): void {
  const index = readJson<SessionSummary[]>(store(), INDEX_KEY, []);

  for (const summary of index) {
    removeKey(store(), sessionKey(summary.id));
  }

  removeKey(store(), INDEX_KEY);
}
