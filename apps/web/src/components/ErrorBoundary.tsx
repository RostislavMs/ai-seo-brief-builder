import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Порада під заголовком. Замовчування розраховане на сторінки застосунку;
   * публічній версії сесії потрібна інша — її читач не має ні списку сесій,
   * ні кнопки «згенерувати ТЗ».
   */
  description?: string;
  /** false — прибирає посилання на список сесій (для сторінок без входу). */
  homeLink?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Ловить помилки рендеру, щоб одна зламана деталь не гасила весь застосунок.
 *
 * Причина конкретна: після зміни формату ТЗ старі дані в localStorage дали
 * `Cannot read properties of undefined` — і користувач побачив цілком чорний
 * екран без жодної підказки. Дані виправлені міграцією, але страховка потрібна:
 * повна відмова інтерфейсу — надто дорога ціна за один невірний доступ до поля.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ui] помилка рендеру:", error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, description, homeLink = true } = this.props;

    if (!error) return children;

    return (
      <div className="card space-y-4 p-4 sm:p-6" role="alert">
        <div>
          <h2 className="text-sm font-semibold text-danger">
            Щось зламалося під час відображення
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-subtle">
            {description ??
              "Решта застосунку працює. Якщо це стара сесія, найпростіше — " +
                "згенерувати ТЗ заново."}
          </p>
        </div>

        <pre className="panel overflow-x-auto p-3 text-xs text-muted">
          {error.message}
        </pre>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-ghost" onClick={this.reset}>
            Спробувати ще раз
          </button>
          {homeLink && (
            <a href="/" className="btn-ghost">
              До списку сесій
            </a>
          )}
        </div>
      </div>
    );
  }
}
