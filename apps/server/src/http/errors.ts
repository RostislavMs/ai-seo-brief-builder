import type { ApiError } from "@brief/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Помилка з машинозчитуваним кодом. Усе, що кидається навмисно,
 * має бути AppError — решта потрапляє в 500 через app.onError.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: ContentfulStatusCode;

  constructor(code: string, message: string, status: ContentfulStatusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function toApiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

/**
 * Користувач обірвав запит: натиснув «Скасувати» або пішов зі сторінки.
 *
 * Не збій, тому окремий код і жодного запису в лог. Статус тут майже
 * формальність — адресата відповіді вже немає; 499, яким nginx позначає
 * закрите клієнтом зʼєднання, типи Hono не приймають, тому лишається 400.
 */
export function abortedError(): AppError {
  return new AppError("request_aborted", "Запит скасовано.", 400);
}
