import type { BriefBlock, BriefBlockKind, Range } from "@brief/shared";
import {
  BLOCK_LABEL,
  ORDERED_KINDS,
  blockPayload,
} from "../../lib/briefDocument";
import { newLink, type BriefPath } from "../../lib/briefEdit";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { useBriefEdit } from "./edit/BriefEditContext";
import { AddButton, ItemControls } from "./edit/Controls";
import { EditableRange, EditableText } from "./edit/Editable";
import { EditableInstruction } from "./edit/EditableInstruction";

/** Порожній діапазон для полів, яких модель у блоці не заповнила. */
const EMPTY_RANGE: Range = { min: 0, max: 0 };

/** Типи, в яких перелік пунктів і каркас таблиці є за визначенням. */
const ITEM_KINDS: ReadonlySet<BriefBlockKind> = new Set<BriefBlockKind>([
  "list",
  "ordered_list",
  "questions",
  "template",
]);

const TABLE_KINDS: ReadonlySet<BriefBlockKind> = new Set<BriefBlockKind>([
  "table",
  "template",
]);

interface PartProps {
  block: BriefBlock;
  /** Шлях до самого блоку: ["structure", 2, "blocks", 0]. */
  path: BriefPath;
}

function Items({ block, path }: PartProps) {
  const edit = useBriefEdit();

  if (block.items.length === 0 && !edit.editable) return null;

  const ordered = ORDERED_KINDS.has(block.kind);
  const Tag = ordered ? "ol" : "ul";
  const items: BriefPath = [...path, "items"];

  return (
    <>
      {/*
       * Маркер — нативний ::marker, а не намальований span у flex-рядку.
       * Виглядає так само (той самий висячий відступ), але переживає копіювання:
       * зі span'ом Google Docs вставляв абзаци з дублем «•» замість списку.
       */}
      <Tag
        className={`mt-2 space-y-1 ps-5 text-xs leading-relaxed text-muted
          marker:text-faint ${ordered ? "list-decimal marker:font-mono" : "list-disc"}`}
      >
        {block.items.map((item, index) => (
          // Ключ за індексом: за текстом React перестворював би пункт на
          // кожній літері, і поле губило б каретку разом із фокусом.
          <li key={index}>
            <EditableText
              path={[...items, index]}
              value={item}
              label="пункт"
              placeholder="пункт"
            />
            <ItemControls
              path={items}
              index={index}
              count={block.items.length}
              noun="пункт"
            />
          </li>
        ))}
      </Tag>

      <AddButton path={items} item={() => ""}>
        Додати пункт
      </AddButton>
    </>
  );
}

/**
 * Таблиця з порожніми клітинками: заповнює її райтер, ТЗ задає лише каркас.
 * Для kind="template" цей самий каркас повторюється в описі кожної сутності.
 *
 * Правляться назви колонок і підписи рядків — тобто той самий каркас. Порожні
 * клітинки не редагуються навмисно: вони порожні не тому, що їх не заповнили,
 * а тому, що заповнювати їх — робота райтера.
 */
