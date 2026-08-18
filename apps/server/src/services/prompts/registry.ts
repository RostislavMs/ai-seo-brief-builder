import type { PromptGroup, PromptVariable } from "@brief/shared";
import { DEFAULT_REQUIREMENTS, requirementsProblem } from "@brief/shared";
import { AppError } from "../../http/errors";
import * as defaults from "./defaults";

/**
 * Реєстр промптів: які взагалі існують, що в кожному можна написати
 * і яким він був до правок.
 *
 * Реєстр у коді, а не в базі, і це головне рішення цієї частини. База знає
 * лише «текст промпта X тепер такий»; чи існує промпт X, які вставки в ньому
 * допустимі й без яких він не має сенсу — знає код. Тому:
 *
 * - додати промпт можна лише разом із місцем, де він використовується;
 * - правка не може зламати генерацію тихо: спроба прибрати обовʼязкову
 *   вставку відхиляється з поясненням, а не дає ТЗ без даних конкурентів;
 * - опис змінних приходить у браузер із того самого місця, що й підстановка
 *   в промпт, і розійтися вони не можуть.
 */

export const PROMPT_KEYS = [
  "brief.system",
  "brief.user",
  "chat.system",
  "compare.system",
  "compare.user",
  "compare.language_split",
  "shared.rules",
  "shared.team_rules",
  "document.requirements",
] as const;

export type PromptKey = (typeof PROMPT_KEYS)[number];

export interface PromptDefinition {
  key: PromptKey;
  title: string;
  description: string;
  group: PromptGroup;
  variables: PromptVariable[];
  /** Початковий текст. Він же — те, до чого повертає скидання. */
  body: string;
  /**
   * Додаткова перевірка тексту перед збереженням — понад звірку вставок.
   *
   * Потрібна там, де текст має не лише сенс, а й форму: вимоги до тексту
   * розбираються на блоки й пункти, і текст, у якому їх не видно, дав би
   * порожній хвіст у кожному ТЗ. Кидає `AppError` із поясненням для адміна.
   */
  validate?: (body: string) => void;
}

/** Мова контенту — потрібна майже кожному промпту, тому описана один раз. */
const LANGUAGE: PromptVariable = {
  name: "language",
  description:
    "Назва мови контенту англійською: Swedish, Italian. Визначається зі " +
    "самих сторінок або задається вручну у вкладці «Аналіз».",
  required: false,
};

/**
 * Мова великими літерами — доступна, але не обовʼязкова.
 *
 * У промптах генерації й правок мовний поділ живе не тут, а у вставленому
 * блоці `{{sharedRules}}`, тому вимагати `{{languageUpper}}` від них означало б
 * заборонити будь-яку правку тексту, який цієї вставки й не містив.
 */
const LANGUAGE_UPPER: PromptVariable = {
  name: "languageUpper",
  description: "Та сама мова великими літерами: SWEDISH. Для наголосу в промпті.",
  required: false,
};

/**
 * Те саме, але обовʼязкове — для двох промптів, які тільки й існують, щоб
 * розділити мови. Без назви мови вони перетворюються на «пишіть інструкції
 * англійською, а контент якоюсь мовою».
 */
const LANGUAGE_UPPER_REQUIRED: PromptVariable = {
  ...LANGUAGE_UPPER,
  required: true,
};

const TEAM_RULES_SLOT: PromptVariable = {
  name: "teamRules",
  description:
    "Блок чинних правил зі сторінки «Правила для мов». Порожній, якщо " +
    "правил немає; інакше починається з порожнього рядка. Без цієї вставки " +
    "правила перестануть діяти, а сторінка правил і далі показувала б їх " +
    "як чинні.",
  required: true,
};

const SHARED_RULES_SLOT: PromptVariable = {
  name: "sharedRules",
  description:
    "Блок «Спільні правила ТЗ» — мовний поділ, обсяги, ключі, види блоків. " +
    "Правиться окремим промптом нижче.",
  required: true,
};

