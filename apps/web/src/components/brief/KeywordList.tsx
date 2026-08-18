import { labeledListPayload } from "../../lib/briefDocument";
import { CopyButton } from "../ui/CopyButton";

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
      <div className="flex items-baseline justify-between gap-2">
        <p lang="en" data-copy-strong className="text-2xs text-subtle">
          {label}
        </p>

        <CopyButton
          payload={() => labeledListPayload(keywords, label)}
          label="Копіювати список ключів"
        />
      </div>

      {/* Нумерація — нативна (::marker), а не окремим span: інакше при
          копіюванні номер приїжджає текстом і подвоюється, а сам список
          вставляється абзацами. */}
      <ol
        className="mt-1 list-decimal space-y-0.5 ps-5 text-xs leading-relaxed
          text-fg marker:font-mono marker:text-faint"
      >
        {keywords.map((keyword, index) => (
          <li key={`${index}-${keyword}`}>{keyword}</li>
        ))}
      </ol>
    </div>
  );
}