function Table({ block, path }: PartProps) {
  const edit = useBriefEdit();

  if (block.columns.length === 0 && !edit.editable) return null;

  const columns: BriefPath = [...path, "columns"];
  const rows: BriefPath = [...path, "rows"];

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-2xs">
        <thead>
          <tr>
            {block.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="border border-line bg-surface px-2 py-1.5 font-medium text-muted"
              >
                <EditableText
                  path={[...columns, index]}
                  value={column}
                  label="назва колонки"
                  placeholder="колонка"
                />
                <ItemControls
                  path={columns}
                  index={index}
                  count={block.columns.length}
                  noun="колонку"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              <th
                scope="row"
                className="border border-line px-2 py-2 text-left font-medium text-muted"
              >
                <EditableText
                  path={[...rows, index]}
                  value={row}
                  label="підпис рядка"
                  placeholder="рядок"
                />
                <ItemControls
                  path={rows}
                  index={index}
                  count={block.rows.length}
                  noun="рядок"
                />
              </th>
              {block.columns.slice(1).map((_, cell) => (
                <td key={cell} className="border border-line px-2 py-2" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        <AddButton path={columns} item={() => ""}>
          Додати колонку
        </AddButton>
        <AddButton path={rows} item={() => ""}>
          Додати рядок
        </AddButton>
      </div>
    </div>
  );
}

/**
 * Анкор і адреса: райтер має поставити саме ці посилання, а не свої.
 *
 * Більшість рядків — внутрішнє перелінкування, і адреси в них немає: сторінку
 * свого сайту добирає SEO-фахівець, а не райтер. У колонці тоді стоїть «#» —
 * так само, як у ТЗ, з якими райтер працює; порожня клітинка на цьому місці
 * читалася б як недороблене ТЗ.
 */
function Links({ block, path }: PartProps) {
  const edit = useBriefEdit();
  const links = block.links ?? [];

  if (links.length === 0 && !edit.editable) return null;

  const list: BriefPath = [...path, "links"];

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-2xs">
        <thead>
          <tr>
            <th
              lang="en"
              scope="col"
              className="border border-line bg-surface px-2 py-1.5 font-medium text-muted"
            >
              Anchor Text
            </th>
            <th
              lang="en"
              scope="col"
              className="border border-line bg-surface px-2 py-1.5 font-medium text-muted"
            >
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          {links.map((link, index) => (
            <tr key={index}>
              <td className="border border-line px-2 py-2 text-fg">
                <EditableText
                  path={[...list, index, "anchor"]}
                  value={link.anchor}
                  label="анкор"
                  placeholder="анкор"
                />
                <ItemControls
                  path={list}
                  index={index}
                  count={links.length}
                  noun="посилання"
                />
              </td>
              <td className="border border-line px-2 py-2">
                {edit.editable ? (
                  // У правці адреса — таке саме поле, як решта, і порожнє
                  // означає внутрішнє посилання. Тому замість «#» тут
                  // підказка: інакше в порожню клітинку неможливо клікнути,
                  // а «#» користувач стирав би руками.
                  <EditableText
                    path={[...list, index, "url"]}
                    value={link.url}
                    className="num break-all text-accent"
                    label="адреса посилання"
                    placeholder="порожньо — внутрішнє"
                  />
                ) : link.url ? (
                  // rel обов'язковий: це зовнішнє джерело, назване моделлю.
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="num break-all text-accent underline"
                  >
                    {link.url}
                  </a>
                ) : (
                  <span
                    className="num text-faint"
                    title="Внутрішнє посилання — цільову сторінку добирає SEO-фахівець"
                  >
                    #
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AddButton path={list} item={newLink}>
        Додати посилання
      </AddButton>
    </div>
  );
}

interface BlockViewProps {
  block: BriefBlock;
  /** Шлях до блоку в ТЗ. */
  path: BriefPath;
  /** Позиція серед блоків розділу — для переставляння й видалення. */
  index: number;
  count: number;
}

/** Один блок розділу. Вигляд визначає kind; нерелевантні поля просто порожні. */
export function BlockView({ block, path, index, count }: BlockViewProps) {
  const edit = useBriefEdit();
  // Шлях до масиву блоків — на один крок вище за сам блок.
  const list = path.slice(0, -1);
  const counted = block.kind === "pros_cons" || block.kind === "template";

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div data-copy-strong className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{BLOCK_LABEL[block.kind]}</Badge>

          {(block.kind === "template" || block.itemWordCount) && (
            <span className="num text-2xs text-subtle">
              <EditableRange
                path={[...path, "itemWordCount"]}
                value={block.itemWordCount ?? EMPTY_RANGE}
                label="обсяг одного опису"
              />{" "}
              сл. на опис
            </span>
          )}

          {counted && (
            <>
              {/* «+» і «−» поруч із кольором: без знаків рядки розрізняв би
                  лише зелений проти червоного — найгірша пара для дальтоніків. */}
              <span className="num text-2xs text-success">
                +{" "}
                <EditableRange
                  path={[...path, "prosCount"]}
                  value={block.prosCount ?? EMPTY_RANGE}
                  label="кількість переваг"
                />
              </span>
              <span className="num text-2xs text-danger">
                −{" "}
                <EditableRange
                  path={[...path, "consCount"]}
                  value={block.consCount ?? EMPTY_RANGE}
                  label="кількість недоліків"
                />
              </span>
            </>
          )}
        </div>

        <span className="flex items-center gap-1">
          <ItemControls path={list} index={index} count={count} noun="блок" />

          <CopyButton
            payload={() => blockPayload(block)}
            label={`Копіювати блок: ${BLOCK_LABEL[block.kind]}`}
          />
        </span>
      </div>

      <EditableInstruction
        path={[...path, "instruction"]}
        text={block.instruction}
        scope="блоку"
      />

      {(block.kind === "template" || block.itemTemplate !== undefined) && (
        <EditableText
          as="p"
          path={[...path, "itemTemplate"]}
          value={block.itemTemplate ?? ""}
          className="num mt-2 rounded-inset border border-line bg-surface px-2
            py-1.5 text-2xs leading-relaxed text-muted"
          label="шаблон заголовка опису"
          placeholder="H3: №. {Brand Name} — {short description}"
        />
      )}

      {/* Виділення — мовою контенту, тому тон інший, ніж в англійської
          інструкції: інакше два різномовні блоки виглядали б однаково. */}
      {(block.kind === "highlight" ||
        (block.text?.trim() ?? "").length > 0) && (
        <EditableText
          as="p"
          path={[...path, "text"]}
          value={block.text ?? ""}
          className="mt-2 rounded-inset border border-info-line bg-info-soft px-3
            py-2 text-xs leading-relaxed text-info"
          label="текст виділення"
          placeholder="речення, яке треба виділити"
        />
      )}

      {/*
       * Що показувати — за даними або за типом блоку, і в обох режимах
       * однаково. «За даними» потрібне тому, що в шаблоні опису співіснують
       * і пункти, і каркас таблиці, а модель могла заповнити не все. «За
       * типом» — щоб у правці порожній перелік лишався на місці: інакше в
       * щойно доданий блок нічого не додати. Порожнім у режимі перегляду
       * не показується нічого — це вирішує сам вкладений компонент.
       */}
      {(block.items.length > 0 || ITEM_KINDS.has(block.kind)) && (
        <Items block={block} path={path} />
      )}
      {(block.columns.length > 0 ||
        block.rows.length > 0 ||
        TABLE_KINDS.has(block.kind)) && <Table block={block} path={path} />}
      {((block.links?.length ?? 0) > 0 || block.kind === "links") && (
        <Links block={block} path={path} />
      )}
    </div>
  );
}
