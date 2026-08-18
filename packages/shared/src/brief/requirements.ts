/**
 * Постійні вимоги до тексту, які додаються в кінець кожного ТЗ.
 *
 * Це не робота моделі. У реальних ТЗ агентства ці блоки стоять під структурою
 * й таблицею ключів незмінними — вісім референсних документів різних мов і
 * обсягів збігаються в них посимвольно. Просити модель відтворювати незмінний
 * текст означало б платити за нього токенами й щоразу отримувати трохи інше
 * формулювання.
 *
 * Тому текст живе поряд із промптами: початковий — у коді, правка адміна —
 * у базі, з історією й скиданням (ключ `document.requirements`). Різниця в
 * тому, куди він іде: промпт іде в модель, а це — в документ для райтера.
 *
 * Модуль у спільному пакеті, бо ним користуються всі три сторони: сервер
 * тримає початковий текст і перевіряє правку, інтерфейс показує вимоги,
 * а збирач документа вкладає їх у те, що копіюється в Google Docs.
 *
 * Англійською навмисно: як і `instruction`, це вказівки райтеру, і ТЗ
 * віддається йому в тому вигляді, в якому воно тут.
 */

/** Один пункт вимог; `children` — уточнення під ним. */
export interface WriterRequirement {
  text: string;
  children?: string[];
}

export interface WriterRequirementGroup {
  /** Заголовок блока — англійською, як і самі вимоги. */
  title: string;
  items: WriterRequirement[];
}

/**
 * Початковий текст вимог — те, до чого повертає скидання.
 *
 * Формат навмисно найпростіший із можливих: `#` — заголовок блока, `- ` —
 * пункт, `- ` з відступом — уточнення під попереднім пунктом. Нумерація не
 * зберігається, а проставляється при показі: інакше вставлений посередині
 * пункт вимагав би переписати весь блок руками, і рано чи пізно в ньому
 * зʼявилося б дві сьомих.
 */
export const DEFAULT_REQUIREMENTS = `# The most important requirements
- Text READABILITY level should correspond with grade 8/9 or lower as per hemingwayapp.
- Minimize the use of Passive voice.
- Minimize using the following words and phrases: you can, able to, available, must, should, will, can be, ensure.
- Avoid using too many identical syntactic constructs, especially in the beginning of the sentence. For example, [This ensures… This ensures…], [It is… It is…], [This is… This is…], [In addition to… In addition to…], etc.
- Insert the anchors naturally according to the text context. Do not insert anchors at the beginning or the end of the sentence. Insert the anchors in the middle of a sentence with related words or phrases depending on the article's topic and landing page. The distance between anchors should be at least 500 characters without spaces, ideally 100-150 words. The text should be filled with keys relevant to the acceptor (the whole text, not just a paragraph with a link). Note: if the link is about the best online games, the paragraph where you place the link has to be also about the best online games.
- Don't use too short sentences, e.g.: "What more?". Avoid using too many interrogative, exclamatory, or meaningless sentences.
- DO NOT write sentences without a subject and a predicate.
- The essence of the acceptor inserted into the text should be revealed in more than 2 sentences.
- Keywords should be distributed throughout the text. There should be no concentration of keywords only in individual paragraphs. Use topic-specific keywords.
- Make the headings h2 and h3 informative and understandable. The title should describe the content of the paragraph. Always rewrite the subheadings, do not write the text using all the sentences from the examples.
- The article should be regionally oriented, if possible, but specifically for the region of our site.
- Water needs to be < 50%, Naturalness needs to be > 80%.

# Characteristics
- Uniqueness: 100
- Text type: Commercial
- Tonality of the text: Positive
- Need lists: Yes
- Need tables: Yes

# Important requirements
- The number of ADVERBS has to correspond with Hemingway app requirements per 1000 words.
- Minimize the use of Inversion.
- Use transitive words and constructions to present thoughts logically.
  - See here for more: https://yoast.com/transition-words-why-and-how-to-use-them/
  - Use complex nouns: not the industry of entertainment, but the entertainment industry.
- Do not use the words: punters, venues, establishments, gambling house and similar synonyms.
- An introduction and conclusion are required.
- The introduction should be about 120 words MAXIMUM.
- The conclusion should be informative, summarize the article, and state the author's final opinion according to the article's topic. Write a good and informative summary, not just the same info in other words. There should be about 100-200 words.
- Make the content readable, coherent, and interesting to read. Use examples to explain ideas.
- Don't make sentences too long. They should be simple and easy to read. Sentences should not be longer than 25 words.
- Don't put the links close to each other — distribute links evenly throughout the text.
- Do not insert links at the beginning or end of the sentence.`;

