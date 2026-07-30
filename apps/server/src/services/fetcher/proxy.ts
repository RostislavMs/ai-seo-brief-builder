/**
 * Проксі — відповідь на блокування, у якому винен не запит, а IP.
 *
 * WAF закриває підмережі дата-центрів цілком, тому сторінка, яка з домашнього
 * IP відкривається, з хостингу віддає 403. На Vercel це ще відчутніше: ступеня
 * 2 (браузер) і 4 (копія на вимогу) там немає в принципі, і резидентний IP —
 * єдине, що взагалі можна протиставити блокуванню.
 *
 * Трафік платний з тарифікацією за гігабайти, тому проксі не стає транспортом
 * за замовчуванням: це окрема спроба після відмови прямого запиту, і лише
 * тоді, коли зміна IP справді може щось змінити (див. acquire.ts).
 *
 * Підтримується лише HTTP-проксі: undici тунелює запит методом CONNECT, а
 * SOCKS5 не вміє ні воно, ні Chromium (той не вміє логін-пароль до SOCKS5).
 * У провайдерів HTTP-порт є завжди — інколи під назвою «HTTPS».
 */

/** Мінімум, який нам потрібен від ProxyAgent. */
interface ClosableAgent {
  close(): Promise<void>;
}

export interface ProxyConfig {
  /**
   * Транспорт для fetch. Тип `unknown` навмисно: у типах `RequestInit` поля
   * `dispatcher` немає, хоча рантайм Node його читає — саме так undici
   * підмінює з'єднання на тунель через проксі.
   */
  dispatcher: unknown;
  /** Playwright приймає адресу й доступи окремо, а не одним URL. */
  browser: { server: string; username?: string; password?: string };
  /** Хост і порт без доступів — усе, що дозволено потрапляти в помилки й логи. */
  label: string;
}

export type ProxyState =
  | { kind: "off" }
  | { kind: "ready"; proxy: ProxyConfig }
  /**
   * Заданий, але непридатний. Мовчати про це не можна: користувач вважає, що
   * проксі працює, і не розуміє, чому сайти й далі блокують.
   */
  | { kind: "broken"; reason: string };

interface Cached {
  url: string;
  state: ProxyState;
  agent: ClosableAgent | null;
}

/**
 * Один агент на процес: у ньому пул тунелів, а рукостискання CONNECT до
 * резидентного шлюзу коштує сотні мілісекунд.
 */
let cached: Cached | null = null;

/** Порожній `proxyUrl` — проксі вимкнений; це нормальний стан, не помилка. */
export async function getProxy(proxyUrl: string): Promise<ProxyState> {
  const url = proxyUrl.trim();

  if (!url) return { kind: "off" };
  if (cached?.url === url) return cached.state;

  // Адреса змінилася (у dev — після правки .env): старий пул більше не потрібен.
  await closeProxy();
  cached = await create(url);

  return cached.state;
}

async function create(url: string): Promise<Cached> {
  const broken = (reason: string): Cached => ({
    url,
    state: { kind: "broken", reason },
    agent: null,
  });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return broken(
      "адреса не є коректним URL — потрібен вигляд http://логін:пароль@хост:порт",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return broken(
      `схема ${parsed.protocol.replace(":", "")} не підтримується — ` +
        `вкажіть HTTP-порт проксі`,
    );
  }

  if (!parsed.hostname) return broken("в адресі немає хоста");

  let ProxyAgent: new (url: string) => ClosableAgent;
  try {
    // Динамічний імпорт, як і в browser.ts: коли проксі не налаштований,
    // пакет не має вантажитися взагалі — на serverless це холодний старт.
    ({ ProxyAgent } = (await import("undici")) as unknown as {
      ProxyAgent: new (url: string) => ClosableAgent;
    });
  } catch {
    return broken("пакет undici недоступний — виконайте pnpm install");
  }

  // Логін і пароль undici дістає з адреси сам і надсилає їх
  // у Proxy-Authorization, тому передаємо URL цілим.
  const agent = new ProxyAgent(url);

  return {
    url,
    agent,
    state: {
      kind: "ready",
      proxy: {
        dispatcher: agent,
        browser: {
          server: `${parsed.protocol}//${parsed.host}`,
          // Символи `@` і `:` у паролі мають бути закодовані в .env,
          // інакше URL розбереться не так, як очікує провайдер.
          ...(parsed.username
            ? { username: decodeURIComponent(parsed.username) }
            : {}),
          ...(parsed.password
            ? { password: decodeURIComponent(parsed.password) }
            : {}),
        },
        // Без логіна: у резидентних провайдерів у ньому їдуть країна й номер
        // сесії, і разом з паролем це повний доступ до платного трафіку.
        label: parsed.host,
      },
    },
  };
}

/**
 * Викликається під час зупинки сервера: у пулі лишаються відкриті тунелі до
 * шлюзу, і без явного закриття процес не завершується.
 */
export async function closeProxy(): Promise<void> {
  const previous = cached;
  cached = null;

  if (!previous?.agent) return;

  try {
    await previous.agent.close();
  } catch {
    /* пул уже закритий */
  }
}
