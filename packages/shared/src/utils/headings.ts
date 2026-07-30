import type { GroupedHeadings, Heading } from "../types/page";

/**
 * Розкладає упорядкований список заголовків у формат h1/h2/h3/h4 з розділу 7 ТЗ.
 * Джерело правди — `Heading[]`, це похідне представлення для UI.
 */
export function groupHeadings(headings: readonly Heading[]): GroupedHeadings {
  const grouped: GroupedHeadings = { h1: [], h2: [], h3: [], h4: [] };

  for (const heading of headings) {
    switch (heading.level) {
      case 1:
        grouped.h1.push(heading.text);
        break;
      case 2:
        grouped.h2.push(heading.text);
        break;
      case 3:
        grouped.h3.push(heading.text);
        break;
      case 4:
        grouped.h4.push(heading.text);
        break;
    }
  }

  return grouped;
}

/**
 * Текстове дерево заголовків з відступами — компактне представлення структури
 * для промпта AI та для превʼю в UI.
 */
export function outlineToText(headings: readonly Heading[]): string {
  return headings
    .map((h) => `${"  ".repeat(h.level - 1)}H${h.level}: ${h.text}`)
    .join("\n");
}
