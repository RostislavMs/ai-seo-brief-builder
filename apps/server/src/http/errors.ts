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
