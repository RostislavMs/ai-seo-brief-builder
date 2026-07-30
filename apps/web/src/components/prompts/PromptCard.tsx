import { useState } from "react";
import type { PromptTemplate } from "@brief/shared";
import { formatRelative, plural } from "../../lib/format";
import { Badge } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import { PencilIcon, UndoIcon } from "../ui/Icon";
import { PromptHistory } from "./PromptHistory";

/**
 * Один промпт: текст, вставки й дії над ним.
 *
 * Текст показується моно й цілком, а не обрізаним: промпт читають, щоб
 * зрозуміти, чому ТЗ вийшло саме таким, і згорнутий на трьох рядках він
 * на це питання не відповідає. Довгі промпти прокручуються всередині картки,
 * щоб один із них не витіснив із екрана решту.
 *
 * Дії залежать від ролі: користувач тут лише читає. Промпт впливає на ТЗ
 * усіх, і проміжного стану «на розгляді», як у правил для мов, у нього бути
 * не може — промпт один, і поки він на розгляді, генерувати ТЗ усе одно чимось
 * треба. Тому право правки одне й належить адміну.
 */

/** Та сама межа, що в схемі бази й у валідації маршруту. */
const MAX_LENGTH = 20_000;

type Mode = "view" | "edit" | "history";

/**
 * Довгий текст промпта. Прокручується всередині картки, щоб один промпт
 * на 6 000 символів не витіснив із екрана решту сімох.
 */
function Body({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <pre
      className={`max-h-96 overflow-auto rounded-inset bg-inset px-3 py-2.5
        font-mono text-2xs leading-relaxed whitespace-pre-wrap ${
          muted ? "text-subtle" : "text-muted"
        }`}
    >
      {text}
    </pre>
  );
}

interface PromptCardProps {
  prompt: PromptTemplate;
  isAdmin: boolean;
  busy: boolean;
  onSave: (key: string, body: string, note: string | null) => Promise<boolean>;
  onReset: (key: string) => void;
}

