import { labeledListPayload } from "../../lib/briefDocument";
import type { BriefPath } from "../../lib/briefEdit";
import { CopyButton } from "../ui/CopyButton";
import { useBriefEdit } from "./edit/BriefEditContext";
import { AddButton, ItemControls } from "./edit/Controls";
import { EditableText } from "./edit/Editable";

interface KeywordListProps {
  /** Шлях до масиву ключів: вступ, розділ або підрозділ. */
  path: BriefPath;
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
  path,
  keywords,
  label = "Use the following keywords in this section:",
}: KeywordListProps) {
  const edit = useBriefEdit();

  // Порожній перелік у режимі правки лишається на місці: інакше ключі не було
  // б куди додати — ні в щойно доданий розділ, ні в той, з якого їх прибрали.
  if (keywords.length === 0 && !edit.editable) return null;

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
          // Ключ за індексом, а не за текстом: інакше React перестворював би
          // елемент на кожній літері, і поле губило б каретку разом із фокусом.
          <li key={index}>
            <EditableText
              path={[...path, index]}
              value={keyword}
              label="ключ"
              placeholder="ключ"
            />
            <ItemControls
              path={path}
              index={index}
              count={keywords.length}
              noun="ключ"
            />
          </li>
        ))}
      </ol>

      <AddButton path={path} item={() => ""}>
        Додати ключ
      </AddButton>
    </div>
  );
}
