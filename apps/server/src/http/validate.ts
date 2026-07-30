import { z, type ZodType } from "zod";
import { AppError } from "./errors";

/**
 * Розбирає тіло запиту за zod-схемою й перетворює помилку валідації
 * у звичайний AppError, який app.onError віддасть у форматі ApiError.
 */
export function parseBody<TSchema extends ZodType>(
  schema: TSchema,
  body: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(body);

  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") || "body";

    throw new AppError(
      "validation_error",
      `${path}: ${issue?.message ?? "некоректні дані"}`,
      422,
    );
  }

  return result.data;
}

/** Читає JSON із запиту, віддаючи зрозумілу помилку на битому тілі. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("invalid_json", "Тіло запиту не є валідним JSON");
  }
}