export const PROMPT_DEFINITIONS: readonly PromptDefinition[] = [
  {
    key: "brief.system",
    title: "Генерація ТЗ — завдання моделі",
    description:
      "Головний промпт: хто модель, як їй думати над сторінками конкурентів " +
      "і які межі має результат. Діє на кожну генерацію ТЗ.",
    group: "brief",
    variables: [LANGUAGE, LANGUAGE_UPPER, SHARED_RULES_SLOT, TEAM_RULES_SLOT],
    body: defaults.BRIEF_SYSTEM,
  },
  {
    key: "brief.user",
    title: "Генерація ТЗ — дані конкурентів",
    description:
      "Репліка з темою статті та розібраним контентом сторінок. Саме тут " +
      "модель отримує дані, тому без {{pagesJson}} ТЗ склалося б із нічого.",
    group: "brief",
    variables: [
      {
        name: "topic",
        description: "Цільова тема або ключ статті — те, що вказав користувач.",
        required: true,
      },
      LANGUAGE,
      {
        name: "pageCount",
        description: "Скільком сторінкам конкурентів вдалося дістати контент.",
        required: false,
      },
      {
        name: "medianNote",
        description:
          "Готове речення про медіанний обсяг конкурентів — або про те, що " +
          "визначити його не вдалося.",
        required: false,
      },
      {
        name: "pagesJson",
        description:
          "Розібраний контент сторінок конкурентів у JSON: заголовки, текст, " +
          "списки, таблиці, FAQ.",
        required: true,
      },
    ],
    body: defaults.BRIEF_USER,
  },
  {
    key: "chat.system",
    title: "Правки ТЗ через чат",
    description:
      "Завдання моделі, коли ТЗ уже є, а користувач просить його змінити. " +
      "Поточне ТЗ передається тут же, бо після кожної правки воно інше.",
    group: "chat",
    variables: [
      {
        name: "topic",
        description: "Тема статті — та сама, що при генерації.",
        required: false,
      },
      LANGUAGE,
      LANGUAGE_UPPER,
      {
        name: "briefJson",
        description:
          "Поточне ТЗ у JSON — те, що модель має відредагувати. Без нього " +
          "правка не має над чим працювати.",
        required: true,
      },
      {
        name: "pagesJson",
        description:
          "Скорочені структури сторінок конкурентів — як довідка. " +
          "Повторного парсингу не відбувається.",
        required: false,
      },
      SHARED_RULES_SLOT,
      TEAM_RULES_SLOT,
    ],
    body: defaults.CHAT_SYSTEM,
  },
  {
    key: "compare.system",
    title: "Моя сторінка — завдання моделі",
    description:
      "Промпт аналізу власної сторінки проти конкурентів: що вважати " +
      "прогалиною, чого не робити й чого не вигадувати.",
    group: "compare",
    variables: [
      LANGUAGE,
      LANGUAGE_UPPER,
      {
        name: "languageSplit",
        description:
          "Блок «дві мови, не змішувати» для звіту порівняння. Правиться " +
          "окремим промптом нижче.",
        required: true,
      },
      TEAM_RULES_SLOT,
    ],
    body: defaults.COMPARE_SYSTEM,
  },
  {
    key: "compare.user",
    title: "Моя сторінка — дані для порівняння",
    description:
      "Репліка з власною сторінкою та сторінками конкурентів. Обидва набори " +
      "обовʼязкові: без них порівнювати нічого.",
    group: "compare",
    variables: [
      {
        name: "topic",
        description: "Тема, на яку націлені і власна сторінка, і конкуренти.",
        required: true,
      },
      LANGUAGE,
      {
        name: "ownJson",
        description: "Розібраний контент власної сторінки в JSON.",
        required: true,
      },
      {
        name: "competitorsJson",
        description: "Розібраний контент сторінок конкурентів у JSON.",
        required: true,
      },
      {
        name: "competitorCount",
        description: "Скільки конкурентів у порівнянні.",
        required: false,
      },
      {
        name: "measured",
        description:
          "Готове речення з уже порахованими обсягами: скільки слів на " +
          "власній сторінці й яка медіана в конкурентів.",
        required: false,
      },
    ],
    body: defaults.COMPARE_USER,
  },
  {
    key: "compare.language_split",
    title: "Моя сторінка — межа двох мов",
    description:
      "Що у звіті англійською (інструкції редактору), а що мовою сторінки " +
      "(заголовки, ключі, пропозиції title). Дописується в промпт порівняння.",
    group: "compare",
    variables: [LANGUAGE, LANGUAGE_UPPER_REQUIRED],
    body: defaults.COMPARE_LANGUAGE_SPLIT,
  },
  {
    key: "shared.rules",
    title: "Спільні правила ТЗ",
    description:
      "Найдовший блок: мовний поділ, обсяги діапазонами, щільність ключів, " +
      "зведена таблиця, види блоків, рекомендації. Дописується і в генерацію " +
      "ТЗ, і в правки через чат — тому правка тут зачіпає обидва сценарії.",
    group: "shared",
    variables: [LANGUAGE, LANGUAGE_UPPER_REQUIRED],
    body: defaults.SHARED_RULES,
  },
  {
    key: "shared.team_rules",
    title: "Обгортка правил для мов",
    description:
      "Текст, яким чинні правила зі сторінки «Правила для мов» подаються " +
      "моделі. Самі правила тут не пишуть — вони підставляються у {{blocks}}. " +
      "Дописується в генерацію ТЗ, правки й порівняння.",
    group: "shared",
    variables: [
      LANGUAGE,
      {
        name: "blocks",
        description:
          "Самі правила, пронумеровані й розділені на «для всіх мов» і «лише " +
          "для цієї мови». Без цієї вставки в промпт піде обгортка без правил.",
        required: true,
      },
      {
        name: "conflict",
        description:
          "Речення про те, що при суперечці виграє правило мови. Порожнє, " +
          "якщо діє лише один із двох наборів і суперечці нема між чим бути.",
        required: false,
      },
    ],
    body: defaults.TEAM_RULES,
  },
  {
    key: "document.requirements",
    title: "Вимоги до тексту в ТЗ",
    description:
      "Єдиний текст на цій сторінці, який не йде в модель: він дописується " +
      "в кінець кожного ТЗ і адресований райтеру. Однаковий для всіх мов і " +
      "тем, тому й не генерується. Рядок «# Назва блока» задає заголовок, " +
      "«- вимога» — пункт, «- вимога» з відступом — уточнення під попереднім " +
      "пунктом. Нумерація проставляється при показі, у тексті її не пишуть.",
    group: "document",
    // Вставок немає навмисно: підставляти сюди нічого, а `{{...}}` у тексті
    // означало б, що райтер побачить у ТЗ дужки замість значення.
    variables: [],
    body: DEFAULT_REQUIREMENTS,
    validate: (body) => {
      const problem = requirementsProblem(body);

      if (problem) throw new AppError("requirements_invalid", problem, 422);
    },
  },
];

