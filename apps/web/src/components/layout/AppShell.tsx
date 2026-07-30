import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { HealthBadge } from "../HealthBadge";
import { ThemeToggle } from "../ThemeToggle";
import { CloseIcon, MenuIcon } from "../ui/Icon";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
}

/**
 * Двоколонковий каркас: список сесій зліва, робоча область справа —
 * як у ChatGPT, Gemini і Claude.
 *
 * На вузьких екранах панель стає шухлядою: 17rem від 360px екрана
 * не лишає місця під сам вміст.
 */
export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Перехід на іншу сторінку має закривати шухляду: інакше після вибору
  // сесії користувач лишається дивитися на список, який щойно закрив.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setDrawerOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh">
      {/* Перша ланка в tab-порядку: інакше з клавіатури до вмісту доводиться
          щоразу проходити крізь увесь список сесій. Видима лише у фокусі. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3
          focus:z-50 focus:rounded-control focus:bg-accent-solid focus:px-3
          focus:py-2 focus:text-sm focus:text-accent-ink"
      >
        Перейти до вмісту
      </a>

      {/* Постійна панель на широких екранах. */}
      <aside className="hidden w-68 shrink-0 border-r border-line lg:block">
        <div className="sticky top-0 h-dvh">
          <Sidebar />
        </div>
      </aside>

      {/* Шухляда на вузьких. hidden замість умовного рендеру дав би
          анімацію, але й тримав би список у DOM на кожній сторінці. */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-fg/25 backdrop-blur-[1px] lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-68 border-r border-line lg:hidden"
            aria-label="Список сесій"
          >
            <div className="flex h-full flex-col">
              <div className="flex justify-end bg-inset px-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Закрити список сесій"
                  className="grid size-9 place-items-center rounded-control text-subtle hover:bg-hover hover:text-fg"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <Sidebar onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Шапка липка: сторінка ТЗ довга, і повертатися до перемикача теми
            чи стану сервера прокруткою вгору незручно. */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Відкрити список сесій"
              className="-ml-1 grid size-9 place-items-center rounded-control text-muted hover:bg-hover hover:text-fg lg:hidden"
            >
              <MenuIcon />
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              {/* Стан сервера на вузьких екранах ховаємо: перемикач теми
                  важливіший, а бейдж дублюється помилкою на самій сторінці. */}
              <span className="hidden sm:inline">
                <HealthBadge />
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
