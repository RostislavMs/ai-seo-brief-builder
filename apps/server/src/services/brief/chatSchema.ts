import { z } from "zod";
import { seoBriefSchema } from "./schema";

/**
 * Схема відповіді на репліку чату.
 *
 * `action` — дискримінатор, яким модель сама повідомляє, чи були правки:
 * на питання «чому такий обсяг?» переписувати все ТЗ не потрібно й шкідливо
 * (зайві токени плюс ризик непроханих змін). Тому `brief` необовʼязковий,
 * а звʼязок «edit ⇒ brief присутній» перевіряється в коді:
 * anyOf у responseJsonSchema підтримують не всі провайдери.
 */
export const chatReplySchema = z.object({
  action: z
    .enum(["answer", "edit"])
    .describe(
      "answer — користувач лише питає, ТЗ не змінюється; " +
        "edit — потрібні правки, поверни повне оновлене ТЗ у полі brief",
    ),
  reply: z
    .string()
    .describe(
      "Коротка відповідь користувачеві живою мовою: що саме змінено або відповідь на питання",
    ),
  brief: seoBriefSchema
    .optional()
    .describe("Повне оновлене ТЗ. Обовʼязкове при action=edit, інакше пропусти"),
});

export type ChatReply = z.infer<typeof chatReplySchema>;

export function toChatResponseSchema(): unknown {
  const jsonSchema = z.toJSONSchema(chatReplySchema, {
    reused: "inline",
  }) as Record<string, unknown>;

  delete jsonSchema["$schema"];
  return jsonSchema;
}