const BY_KEY = new Map<string, PromptDefinition>(
  PROMPT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

/**
 * Початковий текст має проходити ту саму перевірку, що й правка адміна.
 *
 * Інакше можлива тиха пастка: змінна позначена обовʼязковою, але в
 * початковому тексті її немає — і будь-яка правка цього промпта
 * відхиляється вимогою повернути вставку, якої там ніколи не було.
 * Саме так і сталося з `{{languageUpper}}` у промптах генерації та правок:
 * мовний поділ у них живе не сам, а всередині `{{sharedRules}}`.
 *
 * Перевірка виконується один раз при завантаженні модуля й лише пише в лог.
 * Кидати виняток тут означало б, що описка в реєстрі гасить усе API — гірше
 * за неї саму. Помилка в консолі при першому ж старті помітна, а маршрут
 * правки промптів усе одно звіряє текст перед збереженням.
 */
function checkDefaults(): void {
  const problems: string[] = [];

  for (const definition of PROMPT_DEFINITIONS) {
    const used = new Set(
      [...definition.body.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)].map(
        (match) => match[1],
      ),
    );
    const declared = new Set(definition.variables.map((variable) => variable.name));

    for (const name of used) {
      if (name && !declared.has(name)) {
        problems.push(`${definition.key}: {{${name}}} у тексті, але не в переліку`);
      }
    }

    for (const variable of definition.variables) {
      if (variable.required && !used.has(variable.name)) {
        problems.push(
          `${definition.key}: {{${variable.name}}} позначена обовʼязковою, ` +
            "але її немає в початковому тексті",
        );
      }
    }

    // Та сама пастка, що й зі вставками: перевірка форми, якої не проходить
    // початковий текст, зробила б будь-яку правку неможливою.
    try {
      definition.validate?.(definition.body);
    } catch (error) {
      problems.push(
        `${definition.key}: початковий текст не проходить власну перевірку — ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(`[prompts] реєстр не збігається з текстами:\n${problems.join("\n")}`);
  }
}

checkDefaults();

export function isPromptKey(value: string): value is PromptKey {
  return BY_KEY.has(value);
}

/** Опис промпта за ключем. `undefined` — такого промпта немає. */
export function promptDefinition(key: string): PromptDefinition | undefined {
  return BY_KEY.get(key);
}

/** Початковий текст промпта — те, до чого повертає скидання. */
export function defaultBody(key: PromptKey): string {
  // Ключ уже звірений із реєстром типом PromptKey, тому "" тут недосяжне.
  return BY_KEY.get(key)?.body ?? "";
}
