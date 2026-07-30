import type { ApiError } from "@brief/shared";
import { supabase } from "./supabase";

/** Помилка, яку повернув бекенд у форматі ApiError. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiError).error?.message === "string"
  );
}

/**
 * Свіжий токен доступу.
 *
 * getSession() сам оновлює токен, якщо той протермінувався, тому брати
 * значення звідси на кожен запит правильніше, ніж тримати копію в стані
 * React: після довго відкритої вкладки копія вже мертва, а getSession — ні.
 */
async function accessToken(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Єдина обгортка над fetch для всіх звернень до /api.
 * Компоненти не працюють з fetch напряму.
 */
async function request<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const token = await accessToken();
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    // Скасування — не збій мережі. Без цієї гілки відхід зі сторінки
    // або подвійний запуск ефекту в StrictMode виглядав би для
    // користувача як «сервер недоступний».
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiRequestError("aborted", "Запит скасовано", 0);
    }

    throw new ApiRequestError(
      "network_error",
      "Сервер недоступний. Перевірте, що бекенд запущено.",
      0,
    );
  }

  // 204 — тіла немає, і response.json() на ньому кинув би виняток.
  if (response.status === 204) return undefined as TResponse;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiError(payload)) {
      throw new ApiRequestError(
        payload.error.code,
        payload.error.message,
        response.status,
      );
    }
    throw new ApiRequestError(
      "unknown_error",
      `Помилка запиту (${response.status})`,
      response.status,
    );
  }

  return payload as TResponse;
}

export const api = {
  get<TResponse>(path: string, signal?: AbortSignal) {
    return request<TResponse>(path, { method: "GET", signal });
  },

  post<TResponse>(path: string, body: unknown, signal?: AbortSignal) {
    return request<TResponse>(path, {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    });
  },

  put<TResponse>(path: string, body: unknown, signal?: AbortSignal) {
    return request<TResponse>(path, {
      method: "PUT",
      body: JSON.stringify(body),
      signal,
    });
  },

  patch<TResponse>(path: string, body: unknown, signal?: AbortSignal) {
    return request<TResponse>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      signal,
    });
  },

  // Тип відповіді за замовчуванням void: більшість видалень віддає 204.
  // Параметр потрібен тим маршрутам, де видалення повертає новий стан —
  // скидання промпта до початкового тексту, наприклад.
  delete<TResponse = void>(path: string, signal?: AbortSignal) {
    return request<TResponse>(path, { method: "DELETE", signal });
  },
};
