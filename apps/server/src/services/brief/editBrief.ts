import type {
  ActiveRules,
  ChatMessage,
  ParsedPage,
  SeoBrief,
} from "@brief/shared";
import { AppError } from "../../http/errors";
import { requestJson, type AiMessage, type AiProvider } from "../ai";
import type { PromptSet } from "../prompts/repository";
import { normalizeBrief } from "./generateBrief";
import { buildCompactPagesPayload } from "./payload";
import { chatSystemPrompt } from "./prompts";
import { chatReplySchema, toChatResponseSchema } from "./chatSchema";

/**
 * Скільки останніх реплік передавати моделі. Уся історія не потрібна:
 * поточне ТЗ уже містить результат усіх попередніх правок,
 * а історія лишається тільки для зв'язності діалогу.
 */
const HISTORY_LIMIT = 20;

export interface EditBriefInput {
  topic: string;
  brief: SeoBrief;
  history: readonly ChatMessage[];
  message: string;
  pages: readonly ParsedPage[];
  /**
   * Чинні правила мови ТЗ. Готовими, а не функцією як у генерації: мову
   * тут визначати не треба, вона вже зафіксована в самому брифі.
   */
  rules: ActiveRules;
  /** Чинні тексти промптів — так само готовими, як у генерації. */
  prompts: PromptSet;
}

export interface EditBriefResult {
  reply: string;
  /** null — модель лише відповіла, ТЗ без змін. */
  brief: SeoBrief | null;
}

/**
 * Застосовує правку до наявного ТЗ за текстовим запитом (розділ 10 ТЗ).
 * Повторного парсингу URL не відбувається.
 */
export async function editBrief(
  input: EditBriefInput,
  provider: AiProvider,
): Promise<EditBriefResult> {
  const pages = buildCompactPagesPayload(input.pages);

  const messages: AiMessage[] = [
    ...input.history.slice(-HISTORY_LIMIT).map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user" as const, content: input.message },
  ];

  const response = await requestJson(
    provider,
    {
      system: chatSystemPrompt({
        // Мова контенту зафіксована в самому брифі, тому правки її не змінюють.
        language: input.brief.contentLanguage,
        topic: input.topic,
        briefJson: JSON.stringify(input.brief),
        pagesJson: pages.json,
        rules: input.rules,
        prompts: input.prompts,
      }),
      messages,
      responseSchema: toChatResponseSchema(),
      // Нижча за генерацію: правка має бути точною, а не творчою.
      temperature: 0.2,
    },
    chatReplySchema,
  );

  console.info(
    `[chat] ${provider.name}/${response.model} · історія ${messages.length} · ` +
      `правил ${input.rules.global.length}+${input.rules.language.length} · ` +
      `токени ${response.usage.inputTokens ?? "?"}→${response.usage.outputTokens ?? "?"}` +
      `${response.attempts > 1 ? ` · спроб ${response.attempts}` : ""}`,
  );

  const { action, reply, brief } = response.data;

  if (action === "answer") {
    return { reply, brief: null };
  }

  // Звʼязок «edit ⇒ brief присутній» схемою не виражений, перевіряємо тут.
  if (!brief) {
    throw new AppError(
      "ai_incomplete_edit",
      "Модель повідомила про правку, але не повернула оновлене ТЗ. Спробуйте переформулювати запит.",
      502,
    );
  }

  // Ті самі інваріанти, що й під час генерації: впорядковані діапазони
  // і ціле не менше суми частин.
  return { reply, brief: normalizeBrief(brief) };
}
