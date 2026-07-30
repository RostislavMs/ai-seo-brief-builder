import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAccount } from "../auth/AccountContext";
import { ImportLocalBanner } from "../components/sessions/ImportLocalBanner";
import { NewSessionForm } from "../components/sessions/NewSessionForm";
import { SessionCard } from "../components/sessions/SessionCard";
import { Callout } from "../components/ui/Callout";
import { useSessions } from "../sessions/SessionsContext";
import type { CreateSessionInput } from "../services/sessions";

/** Скільки останніх сесій дублювати на головній. */
const RECENT_LIMIT = 5;

export function HomePage() {
  const navigate = useNavigate();
  const { sessions, create, remove } = useSessions();
  const { me, error: accountError } = useAccount();
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(input: CreateSessionInput): Promise<void> {
    setError(null);

    try {
      const session = await create(input);
      // Аналіз стартує автоматично на екрані сесії.
      navigate(`/session/${session.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не вдалося створити сесію.",
      );
    }
  }

  const recent = sessions.slice(0, RECENT_LIMIT);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Нова сесія</h1>
        <p className="mt-1 text-sm leading-relaxed text-subtle">
          Аналіз конкурентів за URL і генерація SEO ТЗ для статті.
        </p>
      </div>

      {/* Найчастіша причина — не накочена міграція. Повідомлення сервера
          вже пояснює, що робити, тому показуємо його дослівно. */}
      {accountError && <Callout tone="danger">{accountError}</Callout>}

      {me?.effective.source === "none" && (
        <Callout tone="warn">
          Не додано жодного ключа AI — згенерувати ТЗ не вийде. Додайте ключ
          Gemini, OpenAI або Claude у{" "}
          <Link to="/settings" className="underline">
            налаштуваннях
          </Link>
          . Парсинг сторінок працює і без нього.
        </Callout>
      )}

      <ImportLocalBanner />

      {error && (
        <Callout tone="danger" live>
          {error}
        </Callout>
      )}

      <NewSessionForm onCreate={(input) => void handleCreate(input)} />

      {/*
       * Дублюємо останні сесії тут навмисно: на вузьких екранах бічна
       * панель схована в шухляду, і без цього списку відкрити недавню
       * сесію можна лише через два натискання.
       */}
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Останні сесії</h2>

          <div className="space-y-2">
            {recent.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onDelete={(id) => void remove(id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
