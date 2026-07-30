import { useMemo } from "react";
import { ALL_LANGUAGES, LANGUAGES, type LanguageRuleCount } from "@brief/shared";
import { plural } from "../../lib/format";
import { ALL_LANGUAGES_LABEL, scopeName, scopeNativeName } from "../../lib/ruleScope";
import { Combobox, type ComboboxOption } from "../ui/Combobox";

/**
 * Вибір області дії правила: «Усі мови» або одна з 183 мов ISO 639-1.
 *
 * Комбобокс із пошуком, а не <select>: у нативного списку з 183 рядків
 * знайти шведську можна лише прокруткою або набором точної англійської
 * назви. Пошук іде і за англійською назвою, і за самоназвою, і за кодом —
 * «svenska», «Swedish» і «sv» ведуть в одне місце.
 *
 * Мови, для яких правила вже є, стоять зверху й помічені кількістю: працюють
 * щодня з двома-трьома, а решта 180 потрібна раз на місяць.
 */

function countLabel(count: LanguageRuleCount | null): string | null {
  if (!count) return null;

  const parts: string[] = [];

  if (count.active > 0) {
    parts.push(
      `${count.active} ${plural(count.active, "правило", "правила", "правил")}`,
    );
  }

  if (count.pending > 0) parts.push(`${count.pending} на розгляді`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

interface LanguagePickerProps {
  value: string;
  counts: readonly LanguageRuleCount[];
  onChange: (code: string) => void;
  disabled?: boolean;
}

export function LanguagePicker({
  value,
  counts,
  onChange,
  disabled = false,
}: LanguagePickerProps) {
  const options = useMemo<ComboboxOption[]>(() => {
    const byCode = new Map(counts.map((count) => [count.languageCode, count]));

    const toOption = (code: string, name: string, native: string): ComboboxOption => ({
      value: code,
      label: name,
      hint: native,
      keywords: code,
      meta: countLabel(byCode.get(code) ?? null),
    });

    // Мови з правилами — зверху, у решті лишається алфавітний порядок реєстру.
    const withRules: ComboboxOption[] = [];
    const rest: ComboboxOption[] = [];

    for (const language of LANGUAGES) {
      const option = toOption(language.code, language.name, language.nativeName);
      (byCode.has(language.code) ? withRules : rest).push(option);
    }

    // «Усі мови» першим рядком: це не мова, і губитися серед 183 мов воно
    // не має. Пошуком воно все ж відсіюється — на запит «swed» рядок про
    // всі мови був би шумом.
    return [
      {
        value: ALL_LANGUAGES,
        label: ALL_LANGUAGES_LABEL,
        meta: countLabel(byCode.get(ALL_LANGUAGES) ?? null),
        separated: true,
      },
      ...withRules,
      ...rest,
    ];
  }, [counts]);

  const selectedNative = scopeNativeName(value);

  return (
    <Combobox
      label="Область дії правил"
      value={value}
      options={options}
      onChange={onChange}
      missingLabel={() =>
        selectedNative ? `${scopeName(value)} · ${selectedNative}` : scopeName(value)
      }
      placeholder="Назва мови, самоназва або код"
      disabled={disabled}
    >
      <p className="text-2xs leading-relaxed text-subtle">
        {value === ALL_LANGUAGES
          ? "Ці правила дописуються в промпт для кожного ТЗ, якою б мовою " +
            "не були конкуренти."
          : "Правило діє лише тоді, коли мова проаналізованих сторінок " +
            "збігається з цією. Мову видно у вкладці «Аналіз» — там її можна " +
            "й виправити вручну, якщо визначено неправильно."}
      </p>
    </Combobox>
  );
}
