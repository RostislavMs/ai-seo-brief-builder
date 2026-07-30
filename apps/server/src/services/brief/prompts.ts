import type { ActiveRules } from "@brief/shared";
import { renderPrompt } from "../prompts/render";
import type { PromptSet } from "../prompts/repository";

/**
 * Збірка промптів генерації та правки SEO ТЗ.
 *
 * Самих текстів тут більше немає — вони живуть у реєстрі промптів
 * (`services/prompts/`) і правляться на сторінці «Промпти». Тут лишилося те,
 * чого в полі введення не напишеш: у якому порядку блоки складаються один в
 * одного і які значення підставляються у вставки.
 *
 * Межа проведена так навмисно. Текст завдання для моделі — робота SEO-фахівця,
 * і вимагати на кожне його слово розгортання проєкту абсурдно. А от нумерація
 * правил, порожній блок при відсутності правил і те, що правила стоять
 * останніми, — інваріанти, які текстом не задаються й ламатися не мають.
 */

/**
 * Спільні правила ТЗ. Той самий блок дописується і в генерацію, і в правки
 * через чат: правка не має права зламати вимогу, якій ТЗ відповідало до неї.
 */
function sharedRules(prompts: PromptSet, language: string): string {
  return renderPrompt(prompts["shared.rules"], {
    language,
    languageUpper: language.toUpperCase(),
  });
}

/** Правила нумеруються поспіль через два блоки — щоб не було двох «1.». */
function numbered(rules: readonly string[], from: number): string {
  return rules
    .map((rule, index) => `${from + index}. ${rule.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

/**
 * Правила, які команда написала для ТЗ: спільні для всіх мов і для цієї
 * конкретної.
 *
 * Той самий блок дописується і в промпт порівняння власної сторінки: там
 * модель пропонує заголовки, ключі й новий title тією ж мовою й для того ж
 * проєкту, і порада, яка ламає чинну вимогу, гірша за відсутність поради.
 *
 * Мовні правила — після спільних, і промпт прямо каже, що при суперечці
 * виграє вужче: правило для всіх мов писали, не думаючи про італійську,
 * а правило для італійської — думаючи.
 *
 * Порожній рядок при відсутності правил — не дрібниця: заголовок «TEAM RULES»
 * без жодного правила під ним модель читає як вимогу їх вигадати.
 */
export function teamRules(
  prompts: PromptSet,
  language: string,
  rules: ActiveRules,
): string {
  if (rules.global.length === 0 && rules.language.length === 0) return "";

  const blocks: string[] = [];

  if (rules.global.length > 0) {
    blocks.push(`Rules for every language:
${numbered(rules.global, 1)}`);
  }

  if (rules.language.length > 0) {
    blocks.push(`Rules for ${language} only:
${numbered(rules.language, rules.global.length + 1)}`);
  }

  const conflict =
    rules.global.length > 0 && rules.language.length > 0
      ? ` Where a rule for ${language} contradicts a rule for every language, the ${language} one wins.`
      : "";

  const rendered = renderPrompt(prompts["shared.team_rules"], {
    language,
    conflict,
    blocks: blocks.join("\n\n"),
  });

  // Відступ від попереднього блока додається тут, а не в тексті промпта:
  // порожні рядки на початку поля введення виглядають як випадкові й перше,
  // що з ними зробить редактор, — приберуть.
  return `\n\n${rendered}`;
}

export interface BriefSystemPromptInput {
  language: string;
  /** Чинні правила. Порожні обидва набори — блок правил не додається. */
  rules: ActiveRules;
  /** Чинні тексти промптів: правки адміна або початкові. */
  prompts: PromptSet;
}

export function briefSystemPrompt(input: BriefSystemPromptInput): string {
  const { language, rules, prompts } = input;

  return renderPrompt(prompts["brief.system"], {
    language,
    languageUpper: language.toUpperCase(),
    sharedRules: sharedRules(prompts, language),
    teamRules: teamRules(prompts, language, rules),
  });
}

export interface BriefUserPromptInput {
  topic: string;
  pagesJson: string;
  pageCount: number;
  medianWords: number;
  detectedLanguage: string;
  prompts: PromptSet;
}

export function briefUserPrompt(input: BriefUserPromptInput): string {
  // Готовим реченням, а не числом: «медіана 0» модель прочитала б як обсяг,
  // тому випадок «визначити не вдалося» формулюється словами.
  const medianNote =
    input.medianWords > 0
      ? `Median competitor length: ${input.medianWords} words.`
      : "Competitor length could not be determined — judge by the depth of the topic.";

  return renderPrompt(input.prompts["brief.user"], {
    topic: input.topic,
    language: input.detectedLanguage,
    pageCount: input.pageCount,
    medianNote,
    pagesJson: input.pagesJson,
  });
}

export interface ChatSystemPromptInput {
  language: string;
  topic: string;
  briefJson: string;
  pagesJson: string;
  /**
   * Ті самі правила, що й під час генерації: правка не має права зламати
   * вимогу, якій ТЗ відповідало до неї.
   */
  rules: ActiveRules;
  prompts: PromptSet;
}

/**
 * Промпт редагування ТЗ через діалог (розділ 10 ТЗ).
 * Поточне ТЗ передається в системній інструкції, бо воно змінюється
 * після кожної правки й завжди має бути найсвіжішим.
 */
export function chatSystemPrompt(input: ChatSystemPromptInput): string {
  const { language, prompts, rules } = input;

  return renderPrompt(prompts["chat.system"], {
    language,
    languageUpper: language.toUpperCase(),
    topic: input.topic,
    briefJson: input.briefJson,
    pagesJson: input.pagesJson,
    sharedRules: sharedRules(prompts, language),
    teamRules: teamRules(prompts, language, rules),
  });
}
