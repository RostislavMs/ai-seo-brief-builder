import { Buffer } from "node:buffer";
import { buildReaderHtml } from "./markdown";
import { diagnose, type AccessProblem } from "./detect";

/**
 * Безкоштовна ступінь каскаду: зовнішній сервіс читання (r.jina.ai).
 *
 * Робить те, чого наш сервер не може в принципі: відкриває сторінку у власному
 * браузері з власних адрес і, якщо не вийшло, повторює спробу інакше. Для нас
 * це один HTTP-запит — тобто працює і там, де немає Chrome (Vercel).
 *
 * Заміряно на вибірці з 8 захищених сайтів, де все інше безкоштовне впало:
 *   forbes.com     — 5628 слів
 *   zillow.com     — 2230 слів
 *   trustpilot.com — 3099 слів
 * Ті самі сторінки прямим запитом дають 403 і 7–25 слів заслонки.
 *
 * Чому саме markdown, а не HTML: у сервісу є режим `X-Return-Format: html`,
 * і він швидший, але заміряно, що він віддає сирий вихлоп першої ж спроби —
 * на zillow це 7 слів заслонки замість 2230 слів тексту. Повний конвеєр
 * сервісу (з повторами й обходом захисту) працює лише в режимі markdown,
 * тому беремо markdown і повертаємо його в HTML (див. markdown.ts).
 *
 * Ціна безкоштовності — ліміт близько 20 запитів на хвилину на нашу адресу;
 * після нього сервіс відповідає 401. Ключ у `apiKey` цей ліміт знімає.
 */

const READER_ENDPOINT = "https://r.jina.ai/";

export interface ReaderFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Порожньо — безключовий режим із лімітом частоти на IP сервера. */
  apiKey: string;
  /**
   * Резидентні адреси самого сервісу. Це його платна можливість і без ключа
   * вона недоступна (перевірено: 401 AuthenticationRequiredError,
   * «Proxy allocation»), тому вмикається лише в платній частині каскаду.
   */
  useProxy: boolean;
}

export interface ReaderFetchResult {
  html: string | null;
  finalUrl: string;
  problem: AccessProblem | null;
  detail: string;
}

/** Відповідь сервісу в режимі JSON. Перевіряється вручну — схема стабільна. */
interface ReaderPayload {
  data?: {
    title?: unknown;
    description?: unknown;
    url?: unknown;
    content?: unknown;
  };
  message?: unknown;
  readableMessage?: unknown;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Повідомлення сервісу буває довгим — у помилку йде лише суть. */
function serviceMessage(payload: ReaderPayload): string {
  const raw = asText(payload.message) ?? asText(payload.readableMessage);
  return raw ? raw.replace(/\s+/g, " ").slice(0, 120) : "";
}

export async function fetchWithReader(
  url: URL,
  options: ReaderFetchOptions,
): Promise<ReaderFetchResult> {
  const failure = (problem: AccessProblem, detail: string): ReaderFetchResult => ({
    html: null,
    finalUrl: url.href,
    problem,
    detail,
  });

  const headers: Record<string, string> = {
    // Режим JSON, а не тексту: у ньому окремими полями приходять title й
    // description, а вони потрібні для SEO-аналізу так само, як сам текст.
    Accept: "application/json",
    "X-Return-Format": "markdown",
    // Картинки в аналіз не йдуть, а розмір відповіді роздувають помітно.
    "X-Retain-Images": "none",
    // Хай сервіс здасться раніше, ніж обірве зʼєднання наш таймаут:
    // тоді ми отримаємо його пояснення, а не безлике «не відповів».
    "X-Timeout": String(Math.max(5, Math.round(options.timeoutMs / 1000) - 2)),
  };

  if (options.apiKey) headers["Authorization"] = `Bearer ${options.apiKey}`;
  if (options.useProxy) headers["X-Proxy"] = "auto";

  let response: Response;

  try {
    response = await fetch(`${READER_ENDPOINT}${url.href}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers,
    });
  } catch {
    return failure(
      "network",
      `сервіс читання не відповів за ${Math.round(options.timeoutMs / 1000)} с`,
    );
  }

  const raw = await response.arrayBuffer();

  if (raw.byteLength > options.maxBytes) {
    return failure("http_error", "відповідь сервісу читання завелика");
  }

  let payload: ReaderPayload;
  try {
    payload = JSON.parse(Buffer.from(raw).toString("utf8")) as ReaderPayload;
  } catch {
    return failure("http_error", `сервіс читання відповів ${response.status}`);
  }

  if (!response.ok) {
    const message = serviceMessage(payload);

    // 401 без ключа — це не «немає доступу», а вичерпаний безкоштовний ліміт
    // частоти на нашу адресу. Формулювання важливе: інакше користувач шукає
    // проблему в налаштуваннях, яких у нього немає.
    if (response.status === 401) {
      return failure(
        "blocked",
        options.apiKey
          ? `ключ сервісу читання не приймається${message ? ` — ${message}` : ""}`
          : "безкоштовний ліміт сервісу читання вичерпано — задайте NITRO_READER_KEY",
      );
    }

    if (response.status === 402) {
      return failure("blocked", "на ключі сервісу читання закінчилися токени");
    }

    if (response.status === 429) {
      return failure("blocked", "сервіс читання обмежив частоту запитів");
    }

    return failure(
      response.status >= 500 ? "http_error" : "blocked",
      `сервіс читання відповів ${response.status}${message ? ` — ${message}` : ""}`,
    );
  }

  const markdown = asText(payload.data?.content);

  if (!markdown) {
    return failure("thin", "сервіс читання не знайшов на сторінці тексту");
  }

  const html = buildReaderHtml({
    title: asText(payload.data?.title),
    description: asText(payload.data?.description),
    canonical: asText(payload.data?.url),
    markdown,
  });

  // Сервіс міг успішно прочитати… саму заслонку: код у нього 200, а в тексті
  // «Just a moment». Тому вихлоп проходить ту саму перевірку, що й решта
  // ступеней, — інакше 25 слів челенджу пішли б до AI як контент.
  const diagnosis = diagnose(200, html);

  if (diagnosis.problem !== null) {
    return failure(
      diagnosis.problem,
      `сервіс читання віддав ${diagnosis.words} слів${diagnosis.title ? ` («${diagnosis.title}»)` : ""}`,
    );
  }

  return {
    html,
    // Сторінку читав сервіс, і його редиректи нам не видні: найточніше, що
    // ми знаємо про кінцеву адресу, — та, яку він назвав сам.
    finalUrl: asText(payload.data?.url) ?? url.href,
    problem: null,
    detail: "",
  };
}
