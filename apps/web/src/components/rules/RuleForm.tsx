import { useId, useState } from "react";
import { ALL_LANGUAGES } from "@brief/shared";
import { scopeName } from "../../lib/ruleScope";
import { Spinner } from "../ui/Spinner";
import { PlusIcon } from "../ui/Icon";

/**
 * Додавання правила.
 *
 * Одна форма на обидві ролі: адмін створює чинне правило, користувач —
 * пропозицію. Різниця лише в підписах, бо різницю робить сервер, і
 * дублювати її двома компонентами означало б розійтися в них із часом.
 */

/** Та сама межа, що в схемі бази й у валідації маршруту. */
const MAX_LENGTH = 500;

/** Приклади показують форму правила, а не пояснюють її словами. */
const PLACEHOLDER_LANGUAGE =
  "Наприклад: звертатися до читача на «ти», а не на «Ви».\n" +
  "Або: назви розділів давати без слова «Огляд».";

const PLACEHOLDER_ALL =
  "Наприклад: у заголовках H2 не ставити крапку в кінці.\n" +
  "Або: у FAQ не більше шести питань.";

interface RuleFormProps {
  languageCode: string;
  isAdmin: boolean;
  busy: boolean;
  /** Повертає true, якщо правило збереглося — тоді поле очищається. */
  onSubmit: (rule: string) => Promise<boolean>;
}

export function RuleForm({
  languageCode,
  isAdmin,
  busy,
  onSubmit,
}: RuleFormProps) {
  const id = useId();
  const [text, setText] = useState("");

  const forAll = languageCode === ALL_LANGUAGES;
  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 3 && !busy;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    if (await onSubmit(trimmed)) setText("");
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="card space-y-3 p-4 sm:p-5"
    >
      <div>
        <h3 className="text-sm font-semibold">
          {isAdmin ? "Нове правило" : "Запропонувати правило"}
          {" — "}
          <span className={forAll ? "text-accent" : "text-muted"}>
            {scopeName(languageCode)}
          </span>
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-subtle">
          {isAdmin
            ? forAll
              ? "Почне діяти одразу для всіх ТЗ, якою б мовою не були конкуренти."
              : `Почне діяти одразу для ТЗ мовою ${scopeName(languageCode)}.`
            : "Пропозицію розглянуть адміністратори. Доки її не схвалено, " +
              "на генерацію ТЗ вона не впливає."}
        </p>
      </div>

      <label htmlFor={id} className="sr-only">
        Текст правила
      </label>
      <textarea
        id={id}
        className="input min-h-24 resize-y leading-relaxed"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={forAll ? PLACEHOLDER_ALL : PLACEHOLDER_LANGUAGE}
        maxLength={MAX_LENGTH}
        disabled={busy}
        // Ctrl/Cmd+Enter надсилає: у полі з переносами звичайний Enter
        // має лишатися переносом.
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          {busy ? <Spinner tone="on-accent" /> : <PlusIcon />}
          {isAdmin ? "Додати правило" : "Запропонувати"}
        </button>

        {/* Лічильник показуємо лише на підході до межі: постійне число
            під полем читається як вимога набрати саме стільки. */}
        {text.length > MAX_LENGTH - 100 && (
          <span className="num text-2xs text-subtle">
            {text.length} / {MAX_LENGTH}
          </span>
        )}
      </div>
    </form>
  );
}
