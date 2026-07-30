import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Badge } from "./Badge";
import { ChevronDownIcon, SearchIcon } from "./Icon";

/**
 * Список вибору з полем пошуку.
 *
 * Нативний `<select>` тут не годиться в трьох місцях застосунку з однієї
 * причини: у ньому немає пошуку. Серед 183 мов ISO шведську знаходять або
 * прокруткою, або точним набором англійської назви; у списку моделей провайдера
 * рядки довгі, згруповані й майже однакові на початку — око чіпляється за
 * «Gemini», а відрізняються вони хвостом.
 *
 * Один компонент на всі три випадки навмисно: клавіатура, закриття по кліку
 * поза списком, прокрутка активного рядка у видиму частину й `aria` — це
 * приблизно двісті рядків, які в трьох копіях розійшлися б у поведінці.
 * Варіативність виведена в дані опції, а не в пропси-прапорці.
 */

export interface ComboboxOption {
  value: string;
  /** Головний рядок. */
  label: string;
  /** Другий рядок дрібнішим: самоназва мови, ідентифікатор моделі. */
  hint?: string | null;
  /** Праворуч приглушеним: ціна, кількість правил. */
  meta?: string | null;
  /** Праворуч бейджем — для мітки на кшталт «рекомендована». */
  badge?: ReactNode;
  /** Заголовок групи. Опції з однаковим значенням стоять під ним разом. */
  group?: string;
  /** Додатковий текст для пошуку: код мови, синоніми назви. */
  keywords?: string;
  /** Лінія під рядком — відділяє «Авто» чи «Усі мови» від решти. */
  separated?: boolean;
}

function matches(option: ComboboxOption, needle: string): boolean {
  if (!needle) return true;

  return (
    option.label.toLowerCase().includes(needle) ||
    (option.hint?.toLowerCase().includes(needle) ?? false) ||
    (option.keywords?.toLowerCase().includes(needle) ?? false) ||
    option.value.toLowerCase() === needle
  );
}

interface ComboboxProps {
  label: string;
  value: string;
  options: readonly ComboboxOption[];
  onChange: (value: string) => void;
  /** Підпис, коли `value` немає серед опцій: модель могла зникнути з переліку. */
  missingLabel?: (value: string) => string;
  placeholder?: string;
  disabled?: boolean;
  /** Пояснення під полем. */
  children?: ReactNode;
}

export function Combobox({
  label,
  value,
  options,
  onChange,
  missingLabel,
  placeholder = "Почніть вводити назву",
  disabled = false,
  children,
}: ComboboxProps) {
  const listId = useId();
  const inputId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) => matches(option, needle));
  }, [options, query]);

  const selected = options.find((option) => option.value === value) ?? null;

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

  function choose(next: string): void {
    onChange(next);
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
        choose(option.value);
      }
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const closedLabel = selected
    ? selected.hint
      ? `${selected.label} · ${selected.hint}`
      : selected.label
    : value
      ? (missingLabel?.(value) ?? value)
      : "";

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-xs font-medium text-muted">
        {label}
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
          // Поле пошуку — не логін. Ім'я навмисно унікальне й без жодного
          // натяку на «email», «user» чи «login»: саме за ім'ям, підписом
          // і сусідством із полем-паролем браузер вирішує, що поле означає,
          // і колись підставляв сюди пошту акаунта.
          name={`picker-${inputId.replace(/[^a-zA-Z0-9]/g, "")}`}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          spellCheck={false}
          className="input pr-8 pl-8"
          value={open ? query : closedLabel}
          // readOnly у закритому стані: поле показує вибране, а не запит,
          // і випадкове натискання клавіші не має підмінювати підпис.
          readOnly={!open}
          disabled={disabled || options.length === 0}
          placeholder={open ? placeholder : undefined}
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
            aria-label={label}
            className="card absolute inset-x-0 top-full z-20 mt-1 max-h-72
              overflow-y-auto py-1 shadow-lg"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-subtle">
                Нічого не знайдено.
              </li>
            )}

            {filtered.map((option, index) => {
              const active = index === activeIndex;
              const chosen = option.value === value;
              // Заголовок групи — лише коли група змінилася: інакше він
              // повторювався б над кожним рядком.
              const groupStart =
                option.group && option.group !== filtered[index - 1]?.group;

              return (
                // Fragment, а не обгортка: всередині ul можуть стояти лише li,
                // тому заголовок групи й рядок опції — сусіди, а не вкладені.
                <Fragment key={option.value}>
                  {groupStart && (
                    <li
                      role="presentation"
                      className="px-3 pt-2 pb-1 text-2xs font-medium
                        tracking-wide text-subtle uppercase"
                    >
                      {option.group}
                    </li>
                  )}

                  <li
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={chosen}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option.value)}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-1.5
                      ${active ? "bg-hover" : ""}
                      ${option.separated ? "border-b border-line" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${
                          chosen ? "font-medium text-fg" : "text-fg"
                        }`}
                      >
                        {option.label}
                      </span>
                      {option.hint && (
                        <span className="num block truncate text-2xs text-subtle">
                          {option.hint}
                        </span>
                      )}
                    </span>

                    {option.meta && (
                      <span className="num shrink-0 text-2xs text-subtle">
                        {option.meta}
                      </span>
                    )}
                    {option.badge}
                    {chosen && <Badge tone="accent">вибрано</Badge>}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>

      {children}
    </div>
  );
}
