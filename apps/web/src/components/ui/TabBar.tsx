export interface TabItem<TId extends string> {
  id: TId;
  label: string;
  /** Число або крапка поруч із назвою. null — нічого не показувати. */
  badge?: string | null;
}

interface TabBarProps<TId extends string> {
  items: readonly TabItem<TId>[];
  active: TId;
  onSelect: (id: TId) => void;
}

/**
 * Вкладки робочої області. Один компонент на сесію та її публічну версію:
 * вкладки в них ті самі, і розійтися вони не мають — публічна сторінка
 * повинна виглядати як та сама сесія, тільки без кнопок.
 */
export function TabBar<TId extends string>({
  items,
  active,
  onSelect,
}: TabBarProps<TId>) {
  return (
    // overflow-x-auto: чотири вкладки з бейджами не влазять у 320px,
    // і горизонтальна прокрутка тут краща за перенос рядка.
    <div className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const current = item.id === active;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={current ? "true" : undefined}
              /*
               * Без -mb-px, хоч підкреслення активної вкладки й «просило» б
               * його, щоб накрити лінію контейнера. Причина: overflow-x
               * робить цей контейнер скрол-контейнером по обох осях (не-visible
               * по одній осі змушує другу стати auto), а негативний відступ
               * виносить бордер кнопки на 1px нижче контентбоксу — і цей 1px
               * дає вертикальний скролбар зі стрілками поверх вкладок.
               * Тому підкреслення стоїть над лінією, а не на ній.
               */
              className={`shrink-0 border-b-2 px-3.5 py-2.5 text-sm
                transition-colors duration-150 ease-out sm:px-4 ${
                  current
                    ? "border-accent font-medium text-fg"
                    : "border-transparent text-subtle hover:border-line-strong hover:text-fg"
                }`}
            >
              {item.label}
              {item.badge && (
                <span
                  className={`num ml-1.5 text-2xs ${
                    current ? "text-accent" : "text-subtle"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
