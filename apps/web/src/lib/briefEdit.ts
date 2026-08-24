import type {
  BriefBlock,
  BriefBlockKind,
  BriefH2,
  BriefH3,
  BriefH4,
  BriefKeyword,
  BriefLink,
  BriefOptionalAddition,
  Range,
} from "@brief/shared";
import { normalizeRange } from "@brief/shared";

/**
 * Правка ТЗ за шляхом до поля.
 *
 * ТЗ — не текст, а дерево на чотири рівні заглиблення (SeoBrief), і редагується
 * воно на місці, у тій самій розмітці, якою читається. Тому кожна правка
 * описується не «яке поле», а «який шлях»: `["structure", 3, "children", 1,
 * "title"]`. Компонент, що малює заголовок H3, знає свій шлях і не знає нічого
 * про решту ТЗ — ні про сесію, ні про збереження.
 *
 * Заміна робиться копіюванням гілки, а не мутацією: ТЗ лежить у стані React,
 * і зміна на місці не викликала б перемальовки. Копіюється лише шлях від
 * кореня до поля — решта дерева лишається тими самими об'єктами.
 *
 * Значення — `unknown`, а не типізовані перевантаження на кожне поле: шлях
 * будується в розмітці й перевірити його типом усе одно не вийде. Натомість
 * усе, що записується, приходить із редакторів рядка й діапазону, а результат
 * звіряється зі схемою ТЗ на сервері (PUT /api/sessions/:id/brief) — тобто
 * зіпсована структура не потрапить у базу навіть при помилці в шляху.
 */

export type BriefPath = readonly (string | number)[];

type Node = Record<string | number, unknown>;

function copy(node: unknown): Node {
  return (Array.isArray(node) ? [...node] : { ...(node as object) }) as Node;
}

/** Значення за шляхом або undefined, якщо шляху в дереві немає. */
export function valueAt(root: unknown, path: BriefPath): unknown {
  let node: unknown = root;

  for (const step of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Node)[step];
  }

  return node;
}

/** Копія дерева зі зміненим значенням за шляхом. */
export function withValue<T>(root: T, path: BriefPath, value: unknown): T {
  if (path.length === 0) return value as T;

  const [head, ...rest] = path;
  const next = copy(root);
  next[head as string | number] =
    rest.length === 0 ? value : withValue(next[head as string | number], rest, value);

  return next as T;
}

/** Масив за шляхом. Порожній, якщо шлях веде не в масив. */
function arrayAt(root: unknown, path: BriefPath): readonly unknown[] {
  const value = valueAt(root, path);
  return Array.isArray(value) ? value : [];
}

export function withInserted<T>(
  root: T,
  path: BriefPath,
  index: number,
  item: unknown,
): T {
  const list = [...arrayAt(root, path)];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, item);

  return withValue(root, path, list);
}

export function withRemoved<T>(root: T, path: BriefPath, index: number): T {
  const list = [...arrayAt(root, path)];
  if (index < 0 || index >= list.length) return root;

  list.splice(index, 1);
  return withValue(root, path, list);
}

/**
 * Переставляння сусідів — те, що стоїть за кнопками «вище» й «нижче».
 *
 * Вихід за межі списку не помилка, а нормальний стан: у першого рядка немає
 * «вище», і кнопка в такому разі просто нічого не робить (у розмітці вона ще
 * й вимкнена).
 */
export function withMoved<T>(
  root: T,
  path: BriefPath,
  from: number,
  to: number,
): T {
  const list = [...arrayAt(root, path)];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return root;

  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);

  return withValue(root, path, list);
}

/**
 * Чи розійшлося значення за шляхом із машинною версією.
 *
 * Порівняння за значенням, а не за посиланням: після правки копіюється лише
 * шлях до зміненого поля, тому решта гілок — ті самі об'єкти, але покладатися
 * на це не можна. Структурна правка (додали розділ посередині) зсуває індекси,
 * і сусіди позначаються зміненими — це не помилка порівняння, а правда: за
 * шляхом `["structure", 4]` тепер справді інший розділ.
 */
