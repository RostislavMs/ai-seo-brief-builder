const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

/** «щойно», «12 хв тому», «3 год тому», далі — дата. */
export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);

  if (minutes < 1) return "щойно";
  if (minutes < 60) return `${minutes} хв тому`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} год тому`;

  return formatDateTime(iso);
}

/** 2400 → «2 400» — довгі числа читаються легше з розділювачем. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("uk-UA").format(value);
}

/** Правильна форма іменника: 1 сторінка, 2 сторінки, 5 сторінок. */
export function plural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
