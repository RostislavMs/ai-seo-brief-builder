import type { SessionShare, SharedSections } from "@brief/shared";
import type { AppConfig } from "../../config";
import { AppError } from "../../http/errors";
import { resolvePromptSet } from "../prompts/repository";
import { assertOwner, getSession } from "../sessions/repository";
import { deleteShare, saveShare } from "./repository";
import { buildSnapshot, isEmptySnapshot } from "./snapshot";

/**
 * Публікація сесії: єдине місце, де сходяться сесія і її публічна версія.
 *
 * Окремим файлом, а не в repository.ts, щоб залежності лишалися в один бік.
 * Сесія читає свою публічну версію (sessions/repository → shares/repository),
 * тому зворотний імпорт звідти дав би коло; тут же читання сесії — прямий
 * і єдиний напрямок.
 */

export async function publishShare(
  config: AppConfig,
  userId: string,
  sessionId: string,
  sections: SharedSections,
): Promise<SessionShare> {
  // getSession — не зайва вага, а сама суть операції: зліпок збирається з
  // повної сесії, і вона ж перевіряє власника. Заодно спрацьовує звірка
  // збереженого ТЗ і звіту зі схемами, тому в публічну версію не потрапить
  // те, що застосунок уже вважає застарілим форматом.
  // Сесія й чинні тексти — паралельно: зліпок потребує обох, і одне одного
  // вони не чекають.
  const [session, prompts] = await Promise.all([
    getSession(config, userId, sessionId),
    resolvePromptSet(config),
  ]);

  const snapshot = buildSnapshot(
    session,
    sections,
    prompts["document.requirements"],
  );

  if (isEmptySnapshot(snapshot)) {
    throw new AppError(
      "share_empty",
      "Публікувати ще нема чого: згенеруйте ТЗ або виберіть розділ, у якому " +
        "є результати.",
      400,
    );
  }

  return saveShare(config, sessionId, {
    sections,
    snapshot,
    // updatedAt сесії, а не поточний час: саме з ним потім порівнюється стан
    // сесії, щоб сказати, що опубліковане відстало. Час публікації окремо —
    // його ставить сама база.
    capturedAt: session.updatedAt,
  });
}

export async function unpublishShare(
  config: AppConfig,
  userId: string,
  sessionId: string,
): Promise<void> {
  // Тут повна сесія не потрібна — достатньо перевірити власника.
  await assertOwner(config, userId, sessionId);
  await deleteShare(config, sessionId);
}
