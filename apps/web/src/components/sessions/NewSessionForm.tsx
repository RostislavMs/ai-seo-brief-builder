import { useState } from "react";
import { dedupeUrls, looksLikeUrl, parseUrlInput } from "../../lib/url";
import { plural } from "../../lib/format";
import { Callout } from "../ui/Callout";

const MAX_URLS = 10;

interface NewSessionFormProps {
  onCreate: (input: {
    name: string;
    topic: string;
    urls: string[];
    /** Порожній рядок — власної сторінки в цій сесії не буде. */
    ownUrl: string;
  }) => void;
  /** Без обробника кнопка «Скасувати» не показується: на головній форма
      відкрита завжди, і скасовувати там нічого. */
  onCancel?: () => void;
}

/** Позначка обов'язкового поля. aria-hidden: зірочку дублює aria-required. */
function Required() {
  return (
    <span aria-hidden className="ml-0.5 text-danger">
      *
    </span>
  );
}

export function NewSessionForm({ onCreate, onCancel }: NewSessionFormProps) {
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [ownUrl, setOwnUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const urls = dedupeUrls(parseUrlInput(urlsText));
  const invalid = urls.filter((url) => !looksLikeUrl(url));

  function submit(event: React.FormEvent): void {
    event.preventDefault();

    if (topic.trim().length < 2) {
      setError("Вкажіть тему статті — вона визначає весь бриф.");
      return;
    }

    if (urls.length === 0) {
      setError("Додайте хоча б один URL конкурента.");
      return;
    }

    if (invalid.length > 0) {
      setError(`Не схоже на URL: ${invalid.join(", ")}`);
      return;
    }

    const own = ownUrl.trim();

    // Поле необовʼязкове, але заповнене з помилкою — це помилка, а не «пусто»:
    // мовчки відкинути введену адресу гірше, ніж попросити її виправити.
    if (own && !looksLikeUrl(own)) {
      setError(`Не схоже на URL вашої сторінки: ${own}`);
      return;
    }

    setError(null);
    onCreate({
      // Якщо назву не задали, беремо тему — так у списку не буде «Без назви».
      name: name.trim() || topic.trim(),
      topic: topic.trim(),
      urls: urls.slice(0, MAX_URLS),
      ownUrl: own,
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold">Нова сесія</h2>
        <p className="mt-1 text-sm leading-relaxed text-subtle">
          Тема статті та сторінки конкурентів, які вже ранжуються за нею. Якщо
          стаття на цю тему у вас уже є — вкажіть і її.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">
          Тема статті
          <Required />
        </span>
        <input
          className="input"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Наприклад: як вибрати робот-пилосос для квартири"
          aria-required
          autoFocus
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">
          Назва сесії{" "}
          <span className="font-normal text-subtle">— необовʼязково</span>
        </span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="За замовчуванням — тема статті"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">
          URL конкурентів
          <Required />{" "}
          <span className="font-normal text-subtle">
            — по одному на рядок, максимум {MAX_URLS}
          </span>
        </span>
        <textarea
          // inputMode="url" піднімає клавіатуру з «/» і «.» на мобільних.
          inputMode="url"
          className="input min-h-32 font-mono text-base sm:text-xs"
          value={urlsText}
          onChange={(event) => setUrlsText(event.target.value)}
          placeholder={"https://example.com/article\nhttps://competitor.ua/blog/post"}
          aria-required
        />
      </label>

      {urls.length > 0 && (
        <p className="text-xs text-subtle">
          Розпізнано{" "}
          <span className="num text-fg">{urls.length}</span>{" "}
          {plural(urls.length, "URL", "URL", "URL")}
          {invalid.length > 0 && (
            <span className="text-warn">
              {" "}
              · {invalid.length} виглядає некоректно
            </span>
          )}
          {urls.length > MAX_URLS && (
            <span className="text-warn"> · буде взято перші {MAX_URLS}</span>
          )}
        </p>
      )}

      {/*
       * Власна сторінка окремим полем, а не ще одним рядком серед конкурентів:
       * вона й не конкурент, і в ТЗ не йде — інакше бриф склався б у тому
       * числі зі сторінки, яку він має виправити. Стоїть тут, а не лише
       * у вкладці «Моя сторінка», щоб вона парсилася разом із конкурентами.
       */}
      <label className="block space-y-1.5 border-t border-line pt-5">
        <span className="text-xs font-medium text-muted">
          Ваша сторінка{" "}
          <span className="font-normal text-subtle">— необовʼязково</span>
        </span>
        <input
          inputMode="url"
          className="input font-mono text-base sm:text-xs"
          value={ownUrl}
          onChange={(event) => setOwnUrl(event.target.value)}
          placeholder="https://your-site.com/blog/post"
        />
        <span className="block text-2xs leading-relaxed text-subtle">
          Уже наявна сторінка на цю тему. У ТЗ вона не піде — її порівняємо
          з конкурентами у вкладці «Моя сторінка».
        </span>
      </label>

      {error && (
        <Callout tone="danger" live>
          {error}
        </Callout>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className="btn-primary">
          Створити й проаналізувати
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Скасувати
          </button>
        )}
      </div>
    </form>
  );
}
