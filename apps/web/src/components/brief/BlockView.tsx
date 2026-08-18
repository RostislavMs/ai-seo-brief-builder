import type { BriefBlock } from "@brief/shared";
import { formatRange } from "@brief/shared";
import {
  BLOCK_LABEL,
  ORDERED_KINDS,
  blockPayload,
} from "../../lib/briefDocument";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { Instruction } from "../ui/Instruction";

function Items({ block }: { block: BriefBlock }) {
  if (block.items.length === 0) return null;

  const ordered = ORDERED_KINDS.has(block.kind);
  const Tag = ordered ? "ol" : "ul";

  return (
    /*
     * Маркер — нативний ::marker, а не намальований span у flex-рядку.
     * Виглядає так само (той самий висячий відступ), але переживає копіювання:
     * зі span'ом Google Docs вставляв абзаци з дублем «•» замість списку.
     */
    <Tag
      className={`mt-2 space-y-1 ps-5 text-xs leading-relaxed text-muted
        marker:text-faint ${ordered ? "list-decimal marker:font-mono" : "list-disc"}`}
    >
      {block.items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </Tag>
  );
}

/**
 * Таблиця з порожніми клітинками: заповнює її райтер, ТЗ задає лише каркас.
 * Для kind="template" цей самий каркас повторюється в описі кожної сутності.
 */
function Table({ block }: { block: BriefBlock }) {
  if (block.columns.length === 0) return null;

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-2xs">
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border border-line bg-surface px-2 py-1.5 font-medium text-muted"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row}>
              <th
                scope="row"
                className="border border-line px-2 py-2 text-left font-medium text-muted"
              >
                {row}
              </th>
              {block.columns.slice(1).map((column) => (
                <td key={column} className="border border-line px-2 py-2" />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Анкор і адреса: райтер має поставити саме ці посилання, а не свої. */
function Links({ block }: { block: BriefBlock }) {
  if (!block.links?.length) return null;

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
          {block.links.map((link) => (
            <tr key={`${link.url}-${link.anchor}`}>
              <td className="border border-line px-2 py-2 text-fg">
                {link.anchor}
              </td>
              <td className="border border-line px-2 py-2">
                {/* rel обов'язковий: адреси приходять зі сторінок конкурентів. */}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="num break-all text-accent underline"
                >
                  {link.url}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BlockViewProps {
  block: BriefBlock;
}

/** Один блок розділу. Вигляд визначає kind; нерелевантні поля просто порожні. */
export function BlockView({ block }: BlockViewProps) {
  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div data-copy-strong className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{BLOCK_LABEL[block.kind]}</Badge>

          {block.itemWordCount && (
            <span className="num text-2xs text-subtle">
              {formatRange(block.itemWordCount)} сл. на опис
            </span>
          )}

          {(block.kind === "pros_cons" || block.kind === "template") && (
            <>
              {/* «+» і «−» поруч із кольором: без знаків рядки розрізняв би
                  лише зелений проти червоного — найгірша пара для дальтоніків. */}
              {block.prosCount && (
                <span className="num text-2xs text-success">
                  + {formatRange(block.prosCount)}
                </span>
              )}
              {block.consCount && (
                <span className="num text-2xs text-danger">
                  − {formatRange(block.consCount)}
                </span>
              )}
            </>
          )}
        </div>

        <CopyButton
          payload={() => blockPayload(block)}
          label={`Копіювати блок: ${BLOCK_LABEL[block.kind]}`}
        />
      </div>

      <Instruction text={block.instruction} />

      {block.itemTemplate && (
        <p className="num mt-2 rounded-inset border border-line bg-surface px-2 py-1.5 text-2xs leading-relaxed text-muted">
          {block.itemTemplate}
        </p>
      )}

      {/* Виділення — мовою контенту, тому тон інший, ніж в англійської
          інструкції: інакше два різномовні блоки виглядали б однаково. */}
      {block.text?.trim() && (
        <p className="mt-2 rounded-inset border border-info-line bg-info-soft px-3 py-2 text-xs leading-relaxed text-info">
          {block.text}
        </p>
      )}

      <Items block={block} />
      <Table block={block} />
      <Links block={block} />
    </div>
  );
}
