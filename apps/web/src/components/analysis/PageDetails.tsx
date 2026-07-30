import type { ParsedPage } from "@brief/shared";
import { groupHeadings } from "@brief/shared";
import { formatDateTime, formatNumber } from "../../lib/format";
import { Callout } from "../ui/Callout";
import { SourceBadge } from "./SourceBadge";

interface PageDetailsProps {
  page: ParsedPage;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel px-2.5 py-2">
      <div className="num text-sm text-fg">{value}</div>
      <div className="mt-0.5 text-2xs text-subtle">{label}</div>
    </div>
  );
}

/** Результат парсингу однієї сторінки (розділ 11 ТЗ). */
export function PageDetails({ page }: PageDetailsProps) {
  const headings = groupHeadings(page.headings);

  return (
    <div className="space-y-4 border-t border-line px-3 py-4 sm:px-4">
      {page.meta.source === "archive" && (
        <Callout tone="warn" size="xs">
          Сайт закритий від автоматичного доступу, тому взято копію з Wayback
          Machine
          {page.meta.archivedAt && ` від ${formatDateTime(page.meta.archivedAt)}`}
          . Конкурент міг оновити сторінку після цієї дати.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-subtle">Джерело контенту:</span>
        <SourceBadge
          source={page.meta.source}
          archivedAt={page.meta.archivedAt}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Metric label="слів" value={formatNumber(page.wordCount)} />
        <Metric label="H2" value={headings.h2.length} />
        <Metric label="H3" value={headings.h3.length} />
        <Metric label="абзаців" value={page.paragraphs.length} />
        <Metric label="таблиць" value={page.tables.length} />
        <Metric label="FAQ" value={page.faq.length} />
      </div>

      <dl className="space-y-2.5 text-xs">
        <div>
          <dt className="text-subtle">Title</dt>
          <dd className="mt-0.5 leading-relaxed text-fg">
            {page.meta.title ?? "— відсутній"}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Meta Description</dt>
          <dd className="mt-0.5 leading-relaxed text-fg">
            {page.meta.description ?? "— відсутній"}
          </dd>
        </div>
        {page.meta.canonical && (
          <div>
            <dt className="text-subtle">Canonical</dt>
            <dd className="num mt-0.5 break-all text-2xs text-muted">
              {page.meta.canonical}
            </dd>
          </div>
        )}
      </dl>

      {page.headings.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-subtle">Структура заголовків</p>
          <ul className="panel max-h-64 space-y-1 overflow-y-auto p-2.5">
            {page.headings.map((heading, index) => (
              <li
                key={`${index}-${heading.text}`}
                className="text-xs leading-snug text-muted"
                style={{ paddingLeft: `${(heading.level - 1) * 14}px` }}
              >
                <span className="num mr-1.5 text-2xs text-faint">
                  H{heading.level}
                </span>
                {heading.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
