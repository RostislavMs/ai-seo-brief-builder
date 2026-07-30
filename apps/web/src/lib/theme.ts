/**
 * Тема застосунку.
 *
 * Стани навмисно три, а не два: «system» — не синонім «light». Поки користувач
 * не вибрав явно, тема має їхати за налаштуванням ОС і перемикатися разом із
 * ним (у macOS та Windows це буває автоматично за розкладом).
 *
 * Модуль тримає власний стан і список підписників замість React-контексту:
 * тему читає лише перемикач у шапці, і загортати весь застосунок у провайдер
 * заради одного компонента немає причини.
 */

import { readJson, writeJson } from "./storage";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** Той самий ключ читає інлайн-скрипт в index.html — не перейменовувати окремо. */
const STORAGE_KEY = "brief.theme";

/** Має відповідати --ui-canvas обох тем у styles.css. */
const CANVAS: Record<ResolvedTheme, string> = {
  light: "#fbfaf8",
  dark: "#1a1917",
};

type Listener = () => void;

const listeners = new Set<Listener>();

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function darkMedia(): MediaQueryList {
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function readPreference(): ThemePreference {
  const stored = readJson<unknown>(window.localStorage, STORAGE_KEY, "system");
  return isPreference(stored) ? stored : "system";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return darkMedia().matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;

  root.dataset.theme = theme;
  // Нативні скролбари, датапікери й автозаповнення фарбуються саме за
  // color-scheme — атрибута data-theme вони не бачать.
  root.style.colorScheme = theme;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", CANVAS[theme]);
}

let preference: ThemePreference = readPreference();
let resolved: ResolvedTheme = resolveTheme(preference);

/**
 * Знімок для useSyncExternalStore. Містить обидва значення, бо перемикання
 * теми в ОС змінює лише resolved: якби знімком був один preference, підписник
 * не дізнався би про зміну і застосунок лишився б у старих кольорах.
 */
let snapshot = `${preference}|${resolved}`;

function commit(next: ThemePreference): void {
  preference = next;
  resolved = resolveTheme(next);
  snapshot = `${preference}|${resolved}`;

  applyTheme(resolved);
  for (const listener of listeners) listener();
}

// Страховка на випадок, якщо інлайн-скрипт в index.html не виконався
// (вимкнений JS у head, підміна шаблону) — інакше атрибут лишився б відсутнім.
applyTheme(resolved);

darkMedia().addEventListener("change", () => {
  if (preference !== "system") return;
  commit("system");
});

// Тема — налаштування користувача, а не однієї вкладки: перемикання в одній
// вкладці має підхопитися в решті відкритих.
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  commit(readPreference());
});

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): string {
  return snapshot;
}

export function setPreference(next: ThemePreference): void {
  if (next === preference) return;

  // Спершу застосовуємо, потім зберігаємо: заповнене сховище не повинно
  // блокувати перемикання теми — воно й так працює до кінця сеансу.
  commit(next);

  try {
    writeJson(window.localStorage, STORAGE_KEY, next);
  } catch {
    console.warn("[theme] не вдалося зберегти вибір теми");
  }
}
