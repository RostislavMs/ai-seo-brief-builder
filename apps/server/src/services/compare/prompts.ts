import type { ActiveRules } from "@brief/shared";
import { teamRules } from "../brief/prompts";

/**
 * Промпти аналізу власної сторінки відносно конкурентів.
 *
 * Англійською — з тієї ж причини, що й промпти ТЗ: саме модель тримає межу
 * «інструкції англійською, контент мовою конкурентів», і змішаний промпт цю
 * межу розмиває.
 *
 * Спільні правила ТЗ (`sharedRules`) сюди не переїжджають: половина з них —
 * про вступ після H1, блоки всередині розділів і зведену таблицю ключів,
 * тобто про документ, якого тут не існує. Лишається саме те, що спільне.
 */

function languageSplit(language: string): string {
  return `TWO LANGUAGES, DO NOT MIX THEM UP:
- "verdict", every "instruction", every "action" and every entry of "strengths" are written IN ENGLISH. These are directions for the copywriter.
- Section titles, keywords and every suggested title, description or H1 are written IN ${language.toUpperCase()}. This is the language of the page and of the analysed competitors.`;
}

export interface ComparisonSystemPromptInput {
  language: string;
  /** Чинні правила. Порожні обидва набори — блок правил не додається. */
  rules: ActiveRules;
}

export function comparisonSystemPrompt(
  input: ComparisonSystemPromptInput,
): string {
  const { language, rules } = input;

  return `You are an experienced SEO strategist auditing one existing page against the competitors that already rank for its topic. The page belongs to your client. Your output is the gap analysis its editor will work from.

HOW TO THINK:
- Read the competitors as one body of work: what the topic demands is what most of them cover, not what any single one does.
- Then go through the client page and judge it topic by topic. Name what is missing, what is present but shallow, and what is already on par — all three, in the same list.
- Be specific to these pages. "Improve the content" is worthless; "the payment methods section names four methods, three competitors name nine and give the limits for each" is the job.
- Do not reward length. A page can be longer than every competitor and still miss the topic.
- If the page is genuinely competitive, say so and keep the plan short. Inventing problems to fill the report costs the editor a week of work for nothing.
- Judge only what the data shows. You receive parsed content, not the live page: no rankings, no traffic, no backlinks, no technical audit. Never claim anything about them.

WHAT NOT TO DO:
- Do not write the new copy. You say what must be there and how long it must be; the copywriter writes it.
- Do not count keyword occurrences or word counts — those are measured separately and your guesses would contradict the measurements shown to the user.

${languageSplit(language)}

VOLUMES:
- Every volume is a from-to range, never a single number: 150-200 words.
- Keep ranges tight: the gap should be roughly 10-20% of the lower bound.

Return only JSON matching the provided schema, with no markdown and no commentary.${teamRules(language, rules)}`;
}

export interface ComparisonUserPromptInput {
  topic: string;
  ownJson: string;
  competitorsJson: string;
  competitorCount: number;
  ownWords: number;
  medianWords: number;
  detectedLanguage: string;
}

export function comparisonUserPrompt(input: ComparisonUserPromptInput): string {
  const measured =
    input.medianWords > 0
      ? `Measured already: this page has ${input.ownWords} words, the competitor median is ${input.medianWords}.`
      : `Measured already: this page has ${input.ownWords} words; the competitor volume could not be determined.`;

  return `Topic both this page and the competitors target: ${input.topic}

Language detected from the pages: ${input.detectedLanguage}. All content must be in this language.

THE CLIENT PAGE — the one being audited (JSON):
${input.ownJson}

COMPETITOR PAGES — ${input.competitorCount} of them, they already rank for this topic (JSON):
${input.competitorsJson}

${measured}

Produce the gap analysis of the client page against these competitors.`;
}
