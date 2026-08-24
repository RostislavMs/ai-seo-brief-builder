import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SeoBrief } from "@brief/shared";
import {
  changedAt,
  valueAt,
  withInserted,
  withMoved,
  withRemoved,
  withValue,
  type BriefPath,
} from "../../../lib/briefEdit";

/**
 * Правка ТЗ, доступна всім компонентам панелі.
 *
 * Контекст, а не props: ТЗ малюють десять компонентів на чотири рівні
 * вкладеності, і протягнути через них шість колбеків означало б додати
 * однакові чотири рядки в кожен — включно з тими, що самі нічого не правлять
 * і лише передають далі.
 *
 * За замовчуванням правка вимкнена, і це головне в цьому файлі: ті самі
 * компоненти малюють публічне посилання (pages/PublicSharePage), де ТЗ читають
 * чужі люди. Без провайдера `editable` — false, а всі операції пусті, тому
 * «редагується» не може ввімкнутися випадково: для цього треба поставити
 * провайдер і дати йому onChange.
 */

export interface BriefEdit {
  /** Чи показувати поля як редаговані. false — звичайний перегляд. */
  editable: boolean;
  /** Замінює значення за шляхом. */
  set(path: BriefPath, value: unknown): void;
  /** Додає елемент у масив за шляхом, на позицію index. */
  insert(path: BriefPath, index: number, item: unknown): void;
  remove(path: BriefPath, index: number): void;
  move(path: BriefPath, from: number, to: number): void;
  /** Чи розійшлося значення за шляхом із машинною версією. */
  changed(path: BriefPath): boolean;
  /** Повертає значення за шляхом до машинної версії. */
  revert(path: BriefPath): void;
}

const READ_ONLY: BriefEdit = {
  editable: false,
  set: () => undefined,
  insert: () => undefined,
  remove: () => undefined,
  move: () => undefined,
  changed: () => false,
  revert: () => undefined,
};

const BriefEditContext = createContext<BriefEdit>(READ_ONLY);

export function useBriefEdit(): BriefEdit {
  return useContext(BriefEditContext);
}

interface BriefEditProviderProps {
  /** Поточне ТЗ — те, що показується. Потрібне лише для позначок «змінено». */
  brief: SeoBrief;
  /**
   * Машинна версія ТЗ. `null` — сесія, ТЗ якої записала версія до появи
   * оригіналу: тоді позначок і повернення немає, а сам оригінал запише перша
   * ж правка (див. useSession).
   */
  original: SeoBrief | null;
  /**
   * Правка. Функцією від попереднього ТЗ, а не готовим значенням: поля
   * зберігаються самі, під час набору, і дві правки можуть статися до
   * наступної перемальовки. Готове значення в такому разі рахувалося б від
   * застарілого ТЗ і перетирало б сусідню правку.
   */
  onChange: (compute: (brief: SeoBrief) => SeoBrief) => void;
  children: ReactNode;
}

export function BriefEditProvider({
  brief,
  original,
  onChange,
  children,
}: BriefEditProviderProps) {
  const value = useMemo<BriefEdit>(
    () => ({
      editable: true,
      set: (path, next) => onChange((current) => withValue(current, path, next)),
      insert: (path, index, item) =>
        onChange((current) => withInserted(current, path, index, item)),
      remove: (path, index) =>
        onChange((current) => withRemoved(current, path, index)),
      move: (path, from, to) =>
        onChange((current) => withMoved(current, path, from, to)),
      changed: (path) => changedAt(brief, original, path),
      // Значення беремо з оригіналу на момент кліку, а не з `current`
      // всередині: повертати треба саме машинне, і воно від часу не залежить.
      revert: (path) =>
        onChange((current) =>
          original ? withValue(current, path, valueAt(original, path)) : current,
        ),
    }),
    [brief, onChange, original],
  );

  return (
    <BriefEditContext.Provider value={value}>{children}</BriefEditContext.Provider>
  );
}
