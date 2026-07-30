import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ALL_LANGUAGES, LANGUAGES, type LanguageRuleCount } from "@brief/shared";
import { plural } from "../../lib/format";
import { ALL_LANGUAGES_LABEL, scopeName, scopeNativeName } from "../../lib/ruleScope";
import { Badge } from "../ui/Badge";
import { ChevronDownIcon, SearchIcon } from "../ui/Icon";

/**
 * Вибір області дії правила: «Усі мови» або одна з 183 мов ISO 639-1.
 *
 * Комбобокс із пошуком, а не <select>: у нативного списку з 183 рядків
 * знайти шведську можна лише прокруткою або набором точної англійської
 * назви. Тут пошук іде і за англійською назвою, і за самоназвою, і за кодом —
 * «svenska», «Swedish» і «sv» ведуть в одне місце.
 *
 * Мови, для яких правила вже є, стоять зверху й помічені кількістю: працюють
 * щодня з двома-трьома, а решта 180 потрібна раз на місяць.
 */

interface Option {
  code: string;
  name: string;
  native: string | null;
  count: LanguageRuleCount | null;
}

function matches(option: Option, needle: string): boolean {
  if (!needle) return true;

  return (
    option.name.toLowerCase().includes(needle) ||
    (option.native?.toLowerCase().includes(needle) ?? false) ||
    option.code === needle
  );
}

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
  const listId = useId();
  const inputId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo<Option[]>(() => {
    const byCode = new Map(counts.map((count) => [count.languageCode, count]));

    const languages: Option[] = LANGUAGES.map((language) => ({
      code: language.code,
      name: language.name,
      native: language.nativeName,
      count: byCode.get(language.code) ?? null,
    }));

    // Мови з правилами — зверху, у решті лишається алфавітний порядок реєстру.
    const withRules = languages.filter((option) => option.count);
    const rest = languages.filter((option) => !option.count);

    // «Усі мови» першим рядком: це не мова, і губитися серед 183 мов воно
    // не має. Пошуком воно все ж відсіюється — на запит «swed» рядок про
    // всі мови був би шумом.
    return [
      {
        code: ALL_LANGUAGES,
        name: ALL_LANGUAGES_LABEL,
        native: null,
        count: byCode.get(ALL_LANGUAGES) ?? null,
      },
      ...withRules,
      ...rest,
    ];
  }, [counts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => matches(option, needle));
  }, [options, query]);

  // Список змінився — активний рядок міг лишитися за його межами.
  useEffect(() => setActiveIndex(0), [query]);

  // Клік поза комбобоксом закриває його. mousedown, а не click: інакше
  // список зникає вже після того, як браузер обробив натискання по ньому.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Активний рядок тримаємо у видимій частині списку: інакше стрілками
  // можна «піти» за межу вікна й не бачити, де ти.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function choose(code: string): void {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
        return;
      }

      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        const next = index + step;
        if (next < 0) return filtered.length - 1;
        if (next >= filtered.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Enter") {
      const option = filtered[activeIndex];
      if (open && option) {
        event.preventDefault();
        choose(option.code);
      }
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const selectedNative = scopeNativeName(value);
  const selectedLabel = selectedNative
    ? `${scopeName(value)} · ${selectedNative}`
    : scopeName(value);

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-xs font-medium text-muted">
        Область дії правил
      </label>

      <div ref={containerRef} className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />

        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="input pr-8 pl-8"
          value={open ? query : selectedLabel}
          // readOnly у закритому стані: поле показує вибране, а не запит,
          // і випадкове натискання клавіші не має підмінювати підпис.
          readOnly={!open}
          disabled={disabled}
          placeholder={open ? "Назва мови, самоназва або код" : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {/* Без стрілки закрите поле з лупою читається як пошук, а не як
            вибір: видно рядок «Italian · italiano» і незрозуміло, що його
            можна змінити. */}
        <ChevronDownIcon
          className={`pointer-events-none absolute top-1/2 right-2.5 size-4
            -translate-y-1/2 text-subtle transition-transform duration-150
            ${open ? "rotate-180" : ""}`}
        />

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Мови"
            className="card absolute inset-x-0 top-full z-20 mt-1 max-h-72
              overflow-y-auto py-1 shadow-lg"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-subtle">Нічого не знайдено.</li>
            )}

            {filtered.map((option, index) => {
              const label = countLabel(option.count);
              const selected = option.code === value;

              return (
                <li
                  key={option.code}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option.code)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5
                    ${index === activeIndex ? "bg-hover" : ""}
                    ${option.code === ALL_LANGUAGES ? "border-b border-line" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        selected ? "font-medium text-fg" : "text-fg"
                      }`}
                    >
                      {option.name}
                    </span>
                    {option.native && (
                      <span className="block truncate text-2xs text-subtle">
                        {option.native}
                      </span>
                    )}
                  </span>

                  {label && (
                    <span className="shrink-0 text-2xs text-subtle">{label}</span>
                  )}
                  {selected && <Badge tone="accent">вибрано</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-2xs leading-relaxed text-subtle">
        {value === ALL_LANGUAGES
          ? "Ці правила дописуються в промпт для кожного ТЗ, якою б мовою " +
            "не були конкуренти."
          : "Правило діє лише тоді, коли мова проаналізованих сторінок " +
            "збігається з цією. Мова визначається автоматично — вручну " +
            "вона не задається."}
      </p>
    </div>
  );
}
