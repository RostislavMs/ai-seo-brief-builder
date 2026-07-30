import type { ActiveRules } from "@brief/shared";
import { teamRules } from "../brief/prompts";
import { renderPrompt } from "../prompts/render";
import type { PromptSet } from "../prompts/repository";

/**
 * Збірка промптів аналізу власної сторінки відносно конкурентів.
 *
 * Тексти живуть у реєстрі промптів і правляться на сторінці «Промпти» — тут
 * лишилася лише підстановка значень і той самий блок правил для мов, що й у
 * генерації ТЗ: порада, яка ламає чинну вимогу, гірша за відсутність поради.
 */

function languageSplit(prompts: PromptSet, language: string): string {
  return renderPrompt(prompts["compare.language_split"], {
    language,
    languageUpper: language.toUpperCase(),
  });
}

export interface ComparisonSystemPromptInput {
  language: string;
  /** Чинні правила. Порожні обидва набори — блок правил не додається. */
  rules: ActiveRules;
  /** Чинні тексти промптів: правки адміна або початкові. */
  prompts: PromptSet;
}

export function comparisonSystemPrompt(
  input: ComparisonSystemPromptInput,
): string {
  const { language, rules, prompts } = input;

  return renderPrompt(prompts["compare.system"], {
    language,
    languageUpper: language.toUpperCase(),
    languageSplit: languageSplit(prompts, language),
    teamRules: teamRules(prompts, language, rules),
  });
}

export interface ComparisonUserPromptInput {
  topic: string;
  ownJson: string;
  competitorsJson: string;
  competitorCount: number;
  ownWords: number;
  medianWords: number;
  detectedLanguage: string;
  prompts: PromptSet;
}

export function comparisonUserPrompt(input: ComparisonUserPromptInput): string {
  // Обсяги вже поміряні кодом, тому подаються готовим реченням: модель має
  // ними користуватися, а не переоцінювати їх на око.
  const measured =
    input.medianWords > 0
      ? `Measured already: this page has ${input.ownWords} words, the competitor median is ${input.medianWords}.`
      : `Measured already: this page has ${input.ownWords} words; the competitor volume could not be determined.`;

  return renderPrompt(input.prompts["compare.user"], {
    topic: input.topic,
    language: input.detectedLanguage,
    ownJson: input.ownJson,
    competitorsJson: input.competitorsJson,
    competitorCount: input.competitorCount,
    measured,
  });
}