/** `# Заголовок` */
const GROUP_LINE = /^#\s+(.*)$/;
/** `- пункт` або `  - уточнення`; відступ вирішує рівень. */
const ITEM_LINE = /^(\s*)[-*]\s+(.*)$/;

/**
 * Розбирає текст вимог у блоки з пунктами.
 *
 * Пробачливий навмисно: порожні рядки й будь-який інший текст ігноруються,
 * а не валять розбір. Форму гарантує не цей код, а перевірка при збереженні
 * (`requirementsProblem`) — тут же текст уже збережений, і показати райтеру
 * усе, що вдалося прочитати, краще, ніж не показати нічого.
 *
 * Уточнення без пункту над ним стає звичайним пунктом: це описка у відступі,
 * і мовчки викинути через неї рядок вимог — найгірше, що можна зробити.
 */
export function parseRequirements(text: string): WriterRequirementGroup[] {
  const groups: WriterRequirementGroup[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const group = GROUP_LINE.exec(line);

    if (group) {
      const title = group[1]!.trim();
      if (title) groups.push({ title, items: [] });
      continue;
    }

    const item = ITEM_LINE.exec(line);
    if (!item) continue;

    const value = item[2]!.trim();
    if (!value) continue;

    // Пункт до першого заголовка теж має бути видно, тому блок створюється
    // без назви, а не пропускається разом із текстом.
    const current = groups.at(-1) ?? { title: "", items: [] };
    if (groups.length === 0) groups.push(current);

    const nested = item[1]!.length > 0;
    const parent = current.items.at(-1);

    if (nested && parent) {
      parent.children = [...(parent.children ?? []), value];
    } else {
      current.items.push({ text: value });
    }
  }

  return groups;
}

/**
 * Що не так із текстом вимог, або null — усе гаразд.
 *
 * Перевіряється лише форма: вимоги пише людина, і судити їх зміст код не
 * береться. Але блок без жодного пункту чи текст, у якому немає нічого
 * схожого на перелік, — це не «інший стиль», а порожній хвіст у кожному ТЗ,
 * і побачити це до збереження дешевше, ніж після.
 */
export function requirementsProblem(text: string): string | null {
  const groups = parseRequirements(text);

  if (groups.length === 0) {
    return (
      "Не знайдено жодного блока вимог. Рядок «# Назва блока» задає заголовок, " +
      "рядок «- вимога» — пункт під ним."
    );
  }

  if (groups.some((group) => !group.title)) {
    return (
      "Пункти на початку стоять без заголовка. Додайте перед ними рядок " +
      "«# Назва блока»."
    );
  }

  const empty = groups.find((group) => group.items.length === 0);

  if (empty) {
    return (
      `Блок «${empty.title}» лишився без жодного пункту. Або додайте пункти ` +
      "«- вимога», або приберіть заголовок."
    );
  }

  return null;
}

/** Початкові вимоги вже розібрані — стан «правок не було». */
export const WRITER_REQUIREMENTS: readonly WriterRequirementGroup[] =
  parseRequirements(DEFAULT_REQUIREMENTS);
