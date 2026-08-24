import type { BriefBlockKind } from "@brief/shared";
import { BLOCK_LABEL } from "../../../lib/briefDocument";
import { newBlock, type BriefPath } from "../../../lib/briefEdit";
import { ChevronDownIcon, PlusIcon, TrashIcon, UndoIcon } from "../../ui/Icon";
import { useBriefEdit } from "./BriefEditContext";

/**
 * Керування правкою: повернути машинне значення, переставити, видалити,
 * додати.
 *
 * Усе це кнопки, і саме тому вони не потрапляють у документ для райтера:
 * збирач розмітки пропускає BUTTON цілком
 * ([copySelection.ts](../../../lib/copySelection.ts), SKIP_TAGS). Атрибут
 * `data-copy-skip` на обгортках стоїть про запас — на випадок, коли обгортка
 * колись перестане бути лише обгорткою.
 *
 * Видимі завжди, а не при наведенні: на дотикових екранах наведення немає,
 * і кнопка, якої не видно, не існує. Через це вони навмисно тихі — колір
 * найтихішого тексту, розмір іконки 3.5, і жодного тла, поки на них не
 * навели.
 */

/** Спільний вигляд усіх дрібних кнопок правки — той самий, що в CopyButton. */
const QUIET =
  "-my-1 inline-flex shrink-0 items-center justify-center self-center " +
  "rounded-inset px-1.5 py-1 text-faint transition-colors duration-150 " +
  "ease-out hover:bg-hover hover:text-fg disabled:pointer-events-none " +
  "disabled:opacity-30";

interface RevertMarkProps {
  path: BriefPath;
  /** Назва поля — потрапляє в підказку й у скрінрідер. */
  label: string;
}

/**
 * Повернути машинне значення одного поля.
 *
 * Сама поява кнопки і є позначкою «змінено вручну»: вона показується лише
 * там, де значення розійшлося з машинним. Окремого значка поряд немає
 * навмисно — два знаки про одне й те саме в рядку заголовка читалися б як
 * два різні стани.
 *
 * Вирішує сама, чи їй з'являтися, і саме тому її можна поставити де завгодно:
 * поля ТЗ живуть і в рядках із копіюванням, і в комірках таблиць, і в пунктах
 * списків, а перевірка «чи змінено» у кожному з цих місць була б однакова.
 */
export function RevertMark({ path, label }: RevertMarkProps) {
  const edit = useBriefEdit();

  if (!edit.editable || !edit.changed(path)) return null;

  return (
    <button
      type="button"
      data-copy-skip
      className={`${QUIET} text-accent hover:text-accent`}
      title={`Змінено вручну. Повернути те, що написала модель: ${label}`}
      aria-label={`Повернути машинну версію: ${label}`}
      onClick={() => edit.revert(path)}
    >
      <UndoIcon className="size-3" />
    </button>
  );
}

interface ItemControlsProps {
  /** Шлях до масиву, а не до елемента. */
  path: BriefPath;
  index: number;
  /** Скільки елементів у масиві — щоб знати, де межі переставляння. */
  count: number;
  /** Що саме переставляють: «розділ», «пункт», «ключ». Для підказок. */
  noun: string;
  /**
   * false — не показувати переставляння. Так для таблиці ключів: рядки в ній
   * відсортовані за кількістю вживань при показі, тому «вище» й «нижче»
   * означали б не те, що станеться.
   */
  movable?: boolean;
}

/** Переставити вище-нижче й видалити — один набір для будь-якого списку. */
export function ItemControls({
  path,
  index,
  count,
  noun,
  movable = true,
}: ItemControlsProps) {
  const edit = useBriefEdit();

  if (!edit.editable) return null;

  return (
    <span
      data-copy-skip
      className="inline-flex shrink-0 items-center self-center"
    >
      {movable && (
        <>
          <button
            type="button"
            className={QUIET}
            disabled={index === 0}
            title={`Перемістити ${noun} вище`}
            aria-label={`Перемістити ${noun} вище`}
            onClick={() => edit.move(path, index, index - 1)}
          >
            <ChevronDownIcon className="size-3 rotate-180" />
          </button>

          <button
            type="button"
            className={QUIET}
            disabled={index === count - 1}
            title={`Перемістити ${noun} нижче`}
            aria-label={`Перемістити ${noun} нижче`}
            onClick={() => edit.move(path, index, index + 1)}
          >
            <ChevronDownIcon className="size-3" />
          </button>
        </>
      )}

      <button
        type="button"
        className={`${QUIET} hover:text-danger`}
        title={`Видалити ${noun}`}
        aria-label={`Видалити ${noun}`}
        onClick={() => edit.remove(path, index)}
      >
        <TrashIcon className="size-3" />
      </button>
    </span>
  );
}

interface AddButtonProps {
  path: BriefPath;
  /** Куди вставити. За замовчуванням — у кінець списку. */
  index?: number;
  /** Заготовка нового елемента. Функцією: обчислюється лише на кліку. */
  item: () => unknown;
  /** Текст кнопки — «Додати розділ», «Додати ключ». */
  children: string;
}

export function AddButton({ path, index, item, children }: AddButtonProps) {
  const edit = useBriefEdit();

  if (!edit.editable) return null;

  return (
    <button
      type="button"
      data-copy-skip
      className="btn-quiet -mx-2.5 gap-1.5 text-2xs text-faint"
      onClick={() => edit.insert(path, index ?? Number.MAX_SAFE_INTEGER, item())}
    >
      <PlusIcon className="size-3" />
      {children}
    </button>
  );
}

const BLOCK_KINDS = Object.keys(BLOCK_LABEL) as BriefBlockKind[];

interface AddBlockProps {
  /** Шлях до масиву блоків розділу або підрозділу. */
  path: BriefPath;
}

/**
 * Новий блок у розділ. Через `select`, а не через кнопку: блок без типу не
 * існує — від типу залежить і вигляд, і те, які поля в ньому взагалі є.
 *
 * Тип наявного блоку не змінюється навмисно: список і таблиця тримають дані
 * в різних полях, і перемикання типу означало б або втратити набране, або
 * лишити в блоці поля, яких у ньому не має бути. Потрібен інший тип — блок
 * додається заново, а старий видаляється.
 */
export function AddBlock({ path }: AddBlockProps) {
  const edit = useBriefEdit();

  if (!edit.editable) return null;

  return (
    <label className="mt-2 inline-flex items-center gap-1.5 text-2xs text-faint">
      <PlusIcon className="size-3" />
      <span className="sr-only">Додати блок</span>

      <select
        className="cursor-pointer rounded-inset bg-transparent py-0.5 text-2xs
          text-faint hover:text-fg"
        value=""
        onChange={(event) => {
          const kind = event.target.value as BriefBlockKind | "";
          if (!kind) return;

          edit.insert(path, Number.MAX_SAFE_INTEGER, newBlock(kind));
          // Назад у «Додати блок»: інакше наступний блок того самого типу
          // не додався б — значення не змінилося б, і події не було б.
          event.target.value = "";
        }}
      >
        <option value="">Додати блок…</option>
        {BLOCK_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {BLOCK_LABEL[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}
