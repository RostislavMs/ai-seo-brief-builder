import type { ReactNode } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { ThemeToggle } from "../ThemeToggle";

/**
 * Каркас публічної сторінки.
 *
 * Без бічної панелі, без бейджа стану сервера й без переходів у застосунок:
 * той, хто відкрив посилання, здебільшого акаунта не має, і список сесій із
 * налаштуваннями показував би йому суцільні глухі кути. Лишається те, що
 * стосується читання: сам вміст і перемикач теми.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3
          focus:z-50 focus:rounded-control focus:bg-accent-solid focus:px-3
          focus:py-2 focus:text-sm focus:text-accent-ink"
      >
        Перейти до вмісту
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <span className="text-sm font-semibold">AI SEO Brief Builder</span>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10"
      >
        {/* Страховка від чорного екрана в читача: зліпок перевіряється схемою
            на сервері, але помилка рендеру можлива й без битих даних, а тут
            нікому не підкажеш «перегенеруйте ТЗ». */}
        <ErrorBoundary
          description="Спробуйте перезавантажити сторінку. Якщо не допомагає — попросіть автора оновити публічну версію."
          homeLink={false}
        >
          {children}
        </ErrorBoundary>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-4xl px-4 py-4 text-2xs text-subtle sm:px-6">
          Публічна версія SEO ТЗ. Вміст замерз на момент публікації — автор
          оновлює його окремою дією.
        </p>
      </footer>
    </div>
  );
}
