import { z } from "zod";
import type { Range } from "@brief/shared";

/**
 * Діапазон «від-до». Живе тут, а не всередині схеми ТЗ, бо ним користуються
 * і ТЗ, і порівняння власної сторінки, а описи полів читає модель — дві
 * копії розійшлися б у формулюваннях і дали б різну поведінку.
 */
export const rangeSchema = z
  .object({
    min: z.number().int().describe("Lower bound"),
    max: z.number().int().describe("Upper bound, greater than or equal to min"),
  })
  .describe("A from-to range, never a single exact number");

/** Компіляційна гарантія збігу з типом із @brief/shared. */
type SchemaMatchesType =
  z.infer<typeof rangeSchema> extends Range
    ? Range extends z.infer<typeof rangeSchema>
      ? true
      : never
    : never;

const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;
