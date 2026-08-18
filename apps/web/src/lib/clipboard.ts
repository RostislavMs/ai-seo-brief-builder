/**
 * Копіювання з форматуванням.
 *
 * У буфер кладеться два представлення одразу: text/html і text/plain. Який
 * узяти, вирішує вже редактор — Google Docs і Word беруть HTML і будують із
 * нього справжні заголовки, списки й таблиці; звичайне поле вводу бере текст.
 * Тому одна кнопка працює і там, і там, а Ctrl+Shift+V у Docs вставляє
 * markdown-варіант.
 */

/**
 * Запасний шлях — виділення прихованого вузла і `execCommand("copy")`.
 *
 * Потрібен там, де сучасного `clipboard.write()` немає: Safari до 13.1,
 * і будь-який браузер на http поза localhost. Форматування він зберігає,
 * бо копіює живий DOM, а не рядок.
 */
function copyViaSelection(html: string): boolean {
  const holder = document.createElement("div");
  holder.innerHTML = html;

  // За межами екрана, але у потоці документа: display:none і visibility:hidden
  // ховають вміст і від Selection — копіювати не було б чого.
  holder.setAttribute(
    "style",
    "position:fixed;top:0;left:-9999px;width:1px;overflow:hidden",
  );
  document.body.append(holder);

  const selection = window.getSelection();
  // Виділення користувача треба повернути: копіювання не має «зʼїдати» те,
  // що людина щойно виділила на сторінці.
  const saved =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  try {
    const range = document.createRange();
    range.selectNodeContents(holder);

    selection?.removeAllRanges();
    selection?.addRange(range);

    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    selection?.removeAllRanges();
    if (saved) selection?.addRange(saved);
    holder.remove();
  }
}

/** true — щось таки лягло в буфер. */
export async function copyFormatted(
  html: string,
  text: string,
): Promise<boolean> {
  if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          // Тип блоба має збігатися з ключем символ у символ, інакше Chrome
          // відхиляє запис — тому charset живе всередині самої розмітки.
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);

      return true;
    } catch {
      // Найчастіше — вкладка втратила фокус або сторінка не в захищеному
      // контексті. Обидва випадки лікує запасний шлях нижче.
    }
  }

  if (copyViaSelection(html)) return true;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Тільки звичайний текст — коли форматування не потрібне за задумом. */
export async function copyPlain(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
