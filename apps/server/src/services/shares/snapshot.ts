import { z } from "zod";
import type {
  PageAnalysis,
  Session,
  ShareSnapshot,
  SharedPage,
  SharedSections,
} from "@brief/shared";
import { DEFAULT_REQUIREMENTS, isUsable } from "@brief/shared";
import { parsedPageSchema } from "../../schemas/page";
import { seoBriefSchema } from "../brief/schema";
import { pageComparisonSchema } from "../compare/schema";

/**
 * Зліпок сесії для публічного посилання.
 *
 * Збирає його сервер, а не клієнт. Це не перестраховка: тіло запиту зі зліпком
 * означало б, що за своїм публічним посиланням можна опублікувати будь-що —
 * від чужого тексту до розмітки. Тому клієнт надсилає лише вибір розділів,
 * а вміст береться з тієї сесії, якою він володіє.
 */

const sharedPageSchema = z.object({
  url: z.string(),
  analyzedAt: z.string().nullable(),
  page: parsedPageSchema,
});

export const shareSnapshotSchema = z.object({
  name: z.string(),
  topic: z.string(),
  brief: seoBriefSchema.nullable(),
  // Зі значенням за замовчуванням, а не обовʼязково: зліпки, опубліковані до
  // появи вимог, лишаються читабельними. Вимагати поле означало б, що кожне
  // раніше надіслане посилання відповідає «створено в попередньому форматі»
  // заради тексту, який у коді й так лежить.
  requirements: z.string().default(DEFAULT_REQUIREMENTS),
  pages: z.array(sharedPageSchema).max(50),
  ownPage: sharedPageSchema.nullable(),
  comparison: pageComparisonSchema.nullable(),
});

/** Компіляційна гарантія збігу з типом із @brief/shared. */
type SchemaMatchesType =
  z.infer<typeof shareSnapshotSchema> extends ShareSnapshot
    ? ShareSnapshot extends z.infer<typeof shareSnapshotSchema>
      ? true
      : never
    : never;

const _schemaMatchesType: SchemaMatchesType = true;
void _schemaMatchesType;

/**
 * Сторінка для зліпка або null, якщо її нема чого показувати.
 *
 * Помилки парсингу в публічну версію не потрапляють навмисно: «не вдалося
 * завантажити» — робоча інформація для власника сесії, а читачеві посилання
 * вона говорить лише те, що частина роботи не вийшла.
 */
function toSharedPage(analysis: PageAnalysis | null): SharedPage | null {
  if (!analysis?.page || analysis.status !== "success") return null;

  return {
    // finalUrl, а не url: у публічну версію йде та адреса, з якої реально взято
    // контент, — після редиректів вона може бути іншою.
    url: analysis.page.meta.finalUrl || analysis.url,
    analyzedAt: analysis.analyzedAt,
    page: analysis.page,
  };
}

export function buildSnapshot(
  session: Session,
  sections: SharedSections,
  /** Чинний текст вимог — заморожується разом з рештою зліпка. */
  requirements: string,
): ShareSnapshot {
  // Той самий isUsable, що вирішує склад промпта: публікуються рівно ті
  // сторінки, з яких складено ТЗ. Виключена вручну сторінка не годиться як
  // зразок — показувати її клієнтові як джерело тим паче нема сенсу.
  const pages = sections.analyses
    ? session.analyses
        .filter(isUsable)
        .map(toSharedPage)
        .filter((page): page is SharedPage => page !== null)
    : [];

  return {
    name: session.name,
    topic: session.topic,
    // ТЗ входить завжди, коли існує: воно — результат роботи, і публікувати
    // сесію без нього нема сенсу. Вибір стосується решти розділів.
    brief: session.brief,
    requirements,
    pages,
    ownPage: sections.comparison ? toSharedPage(session.ownPage) : null,
    comparison: sections.comparison ? session.comparison : null,
  };
}

/**
 * true, якщо публікувати нічого. Порожнє посилання гірше за відмову: воно
 * виглядає працездатним, і автор дізнається про порожню сторінку від того,
 * кому вже його надіслав.
 */
export function isEmptySnapshot(snapshot: ShareSnapshot): boolean {
  return (
    snapshot.brief === null &&
    snapshot.pages.length === 0 &&
    snapshot.ownPage === null &&
    snapshot.comparison === null
  );
}