export function changedAt(
  brief: unknown,
  original: unknown,
  path: BriefPath,
): boolean {
  if (original === null || original === undefined) return false;
  return !same(valueAt(brief, path), valueAt(original, path));
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => same(item, b[index]));
  }

  const left = a as Node;
  const right = b as Node;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    if (!same(left[key], right[key])) return false;
  }

  return true;
}

/**
 * Діапазон із того, що набрав користувач.
 *
 * Приймає і «100-150», і «100 – 150», і «150»: у ТЗ діапазон пишуть через
 * дефіс, але однакові межі показуються одним числом (formatRange), і набрати
 * назад теж мають право одне.
 *
 * `null` — не розпізнано. Викликач тоді лишає попереднє значення: діапазон,
 * зіпсований на півслові, гірший за той, що був, а місця для повідомлення про
 * помилку в рядку заголовка немає.
 */
export function parseRange(text: string): Range | null {
  const parts = text
    .replace(/\s/g, "")
    .split(/[-–—]/)
    .filter((part) => part.length > 0);

  if (parts.length === 0 || parts.length > 2) return null;
  if (parts.some((part) => !/^\d+$/.test(part))) return null;

  const min = Number(parts[0]);
  const max = parts.length === 2 ? Number(parts[1]) : min;

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  return normalizeRange({ min, max });
}

/* ── Нові елементи ────────────────────────────────────────────────────────── */

/**
 * Заготовки для «додати».
 *
 * Порожні навмисно: підказки в порожніх полях уже кажуть, що там пишуть, а
 * вигаданий текст-заповнювач («Новий розділ») довелося б стирати руками — і
 * рано чи пізно він поїхав би в документ для райтера.
 *
 * Обсяг нового розділу теж нуль, а не «хоч щось»: сума розділів показується
 * поряд із загальним обсягом, і випадкові 100 слів у ній — це розбіжність,
 * яку користувач не просив.
 */
const EMPTY_RANGE: Range = { min: 0, max: 0 };

export function newH4(): BriefH4 {
  return { title: "", instruction: "", wordCount: EMPTY_RANGE };
}

export function newH3(): BriefH3 {
  return {
    title: "",
    instruction: "",
    wordCount: EMPTY_RANGE,
    keywords: [],
    blocks: [],
    children: [],
  };
}

export function newH2(): BriefH2 {
  return {
    title: "",
    instruction: "",
    wordCount: EMPTY_RANGE,
    keywords: [],
    blocks: [],
    children: [],
  };
}

/**
 * Новий блок. Поля, нерелевантні для типу, лишаються порожніми — так само,
 * як у блоках від моделі: схема плоска, і кожен `kind` користується своїм
 * набором полів.
 *
 * Необов'язкові поля заповнюються саме там, де без них блок не показує нічого:
 * у таблиці — перша колонка й перший рядок, у посиланнях — один рядок, у
 * виділенні — сам текст. Інакше щойно доданий блок виглядав би як зламаний.
 */
export function newBlock(kind: BriefBlockKind): BriefBlock {
  const base: BriefBlock = {
    kind,
    instruction: "",
    items: [],
    columns: [],
    rows: [],
  };

  switch (kind) {
    case "list":
    case "ordered_list":
    case "questions":
      return { ...base, items: [""] };
    case "table":
      return { ...base, columns: [""], rows: [""] };
    case "highlight":
      return { ...base, text: "" };
    case "links":
      return { ...base, links: [newLink()] };
    case "pros_cons":
      return { ...base, prosCount: EMPTY_RANGE, consCount: EMPTY_RANGE };
    case "template":
      return {
        ...base,
        items: [""],
        columns: [""],
        rows: [""],
        itemTemplate: "",
        itemWordCount: EMPTY_RANGE,
        prosCount: EMPTY_RANGE,
        consCount: EMPTY_RANGE,
      };
  }
}

export function newLink(): BriefLink {
  return { anchor: "", url: "" };
}

export function newKeyword(): BriefKeyword {
  return { keyword: "", usage: EMPTY_RANGE };
}

export function newAddition(): BriefOptionalAddition {
  return {
    placement: "h2",
    title: "",
    section: "",
    wordCount: EMPTY_RANGE,
    instruction: "",
  };
}
