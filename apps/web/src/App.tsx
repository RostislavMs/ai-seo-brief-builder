import { Route, Routes, useLocation } from "react-router";
import { AccountProvider } from "./auth/AccountContext";
import { RequireAuth } from "./auth/RequireAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RulesPage } from "./pages/RulesPage";
import { SessionPage } from "./pages/SessionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { SessionsProvider } from "./sessions/SessionsContext";

/**
 * Сторінки застосунку живуть усередині RequireAuth, тому контексти акаунта
 * й сесій монтуються теж там: до входу їм нема чого завантажувати, а зайвий
 * запит на /api/me одразу дав би 401.
 */
function AuthenticatedArea() {
  const location = useLocation();

  return (
    <RequireAuth>
      <AccountProvider>
        <SessionsProvider>
          <AppShell>
            {/* key за маршрутом: перехід на іншу сторінку скидає впійману
                помилку, інакше користувач лишався б із нею до перезавантаження. */}
            <ErrorBoundary key={location.pathname}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/session/:id" element={<SessionPage />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </ErrorBoundary>
          </AppShell>
        </SessionsProvider>
      </AccountProvider>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<AuthenticatedArea />} />
    </Routes>
  );
}
