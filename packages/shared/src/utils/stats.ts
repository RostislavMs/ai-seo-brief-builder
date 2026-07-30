/**
 * Медіана — орієнтир по конкурентах і в ТЗ, і в порівнянні власної сторінки.
 *
 * Не середнє: один лонгрід на 12 000 слів серед п'яти двотисячних зрушує
 * середнє так, що орієнтуватися на нього неможливо, а медіана лишається
 * там, де насправді стоїть ринок.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}
