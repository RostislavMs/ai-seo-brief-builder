import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "./AuthContext";

/**
 * Пропускає далі лише авторизованих. Поки Supabase відновлює збережену
 * сесію, показує спінер — без цієї паузи перезавантаження сторінки
 * встигало б перекинути на /login і назад.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (status === "anonymous") {
    // Запам'ятовуємо шлях: після входу повернемо саме на нього,
    // а не на головну.
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return <>{children}</>;
}
