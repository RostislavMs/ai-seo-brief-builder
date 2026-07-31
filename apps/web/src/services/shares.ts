import type {
  PublicShare,
  PublicShareResponse,
  PublishShareRequest,
  SessionShare,
  ShareResponse,
  SharedSections,
} from "@brief/shared";
import { api } from "../lib/api";

/**
 * Публічна версія сесії.
 *
 * Публікується вибір розділів, а не вміст: зліпок збирає сервер із тієї сесії,
 * якою користувач володіє. Тому тут немає нічого, крім трьох викликів.
 */

/**
 * Публікує сесію або перезаписує зліпок наявної публічної версії.
 * Токен при оновленні не змінюється — надіслане посилання лишається живим.
 */
export async function publishShare(
  sessionId: string,
  sections: SharedSections,
): Promise<SessionShare> {
  const request: PublishShareRequest = sections;
  const response = await api.put<ShareResponse>(
    `/sessions/${sessionId}/share`,
    request,
  );

  return response.share;
}

/** Прибирає сесію з публічного доступу. Посилання після цього не працює. */
export function unpublishShare(sessionId: string): Promise<void> {
  return api.delete(`/sessions/${sessionId}/share`);
}

/**
 * Читає опубліковану сесію за токеном.
 *
 * Єдиний виклик застосунку, який працює без входу: `api` просто не додасть
 * заголовок Authorization, якщо токена сесії немає.
 */
export async function loadPublicShare(
  token: string,
  signal?: AbortSignal,
): Promise<PublicShare> {
  const response = await api.get<PublicShareResponse>(
    `/public/shares/${encodeURIComponent(token)}`,
    signal,
  );

  return response.share;
}

/** Повна адреса публічної сторінки — те, що копіює користувач. */
export function shareUrl(token: string): string {
  return new URL(`/p/${token}`, window.location.origin).toString();
}
