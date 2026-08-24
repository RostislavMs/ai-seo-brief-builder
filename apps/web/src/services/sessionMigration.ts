import type { PageAnalysis, Session } from "@brief/shared";

/**
 * Приведення збережених сесій до поточного формату.
 *
 * localStorage зберігає дані, записані попередніми версіями коду, а типи
 * TypeScript у рантаймі нічого не гарантують. Без цього шару зміна формату ТЗ
 * дала чорний екран на старій сесії: компоненти читали поля, яких у даних
 * не існувало.
 *
 * Правило просте: усе, що можна відновити чесно — відновлюємо; що не можна —
 * відкидаємо й повідомляємо користувачеві, а не показуємо зламане.
 */

export interface MigrationResult {
  session: Session;
  /** Чи змінилися дані й чи треба їх перезаписати. */
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["min"] === "number" &&
    typeof value["max"] === "number"
  );
}

/** Вступ після H1: обсяг, кількість абзаців, тези й ключі. */
function isIntro(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["instruction"] === "string" &&
    isRange(value["wordCount"]) &&
    isRange(value["paragraphs"]) &&
    Array.isArray(value["mainPoints"]) &&
    Array.isArray(value["keywords"])
  );
}

/**
 * Додаткові рекомендації: що можна додати понад план і загальні поради.
 * До них у цьому полі лежали переліки рядків — компоненти читають нові
 * назви, тому старий формат тут не «майже підходить», а ламає панель ТЗ.
 *
 * `uniqueSections` і `skippedSections` не перевіряються: вони прибрані з
 * формату, і бриф, у якому вони ще лежать, від цього не стає застарілим —
 * решта полів у ньому та сама, а зайві панель просто не читає.
 */
function isRecommendations(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value["optionalAdditions"]) &&
    Array.isArray(value["structureNotes"])
  );
}

/**
 * Чи бриф у поточному форматі. Перевіряються саме ті поля, що зʼявилися разом
 * із новим форматом: англійські інструкції, мова контенту, обсяг діапазонами,
 * вступ після H1, блоки всередині розділів і три списки рекомендацій.
 */
function isCurrentBrief(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (
    typeof value["contentLanguage"] !== "string" ||
    typeof value["instruction"] !== "string" ||
    !isRange(value["totalWordCount"]) ||
    !isIntro(value["intro"]) ||
    !isRecommendations(value["recommendations"]) ||
    !Array.isArray(value["structure"]) ||
    !Array.isArray(value["keywords"])
  ) {
    return false;
  }

  const sectionsOk = value["structure"].every(
    (section) =>
      isRecord(section) &&
      typeof section["instruction"] === "string" &&
      isRange(section["wordCount"]) &&
      Array.isArray(section["blocks"]) &&
      Array.isArray(section["keywords"]),
  );

  const keywordsOk = value["keywords"].every(
    (keyword) =>
      isRecord(keyword) &&
      typeof keyword["keyword"] === "string" &&
      isRange(keyword["usage"]),
  );

  return sectionsOk && keywordsOk;
}

/**
 * Дописує метадані джерела контенту, яких не було до появи каскаду доступу.
 * "direct" тут не припущення: до каскаду всі сторінки завантажувались
 * єдиним способом — прямим запитом.
 */
function migrateAnalysis(value: unknown): { analysis: PageAnalysis; changed: boolean } {
  const analysis = value as PageAnalysis;

  if (!isRecord(value) || !isRecord(value["page"])) {
    return { analysis, changed: false };
  }

  const page = value["page"];
  const meta = isRecord(page["meta"]) ? page["meta"] : null;

  if (!meta || typeof meta["source"] === "string") {
    return { analysis, changed: false };
  }

  return {
    analysis: {
      ...analysis,
      page: {
        ...analysis.page!,
        meta: { ...analysis.page!.meta, source: "direct", archivedAt: null },
      },
    },
    changed: true,
  };
}

/** Мінімальна перевірка, що це взагалі схоже на сесію. */
function looksLikeSession(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["name"] === "string" &&
    Array.isArray(value["analyses"])
  );
}

export function migrateSession(raw: unknown): MigrationResult | null {
  if (!looksLikeSession(raw)) return null;

  let changed = false;

  const analyses: PageAnalysis[] = [];
  for (const item of raw["analyses"] as unknown[]) {
    const migrated = migrateAnalysis(item);
    if (migrated.changed) changed = true;
    analyses.push(migrated.analysis);
  }

  const stored = raw as unknown as Session;
  let brief = stored.brief ?? null;
  let legacyBriefRemoved = stored.legacyBriefRemoved === true;

  if (brief !== null && !isCurrentBrief(brief)) {
    // Старий бриф не має ні інструкцій, ні блоків — синтезувати їх без AI
    // неможливо, тому відкидаємо. Результати парсингу лишаються,
    // отже перегенерація — один клік і без повторного парсингу.
    brief = null;
    legacyBriefRemoved = true;
    changed = true;
  }

  const session: Session = {
    ...stored,
    // Поля, яких могло не бути в найстаріших сесіях.
    topic: typeof raw["topic"] === "string" ? raw["topic"] : "",
    urls: Array.isArray(raw["urls"]) ? (raw["urls"] as string[]) : [],
    messages: Array.isArray(raw["messages"]) ? stored.messages : [],
    analyses,
    brief,
    // Машинна версія ТЗ — те саме ТЗ: правити його вручну стало можна вже
    // після переходу на акаунти, тому в локальній сесії ручних правок немає
    // за побудовою. Ставимо явно з тієї ж причини, що й поля нижче:
    // `undefined` у полі, яке типи описують як `| null`, — саме та
    // розбіжність, через яку стара сесія колись дала чорний екран.
    originalBrief: brief,
    // Власної сторінки й звіту порівняння в localStorage не буває: вони
    // з'явилися вже після переходу на акаунти. Ставимо явно, бо `undefined`
    // у полі, яке типи описують як `| null`, — саме та розбіжність між типом
    // і даними, через яку стара сесія колись дала чорний екран.
    ownPage: null,
    comparison: null,
    // З тієї ж причини: перевизначення мови з'явилося після переходу на
    // акаунти, тому в локальній сесії його немає, і `undefined` тут читався б
    // як «мова задана», щойно хтось перевірить поле на присутність.
    contentLanguage: null,
    legacyBriefRemoved,
  };

  return { session, changed };
}
