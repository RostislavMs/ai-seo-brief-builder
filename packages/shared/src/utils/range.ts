import type { Range } from "../types/brief";

/** «100-150», або «150», якщо межі збігаються. */
export function formatRange(range: Range): string {
  return range.min === range.max
    ? String(range.min)
    : `${range.min}-${range.max}`;
}

/** Сума діапазонів: мінімуми з мінімумами, максимуми з максимумами. */
export function sumRanges(ranges: readonly Range[]): Range {
  return ranges.reduce<Range>(
    (total, range) => ({
      min: total.min + range.min,
      max: total.max + range.max,
    }),
    { min: 0, max: 0 },
  );
}

/** Впорядковує межі та відкидає відʼємні значення. */
export function normalizeRange(range: Range): Range {
  const min = Math.max(0, Math.round(range.min));
  const max = Math.max(0, Math.round(range.max));

  return min <= max ? { min, max } : { min: max, max: min };
}
