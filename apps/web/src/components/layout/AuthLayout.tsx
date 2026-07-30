import type { ReactNode } from "react";
import { ThemeToggle } from "../ThemeToggle";

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Посилання під карткою: «немає акаунта?», «згадали пароль?». */
  footer?: ReactNode;
}

/**
 * Каркас сторінок входу. Без бічної панелі навмисно: до авторизації
 * показувати в ній нема чого, а порожня колонка збиває з пантелику.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex justify-end px-4 py-3 sm:px-6">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0 sm:pb-24">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-inset bg-accent-solid font-mono text-xs font-bold text-accent-ink">
              AI
            </span>
            <span className="text-sm font-semibold">SEO Brief Builder</span>
          </div>

          <h1 className="text-xl font-semibold">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed text-subtle">
              {description}
            </p>
          )}

          <div className="mt-6">{children}</div>

          {footer && (
            <div className="mt-6 text-sm text-subtle">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}
