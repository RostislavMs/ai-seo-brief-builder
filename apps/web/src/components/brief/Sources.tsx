import { sourcesPayload } from "../../lib/briefDocument";
import { plural } from "../../lib/format";
import { CopyButton } from "../ui/CopyButton";
import { Instruction } from "../ui/Instruction";

interface SourcesProps {
  /** Адреси сторінок, які пішли в основу ТЗ. */
  sources: readonly string[];
}

/**
 * Сторінки конкурентів, з яких складено ТЗ.
 *
 * Дубль вкладки «Аналіз» лише на перший погляд: там це робочий список зі
 * статусами й перемикачем «брати за основу», тут — частина документа, який
 * піде райтеру. Райтер вкладки не бачить, а читати конкурентів перед
 * написанням має, тому список стоїть у самому ТЗ — так само, як у ТЗ
 * агентства він стоїть першим блоком.
 *
 * Показуються тільки ті сторінки, що реально пішли в промпт: виключені
 * в основу ТЗ не входять, і давати райтеру читати їх нема підстав.
 */
export function Sources({ sources }: SourcesProps) {
  if (sources.length === 0) return null;

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 data-copy-heading="2" className="text-sm font-semibold">
          Сторінки конкурентів
        </h3>

        <span className="flex items-baseline gap-2">
          <span className="num text-2xs text-subtle">
            {sources.length}{" "}
            {plural(sources.length, "сторінка", "сторінки", "сторінок")}
          </span>
          <CopyButton
            payload={() => sourcesPayload(sources)}
            label="Копіювати список конкурентів"
          />
        </span>
      </div>

      <Instruction text="Read the competitors' pages in full before you start writing." />

      <ul className="list-disc space-y-1 ps-5 text-xs leading-relaxed marker:text-faint">
        {sources.map((url) => (
          <li key={url}>
            {/* rel обовʼязковий: це чужі сторінки, які ми ж і аналізували. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer nofollow"
              className="num break-all text-accent underline"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
