import { useState } from "react";
import type { Range } from "@brief/shared";
import { formatRange } from "@brief/shared";
import { parseRange, type BriefPath } from "../../../lib/briefEdit";
import { useBriefEdit } from "./BriefEditContext";
import {
  InlineEditable,
  type CopyRole,
  type EditableTag,
} from "./InlineEditable";
import { RevertMark } from "./Controls";

/**
 * Значення ТЗ у розмітці: те саме місце і той самий вигляд, редагується воно
 * чи ні.
 *
 * Обидва компоненти навмисно не мають власної обгортки: у режимі перегляду
 * вони віддають рівно той тег, який був у розмітці до появи правки, а кнопка
 * повернення стає сусідом, а не вкладеним елементом. Інакше кожне поле ТЗ
 * обросло б порожнім span, і горизонтальні ряди «заголовок · обсяг · копіювати»
 * поїхали б по базовій лінії.
 */

interface EditableTextProps {
  /** Шлях до поля в ТЗ. Він же адреса для позначки «змінено» й повернення. */
  path: BriefPath;
  value: string;
  as?: EditableTag;
  className?: string;
  /** Що тут пишуть — видно, поки поле порожнє. */
  placeholder?: string;
  /** Назва поля: підказка, скрінрідер, текст кнопки повернення. */
  label: string;
  lang?: string;
  /** Роль тексту в документі для райтера — курсив або підпис. */
  copy?: CopyRole;
  /**
   * false — не ставити кнопку повернення поряд із текстом.
   *
   * Потрібне там, де поле стоїть окремим абзацом: кнопка після нього поїхала
   * б на власний рядок. Такі місця ставлять `RevertMark` самі — у рядку
   * підпису, поряд із лічильником символів і копіюванням.
   */
  revert?: boolean;
}

export function EditableText({
  path,
  value,
  as: Tag = "span",
  className,
  placeholder,
  label,
  lang,
  copy,
  revert = true,
}: EditableTextProps) {
  const edit = useBriefEdit();

  if (!edit.editable) {
    return (
      <Tag
        className={className}
        lang={lang}
        data-copy-em={copy === "em" ? "" : undefined}
        data-copy-strong={copy === "strong" ? "" : undefined}
      >
        {value}
      </Tag>
    );
  }

  return (
    <>
      <InlineEditable
        text={value}
        onCommit={(text) => edit.set(path, text)}
        as={Tag}
        className={className}
        placeholder={placeholder}
        label={label}
        lang={lang}
        copy={copy}
      />
      {revert && <RevertMark path={path} label={label} />}
    </>
  );
}

interface EditableRangeProps {
  /** Шлях до діапазону — обидві межі правляться одним полем. */
  path: BriefPath;
  value: Range;
  className?: string;
  /** Назва: «обсяг розділу», «вживання ключа». */
  label: string;
}

/**
 * Діапазон правиться так само текстом — «100-150», — а не двома полями чисел.
 *
 * У ТЗ це один показник, і читається він одним рядком; два поля зі стрілками
 * додали б у кожен заголовок по два елементи керування й розбили б рядок
 * «заголовок · обсяг · копіювати», який тримає всю панель.
 *
 * Нерозпізнане просто не зберігається: у рядку заголовка немає місця для
 * повідомлення про помилку, а «100-» на півдорозі до «100-150» — не помилка
 * користувача, а нормальний проміжний стан. Тому в полі знову з'являється
 * попереднє значення, і це достатньо зрозуміла відповідь.
 */
export function EditableRange({
  path,
  value,
  className,
  label,
}: EditableRangeProps) {
  const edit = useBriefEdit();
  const [sync, setSync] = useState(0);
  const text = formatRange(value);

  if (!edit.editable) {
    return <span className={className}>{text}</span>;
  }

  return (
    <>
      <InlineEditable
        text={text}
        sync={sync}
        commitOnInput={false}
        onCommit={(next) => {
          const parsed = parseRange(next);
          if (parsed) edit.set(path, parsed);
          else setSync((count) => count + 1);
        }}
        className={className}
        placeholder="0-0"
        label={label}
      />
      <RevertMark path={path} label={label} />
    </>
  );
}
