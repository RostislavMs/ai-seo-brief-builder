import type { SeoBrief } from "@brief/shared";
import { valuePayload } from "../../lib/briefDocument";
import { CopyButton } from "../ui/CopyButton";
import { Instruction } from "../ui/Instruction";

/**
 * Рекомендовані межі довжини. Google обрізає довші значення у видачі,
 * тому лічильник символів тут не декоративний.
 */
const LIMITS = {
  title: { min: 30, max: 60 },
  description: { min: 140, max: 160 },
} as const;

interface FieldProps {
  label: string;
  value: string;
  limits?: { min: number; max: number };
}

function Field({ label, value, limits }: FieldProps) {
  const length = value.length;
  const inRange = limits
    ? length >= limits.min && length <= limits.max
    : true;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span data-copy-strong className="text-xs font-medium text-subtle">
          {label}
        </span>

        <span className="flex items-baseline gap-1">
          {limits && (
            // Крім кольору, вихід за межі показує сам лічильник «N / max» —
            // тобто інформація не тримається лише на зеленому проти жовтого.
            // У документі він зайвий: там уже готове значення, а не чернетка.
            <span
              data-copy-skip
              className={`num text-2xs ${inRange ? "text-success" : "text-warn"}`}
              title={`Рекомендовано ${limits.min}–${limits.max} символів`}
            >
              {length} / {limits.max}
            </span>
          )}

          <CopyButton
            payload={() => valuePayload(value)}
            label={`Копіювати: ${label}`}
          />
        </span>
      </div>

      <p className="panel px-3 py-2 text-sm leading-relaxed text-fg">
        {value}
      </p>
    </div>
  );
}

interface MetaBlockProps {
  brief: SeoBrief;
}

export function MetaBlock({ brief }: MetaBlockProps) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 data-copy-heading="2" className="text-sm font-semibold">
          Основна інформація
        </h3>
        {/* Мову визначено автоматично, тому її треба показувати:
            інакше помилка визначення буде невидимою. */}
        <span className="num text-2xs text-subtle">
          мова контенту:{" "}
          <span className="text-accent">{brief.contentLanguage}</span>
        </span>
      </div>

      <Instruction text={brief.instruction} />

      <Field
        label="Рекомендований Title"
        value={brief.recommendedTitle}
        limits={LIMITS.title}
      />
      <Field
        label="Рекомендований Meta Description"
        value={brief.recommendedMetaDescription}
        limits={LIMITS.description}
      />
      <Field label="Рекомендований H1" value={brief.recommendedH1} />
    </section>
  );
}
