/**
 * Правила для мов: додаткові вимоги до ТЗ, які діють лише для однієї мови
 * контенту. Спільний контракт web ↔ server.
 *
 * Правило — це рядок тексту, який дописується в промпт генерації, коли мова
 * проаналізованих сторінок збігається з мовою правила. Наприклад для
 * італійської: «звертатися до читача на "tu", не на "Lei"».
 *
 * Життєвий цикл роздільний навмисно:
 *
 * - `status` — вирок пропозиції: чекає розгляду, схвалено, відхилено.
 * - `enabled` — чи діє схвалене правило зараз.
 *
 * Одним полем це не описати: вимкнути правило на тиждень і відхилити його
 * назавжди — різні дії, і зводити їх до одного стану означало б втрачати
 * різницю між «поки не треба» і «так не робимо».
 */

/** Роль визначає, що користувач може робити з правилами. */
export type UserRole = "user" | "admin";

export type LanguageRuleStatus = "pending" | "approved" | "rejected";

export interface LanguageRule {
  id: string;
  /**
   * Код мови ISO 639-1 ("it", "uk", "sv") або `ALL_LANGUAGES` (`"*"`) —
   * правило, що діє для будь-якої мови.
   */
  languageCode: string;
  rule: string;
  status: LanguageRuleStatus;
  /**
   * Діє лише для status="approved". Для решти статусів значення не має сенсу
   * і в інтерфейсі не показується.
   */
  enabled: boolean;
  /** Пошта автора. null — акаунт видалено, саме правило лишилося. */
  authorEmail: string | null;
  /** true — правило запропонував той, хто читає список. */
  mine: boolean;
  /** Коментар адміна до рішення. Головне — причина відхилення. */
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Правила, що діють для однієї мови, — так, як вони йдуть у промпт.
 *
 * Два набори окремо, а не одним списком: правило для всіх мов і правило
 * саме для цієї мови мають різну вагу, і друге має перебивати перше.
 * Злиті в один перелік, вони цю різницю втрачають.
 *
 * Живе тут, а не в одному з модулів сервера: цю форму виробляє репозиторій
 * правил, а споживає збірка промпта, і жоден із них не має залежати
 * від іншого.
 */
export interface ActiveRules {
  /** Правила з кодом `"*"` — діють для будь-якої мови. */
  global: string[];
  /** Правила саме цієї мови. */
  language: string[];
}

/** Скільки правил має мова — щоб у списку вибору було видно, де вони вже є. */
export interface LanguageRuleCount {
  /** Код мови або `"*"` — рядок для правил, що діють для всіх мов. */
  languageCode: string;
  /** Схвалені й увімкнені — тобто ті, що реально йдуть у промпт. */
  active: number;
  /** Чекають на розгляд. Для звичайного користувача — лише його власні. */
  pending: number;
}

/** GET /api/rules?language=it — правила однієї мови. */
export interface LanguageRuleListResponse {
  rules: LanguageRule[];
}

/** GET /api/rules/languages — по скільки правил у кожної мови. */
export interface LanguageRuleCountsResponse {
  counts: LanguageRuleCount[];
}

/**
 * POST /api/rules
 *
 * Користувач створює пропозицію (status="pending"), адмін — одразу чинне
 * правило (status="approved"). Тіло запиту в обох випадках однакове:
 * що вийде, вирішує роль, а не клієнт.
 */
export interface CreateLanguageRuleRequest {
  languageCode: string;
  rule: string;
}

/** PATCH /api/rules/:id — лише для адміна. Надсилаються тільки змінені поля. */
export interface UpdateLanguageRuleRequest {
  rule?: string;
  status?: LanguageRuleStatus;
  enabled?: boolean;
  reviewNote?: string | null;
}

export interface LanguageRuleResponse {
  rule: LanguageRule;
}
