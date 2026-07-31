import { useState } from "react";
import type { SharedPage } from "@brief/shared";
import { formatNumber, plural } from "../../lib/format";
import { shortenUrl } from "../../lib/url";
import { PageDetails } from "../analysis/PageDetails";
import { SourceBadge } from "../analysis/SourceBadge";

/**
 * Сторінка в публічній версії.
 *
 * Рядок навмисно схожий на той, що у вкладці «Аналіз», але без чекбокса й
 * статусу: у зліпок потрапляють лише успішно розібрані сторінки, які пішли в
 * основу ТЗ, — статус у всіх один, а вибирати склад читачеві нема чого.
 *
 * Адреса — посилання: перше, що робить читач із переліком конкурентів, —
 * відкриває їх.
 */
export function SharedPageCard({ item }: { item: SharedPage }) {
  const [open, setOpen] = useState(false);
  const page = item.page;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="num truncate text-xs text-muted underline
                decoration-line-strong underline-offset-2
                transition-colors duration-150 ease-out hover:text-fg"
            >
              {shortenUrl(item.url, 70)}
            </a>
            <SourceBadge
              source={page.meta.source}
              archivedAt={page.meta.archivedAt}
              hideDirect
            />
          </div>

          <p className="num mt-1 text-2xs text-subtle">
            {formatNumber(page.wordCount)} слів · {page.headings.length}{" "}
            {plural(
              page.headings.length,
              "заголовок",
              "заголовки",
              "заголовків",
            )}
            {page.tables.length > 0 && ` · ${page.tables.length} табл.`}
            {page.faq.length > 0 && ` · ${page.faq.length} FAQ`}
          </p>
        </div>

        <button
          type="button"
          className="btn-quiet shrink-0"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Згорнути" : "Деталі"}
        </button>
      </div>

      {open && <PageDetails page={page} />}
    </div>
  );
}

export function SharedPageList({ pages }: { pages: readonly SharedPage[] }) {
  return (
    <div className="space-y-3">
      <p className="num text-xs text-subtle">
        {pages.length} {plural(pages.length, "сторінка", "сторінки", "сторінок")}{" "}
        в основі ТЗ
      </p>

      <div className="space-y-2">
        {/* Ключ із індексом: дві різні адреси сесії можуть після редиректів
            вести на ту саму сторінку, і тоді url перестає бути унікальним. */}
        {pages.map((item, index) => (
          <SharedPageCard key={`${index}-${item.url}`} item={item} />
        ))}
      </div>
    </div>
  );
}
