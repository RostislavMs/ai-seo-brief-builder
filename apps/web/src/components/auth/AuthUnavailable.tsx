import { AuthLayout } from "../layout/AuthLayout";
import { Callout } from "../ui/Callout";

/**
 * Замінює форму входу, коли у фронта немає ключів Supabase.
 *
 * Без цього екрана застосунок мовчки показував би форму, яка не працює:
 * натискання «Увійти» падало б із винятком у консолі, а користувач бачив
 * би завислу кнопку.
 */
export function AuthUnavailable() {
  return (
    <AuthLayout
      title="Авторизація не налаштована"
      description="Застосунок не бачить проєкту Supabase, тому вхід недоступний."
    >
      <div className="space-y-4">
        <Callout tone="warn">
          Створіть <code className="font-mono">apps/web/.env</code> за зразком{" "}
          <code className="font-mono">.env.example</code> і перезапустіть{" "}
          <code className="font-mono">pnpm dev</code>.
        </Callout>

        <div className="panel space-y-1 p-3 font-mono text-2xs leading-relaxed text-muted">
          <p>VITE_SUPABASE_URL=https://ваш-проєкт.supabase.co</p>
          <p>VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…</p>
        </div>

        <p className="text-xs leading-relaxed text-subtle">
          Значення — у Supabase Dashboard → Project Settings → API. Серверу
          потрібні свої змінні: див.{" "}
          <code className="font-mono">apps/server/.env.example</code>.
        </p>
      </div>
    </AuthLayout>
  );
}
