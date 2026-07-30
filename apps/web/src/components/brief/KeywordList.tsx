interface KeywordListProps {
  keywords: readonly string[];
  /** Підпис англійською — це частина ТЗ, яку читає райтер. */
  label?: string;
}

/**
 * Ключі розділу — нумерованим списком, а не чипами.
 *
 * У ТЗ це перелік, який райтер вичитує по пунктах і викреслює. Чипи в рядок
 * читаються як мітки: за ними не видно ні кількості, ні того, що вже вжито.
 */
export function KeywordList({
  keywords,
  label = "Use the following keywords in this section:",
}: KeywordListProps) {
  if (keywords.length === 0) return null;

  return (
    <div>
      <p lang="en" className="text-2xs text-subtle">
        {label}
      </p>

      <ol className="mt-1 space-y-0.5">
        {keywords.map((keyword, index) => (
          <li
            key={`${index}-${keyword}`}
            className="flex gap-2 text-xs leading-relaxed text-fg"
          >
            {/* Номер дублює семантику <ol>, тому для скрінрідера він зайвий. */}
            <span aria-hidden className="num shrink-0 text-faint">
              {index + 1}.
            </span>
            {keyword}
          </li>
        ))}
      </ol>
    </div>
  );
}