export function PromptCard({
  prompt,
  isAdmin,
  busy,
  onSave,
  onReset,
}: PromptCardProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState(prompt.body);
  const [note, setNote] = useState("");

  /**
   * Початковий текст поряд із чинним. Не окремий режим, а додаток до нього:
   * порівнюють саме два тексти, і показувати їх по черзі означало б тримати
   * різницю в голові.
   */
  const [showDefault, setShowDefault] = useState(false);

  function startEdit(): void {
    setDraft(prompt.body);
    setNote("");
    setMode("edit");
  }

  async function saveEdit(): Promise<void> {
    // Незмінений текст не шлемо: PUT без змін лише додав би в історію
    // редакцію, у якій нічого не змінилося.
    if (draft.trim().length < 10 || draft === prompt.body) {
      setMode("view");
      return;
    }

    if (await onSave(prompt.key, draft, note.trim() || null)) {
      setNote("");
      setMode("view");
    }
  }

  function handleReset(): void {
    if (
      window.confirm(
        `Скинути «${prompt.title}» до початкового тексту? Правку буде видно ` +
          "в історії, і повернути її звідти можна будь-коли.",
      )
    ) {
      onReset(prompt.key);
      setMode("view");
    }
  }

  /** Повернення редакції з історії — це звичайне збереження нового тексту. */
  async function restore(body: string): Promise<void> {
    await onSave(prompt.key, body, "Повернуто редакцію з історії");
  }

  return (
    <li className="card space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold">{prompt.title}</h3>
            {prompt.isDefault ? (
              <Badge tone="neutral">початковий</Badge>
            ) : (
              <Badge tone="warn">змінено</Badge>
            )}
          </div>
          <p className="num mt-0.5 text-2xs text-subtle">{prompt.key}</p>
        </div>

        {/* Лічильник символів поряд із назвою: саме він відповідає на
            «чому промпт став дорожчим», коли текст розрісся. */}
        <p className="num shrink-0 text-2xs text-subtle">
          {prompt.body.length.toLocaleString("uk-UA")} симв.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-subtle">{prompt.description}</p>

      {/* ── Вставки ──────────────────────────────────────────────────────── */}
      <dl className="space-y-1">
        {prompt.variables.map((variable) => (
          <div
            key={variable.name}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          >
            <dt
              className={`num shrink-0 text-2xs ${
                variable.required ? "text-accent" : "text-muted"
              }`}
              // Обовʼязковість позначена не лише кольором: сам знак «*»
              // читається і в скрінрідері, і на чорно-білому екрані.
              title={
                variable.required
                  ? "Обовʼязкова вставка — без неї промпт не збережеться"
                  : "Необовʼязкова вставка"
              }
            >
              {`{{${variable.name}}}`}
              {variable.required && "*"}
            </dt>
            <dd className="min-w-0 flex-1 text-2xs leading-relaxed text-subtle">
              {variable.description}
            </dd>
          </div>
        ))}
      </dl>

      {mode === "edit" ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`prompt-${prompt.key}`}>
            Текст промпта
          </label>
          <textarea
            id={`prompt-${prompt.key}`}
            className="input min-h-96 resize-y font-mono text-xs leading-relaxed"
            value={draft}
            maxLength={MAX_LENGTH}
            disabled={busy}
            spellCheck={false}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            // Ctrl/Cmd+Enter зберігає. Esc тут навмисно не скасовує: у полі
            // на кількасот рядків випадкове натискання коштувало б усієї правки.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void saveEdit();
              }
            }}
          />

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">
              Навіщо змінюєте
            </span>
            <input
              className="input"
              value={note}
              maxLength={500}
              disabled={busy}
              placeholder="Необовʼязково, але в історії лишиться саме це"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={busy || draft.trim().length < 10}
              onClick={() => void saveEdit()}
            >
              {busy && <Spinner tone="on-accent" />}
              Зберегти
            </button>
            <button
              type="button"
              className="btn-quiet"
              disabled={busy}
              onClick={() => setMode("view")}
            >
              Скасувати
            </button>
            <span className="num text-2xs text-subtle">
              {draft.length.toLocaleString("uk-UA")} / {MAX_LENGTH.toLocaleString("uk-UA")}
            </span>
          </div>
        </div>
      ) : (
        <Body text={prompt.body} />
      )}

      {/* Початковий текст — лише для змінених промптів і лише на вимогу:
          для решти він дослівно дорівнює тому, що вже видно вище. */}
      {!prompt.isDefault && mode !== "edit" && (
        <div className="space-y-2">
          <button
            type="button"
            className="btn-quiet px-0 text-2xs"
            onClick={() => setShowDefault(!showDefault)}
          >
            {showDefault ? "Сховати початковий текст" : "Показати початковий текст"}
          </button>

          {showDefault && <Body text={prompt.defaultBody} muted />}
        </div>
      )}

      {mode === "history" && (
        <PromptHistory
          promptKey={prompt.key}
          currentBody={prompt.body}
          revision={prompt.revisions}
          busy={busy}
          onRestore={(body) => void restore(body)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs text-subtle">
          {prompt.isDefault
            ? "Початковий текст із коду"
            : `Змінив ${prompt.updatedByEmail ?? "видалений акаунт"}` +
              (prompt.updatedAt ? ` · ${formatRelative(prompt.updatedAt)}` : "")}
        </p>

        {isAdmin && mode !== "edit" && (
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {busy && <Spinner />}

            <button
              type="button"
              className="btn-quiet gap-1.5"
              disabled={busy}
              onClick={() => setMode(mode === "history" ? "view" : "history")}
            >
              {mode === "history" ? "Сховати історію" : "Історія"}
              {prompt.revisions > 0 && (
                <span className="num text-subtle">
                  {prompt.revisions}{" "}
                  {plural(prompt.revisions, "правка", "правки", "правок")}
                </span>
              )}
            </button>

            {/* Для початкового промпта кнопки немає: скидати нема чого,
                а «Скинути» поряд із бейджем «початковий» читалося б як натяк,
                що щось усе-таки змінено. */}
            {!prompt.isDefault && (
              <button
                type="button"
                className="btn-quiet gap-1.5"
                disabled={busy}
                onClick={handleReset}
              >
                <UndoIcon className="size-3.5" />
                Скинути
              </button>
            )}

            <button
              type="button"
              className="btn-quiet gap-1.5"
              disabled={busy}
              onClick={startEdit}
            >
              <PencilIcon className="size-3.5" />
              Змінити
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
