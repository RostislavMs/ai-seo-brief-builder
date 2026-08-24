import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

/**
 * Поле ТЗ, яке правиться на місці.
 *
 * `contenteditable` на тому самому елементі, яким текст і показувався, — а не
 * `input` чи `textarea`, і це не косметика. Копіювання ТЗ у документ збирає
 * розмітку панелі ([copySelection.ts](../../../lib/copySelection.ts)), і поля
 * введення воно пропускає навмисно (SKIP_TAGS) — тобто з `input` кожне
 * редаговане значення зникло б із того, що райтер вставляє в Google Docs.
 * Елемент із `contenteditable` лишається звичайним елементом із текстом, тому
 * і збирач документа, і верстка не помічають, що поле стало редагованим.
 *
 * Текст живе в DOM, а не в стані React: під час набору джерело правди —
 * елемент. Перемальовка з новим значенням зсувала б каретку в початок рядка на
 * кожній літері, а перемальовок тут вистачає — ТЗ зберігається саме, і поряд
 * оновлюються і позначки, і суми обсягів.
 */

const COMMIT_DELAY_MS = 500;

/** Теги, якими текст ТЗ і так показувався. */
export type EditableTag = "span" | "p" | "div" | "h4" | "td" | "th" | "li";

/**
 * Роль тексту в документі для райтера.
 *
 * Ці позначки читає збирач документа: `em` — інструкція англійською (у Docs
 * стає курсивом), `strong` — підпис переліку. Поле мусить нести їх на собі,
 * а не на обгортці: обгортка в документ не потрапляє, і без них інструкція
 * приїхала б у Docs звичайним абзацом, нічим не відрізняючись від тексту
 * статті.
 */
export type CopyRole = "em" | "strong";

interface InlineEditableProps {
  /** Що показувати. Потрапляє в DOM лише поки поле не в фокусі. */
  text: string;
  /**
   * Готовий текст після набору. Викликається не на кожній літері, а з
   * затримкою й на втраті фокусу: правка одразу йде в стан сесії, і
   * перемальовувати все ТЗ на кожне натискання клавіші немає потреби.
   */
  onCommit: (text: string) => void;
  as?: EditableTag;
  className?: string;
  /** Показується, поки поле порожнє. Правило в styles.css. */
  placeholder?: string;
  /** Назва поля для скрінрідера: без неї це просто текст без підпису. */
  label: string;
  lang?: string;
  title?: string;
  /** Роль тексту в документі для райтера — курсив або підпис. */
  copy?: CopyRole;
  /**
   * false — не зберігати під час набору, лише на завершенні правки.
   *
   * Так працюють діапазони: «100-1» на півдорозі до «100-150» — не проміжний
   * стан, а інше значення, і зберігати його означало б показати користувачеві
   * власну помилку в сумі обсягів.
   */
  commitOnInput?: boolean;
  /**
   * Зміна числа перезаписує текст у полі з `text`, навіть якщо саме `text` не
   * змінився. Потрібне рівно для одного випадку: набране не розпізналося
   * (діапазон), і в полі має знову з'явитися попереднє значення.
   */
  sync?: number;
}

/**
 * Однорядковий текст: перенесення рядка в ТЗ не буває — ні в заголовку, ні
 * в інструкції, ні в пункті списку. Тому Enter завершує правку, а не додає
 * рядок, і вставлений із буфера текст склеюється в один рядок.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function InlineEditable({
  text,
  onCommit,
  as: Tag = "span",
  className,
  placeholder,
  label,
  lang,
  title,
  copy,
  commitOnInput = true,
  sync = 0,
}: InlineEditableProps) {
  const ref = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);

  /**
   * Значення іззовні — у DOM, але лише поки поле не в фокусі. Це і є та сама
   * межа: поза фокусом правду знає React (правка з чату, повернення до
   * машинної версії, зсув індексів після видалення сусіда), у фокусі — DOM.
   *
   * useLayoutEffect, а не useEffect: React малює елемент порожнім, і текст
   * у нього кладемо ми. Зі звичайним ефектом браузер устигав би показати
   * порожній кадр — тобто все ТЗ блимало б пустими полями на кожному
   * відкритті вкладки.
   */
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || node === document.activeElement) return;
    if (node.textContent !== text) node.textContent = text;
  }, [text, sync]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function commit(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }

    const node = ref.current;
    if (!node) return;

    const next = oneLine(node.textContent ?? "");
    if (next !== text) onCommit(next);
  }

  function schedule(): void {
    if (!commitOnInput) return;

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, COMMIT_DELAY_MS);
  }

  function keyDown(event: KeyboardEvent<HTMLElement>): void {
    const node = ref.current;

    if (event.key === "Enter") {
      event.preventDefault();
      node?.blur();
      return;
    }

    // Esc повертає те, що було до правки. Це не «повернути машинну версію»
    // (для неї є окрема кнопка), а звичайне скасування набору.
    if (event.key === "Escape") {
      event.preventDefault();
      if (node) node.textContent = text;
      node?.blur();
    }
  }

  function paste(event: ClipboardEvent<HTMLElement>): void {
    // execCommand застарілий, але єдиний, хто вставляє текст у точку каретки
    // й лишає це в історії скасування браузера. Заміни на нього досі немає,
    // тому там, де його немає, вставку робить браузер сам: plaintext-only
    // однаково не пустить розмітку, і різниця лишиться тільки в перенесеннях
    // рядків.
    if (typeof document.execCommand !== "function") return;

    // Саме перенесення рядків і прибираємо: рядок тут один.
    event.preventDefault();
    document.execCommand(
      "insertText",
      false,
      oneLine(event.clipboardData.getData("text/plain")),
    );
  }

  return (
    <Tag
      ref={ref as never}
      contentEditable="plaintext-only"
      role="textbox"
      aria-label={label}
      aria-multiline={false}
      data-placeholder={placeholder}
      data-copy-em={copy === "em" ? "" : undefined}
      data-copy-strong={copy === "strong" ? "" : undefined}
      lang={lang}
      title={title}
      className={`editable ${className ?? ""}`}
      onInput={schedule}
      onBlur={commit}
      onKeyDown={keyDown}
      onPaste={paste}
    />
  );
}
