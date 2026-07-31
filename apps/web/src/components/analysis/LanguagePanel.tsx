import { useMemo } from "react";
import type { LanguageDetection, PageAnalysis } from "@brief/shared";
import {
  LANGUAGES,
  detectContentLanguage,
  languageName,
  resolveContentLanguage,
  usablePages,
} from "@brief/shared";
import { plural } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Combobox, type ComboboxOption } from "../ui/Combobox";

/**
 * Мова контенту на вкладці «Аналіз».
 *
 * Раніше вона зʼявлялася вперше в готовому ТЗ — тобто вже після того, як нею
 * написано все: заголовки, ключі, FAQ. Помилка виявлялася на найдорожчому кроці,
 * і виправити її можна було тільки перегенерацією.
 *
 * Тому мова показується тут, разом із підставами. `<html lang>` не бреше, і
 * коли його мають усі сторінки, питання закрите. А от резервний шлях — характерні
 * літери в заголовках — саме вгадує: італійські й французькі діакритики
 * перетинаються, тож сторінка без `lang` може отримати чужу мову. Видно, який шлях
 * спрацював, скільки сторінок за нього проголосувало і чи вони між собою згодні.
 *
 * Визначення обчислюється тією самою функцією з `@brief/shared`, що працює й на
 * сервері під час генерації. Друга реалізація показувала б одну мову, а в промпт
 * ішла б інша — і розбіжність не мала б де проявитися.
 */

const AUTO = "auto";

function sourceLabel(detection: LanguageDetection): string {
  if (detection.source === "tag") {
    return `з атрибута <html lang> — ${detection.agreed} з ${detection.tagged} ` +
      `${plural(detection.tagged, "сторінки", "сторінок", "сторінок")}`;
  }

  if (detection.source === "text") {
    return "за характерними літерами в заголовках — атрибута <html lang> немає";
  }

  return "не визначено — ні атрибута <html lang>, ні характерних літер";
}

interface LanguagePanelProps {
  analyses: readonly PageAnalysis[];
  /** Перевизначення з сесії. null — довіряємо визначеному. */
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
}

export function LanguagePanel({
  analyses,
  value,
  onChange,
  disabled = false,
}: LanguagePanelProps) {
  /**
   * Рівно ті сторінки, які піде в промпт: без виключених вручну й без
   * порожніх. Другий фільтр повторює `generateBrief()` не випадково —
   * визначення тут має братися з того самого набору, інакше виключення
   * сторінки змінювало б мову на сервері, а панель показувала б колишню.
   */
  const pages = useMemo(
    () => usablePages(analyses).filter((page) => page.wordCount > 0),
    [analyses],
  );

  const detection = useMemo(() => detectContentLanguage(pages), [pages]);
  const resolved = resolveContentLanguage(detection, value);

  const options = useMemo<ComboboxOption[]>(() => {
    const auto: ComboboxOption = {
      value: AUTO,
      label: `Визначати автоматично${pages.length > 0 ? ` — ${detection.name}` : ""}`,
      hint: null,
      separated: true,
      keywords: "авто auto визначати",
    };

    return [
      auto,
      ...LANGUAGES.map((language) => ({
        value: language.code,
        label: language.name,
        hint: language.nativeName,
        keywords: language.code,
      })),
    ];
  }, [detection.name, pages.length]);

  // Порожній список сторінок — визначати ще нічого: до першого успішного
  // парсингу будь-яка мова тут була б вигадкою.
  if (pages.length === 0) return null;

  return (
    <section className="card space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">
          Мова контенту: {resolved.name}
        </h3>

        {resolved.overridden ? (
          <Badge tone="accent">задано вручну</Badge>
        ) : detection.source === "tag" && detection.conflicts.length === 0 ? (
          <Badge tone="success">визначено надійно</Badge>
        ) : (
          <Badge tone="warn">визначено приблизно</Badge>
        )}
      </div>

      <p className="text-2xs leading-relaxed text-subtle">
        Цією мовою модель напише весь контент ТЗ — заголовки, ключі, FAQ — і за
        нею ж підбираються правила для мов. Визначено {sourceLabel(detection)}.
        {detection.conflicts.length > 0 && (
          <>
            {" "}
            Решта сторінок називає{" "}
            <span className="num">
              {detection.conflicts.map((code) => languageName(code)).join(", ")}
            </span>
            .
          </>
        )}
        {resolved.overridden && (
          <> Автовизначення дало {detection.name} — його перебито вручну.</>
        )}
      </p>

      <Combobox
        label="Мова, якою складати ТЗ"
        value={value ?? AUTO}
        options={options}
        onChange={(next) => onChange(next === AUTO ? null : next)}
        placeholder="Назва мови, самоназва або код"
        disabled={disabled}
      >
        <p className="text-2xs leading-relaxed text-subtle">
          Вибір зберігається в сесії й переживає повторний аналіз. Він діє і на
          ТЗ, і на аналіз власної сторінки — мова в сесії одна.
        </p>
      </Combobox>
    </section>
  );
}
