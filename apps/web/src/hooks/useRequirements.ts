import { useEffect, useState } from "react";
import type { WriterRequirementGroup } from "@brief/shared";
import { WRITER_REQUIREMENTS, parseRequirements } from "@brief/shared";
import { fetchRequirements } from "../services/analysis";

/**
 * Чинні вимоги до тексту — те, що дописується в кінець кожного ТЗ.
 *
 * Стану завантаження назовні немає навмисно. Поки відповідь не прийшла (а
 * якщо сервер недоступний — то й зовсім), діють початкові вимоги з коду:
 * вони не порожні й у переважній більшості випадків саме ті, що треба, бо
 * правлять цей текст рідко. Спінер на місці блока, який майже ніколи не
 * змінюється, коштував би більше, ніж дає.
 *
 * Тому й помилка лише в лог: ТЗ від неї не втрачає жодного розділу, а
 * повідомлення «не вдалося прочитати вимоги» над готовим ТЗ виглядало б
 * як поломка самого ТЗ.
 */
export function useRequirements(): readonly WriterRequirementGroup[] {
  const [groups, setGroups] =
    useState<readonly WriterRequirementGroup[]>(WRITER_REQUIREMENTS);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        setGroups(parseRequirements(await fetchRequirements(controller.signal)));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[requirements] лишаємо початкові вимоги:", error);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  return groups;
}
