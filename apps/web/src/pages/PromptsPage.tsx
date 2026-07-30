import { useMemo } from "react";
import type { PromptGroup, PromptTemplate } from "@brief/shared";
import { useAccount } from "../auth/AccountContext";
import { PromptCard } from "../components/prompts/PromptCard";
import { Badge } from "../components/ui/Badge";
import { Callout } from "../components/ui/Callout";
import { Spinner } from "../components/ui/Spinner";
import { usePrompts } from "../hooks/usePrompts";
import { plural } from "../lib/format";

/**
 * Промпти до моделі.
 *
 * Один екран на обидві ролі, як і в правил для мов: текст завдання для моделі —
 * це відповідь на питання «чому ТЗ вийшло саме таким», і бачити його має
 * кожен, хто цим ТЗ користується. Роль додає кнопки правки, а не другу
 * сторінку.
 *
 * Групування за сценарієм, а не суцільний список: промпт генерації і промпт
 * порівняння працюють у різних вкладках сесії, і шукають їх саме так. Спільні
 * блоки — останні: правка в них зачіпає кілька сценаріїв одразу, і про це
 * краще прочитати, дійшовши до них, ніж наткнутися першим рядком.
 */

interface Group {
  id: PromptGroup;
  title: string;
  description: string;
}

const GROUPS: readonly Group[] = [
  {
    id: "brief",
    title: "Генерація ТЗ",
    description:
      "Що модель отримує і що має скласти, коли натиснуто «Згенерувати SEO ТЗ».",
  },
  {
    id: "chat",
    title: "Правки через чат",
    description:
      "Той самий сценарій, але поверх готового ТЗ: модель має змінити рівно " +
      "те, про що просять, і не зачепити решту.",
  },
  {
    id: "compare",
    title: "Моя сторінка",
    description:
      "Аналіз власної сторінки проти конкурентів — вкладка «Моя сторінка».",
  },
  {
    id: "shared",
    title: "Спільні блоки",
    description:
      "Дописуються в кілька промптів одразу, тому правка тут зачіпає більше, " +
      "ніж один сценарій.",
  },
];

export function PromptsPage() {
  const { me } = useAccount();
  const { loadState, error, prompts, busyKey, actionError, save, reset } =
    usePrompts();

  const isAdmin = me?.profile.role === "admin";

  /** Скільки промптів відходить від початкового тексту. */
  const changed = useMemo(
    () => prompts.filter((prompt) => !prompt.isDefault).length,
    [prompts],
  );

  const byGroup = useMemo(() => {
    const map = new Map<PromptGroup, PromptTemplate[]>();

    for (const prompt of prompts) {
      const list = map.get(prompt.group) ?? [];
      list.push(prompt);
      map.set(prompt.group, list);
    }

    return map;
  }, [prompts]);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (loadState === "error") {
    return <Callout tone="danger">{error}</Callout>;
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Промпти</h1>
          {isAdmin && <Badge tone="accent">адміністратор</Badge>}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-subtle">
          Текст завдання, який іде в модель на кожній генерації. Вставки на
          кшталт <span className="num">{"{{pagesJson}}"}</span> сервер заповнює
          сам — прибрати обовʼязкову з них не вийде, бо саме ними в промпт
          потрапляють дані.
        </p>
      </div>

      {/* Підсумок: без нього незрозуміло, чи промпти взагалі правили, доки
          не проглянеш усі вісім карток. */}
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
        <span className="text-subtle">
          Промптів: <span className="num text-fg">{prompts.length}</span>
        </span>
        {changed > 0 ? (
          <span className="text-warn">
            змінених: <span className="num">{changed}</span>
          </span>
        ) : (
          <span className="text-subtle">усі в початковому вигляді</span>
        )}
        <span className="text-subtle">
          усього{" "}
          <span className="num text-fg">
            {prompts
              .reduce((sum, prompt) => sum + prompt.body.length, 0)
              .toLocaleString("uk-UA")}
          </span>{" "}
          символів
        </span>
      </div>

      {!isAdmin && (
        <Callout tone="info" size="xs">
          Промпти правлять адміністратори: цей текст діє на ТЗ усіх
          користувачів. Тут його видно повністю — саме за ним генерується ваше
          ТЗ.
        </Callout>
      )}

      {actionError && (
        <Callout tone="danger" live>
          {actionError}
        </Callout>
      )}

      {GROUPS.map((group) => {
        const items = byGroup.get(group.id) ?? [];
        if (items.length === 0) return null;

        return (
          <section key={group.id} className="space-y-3">
            <div className="border-t border-line pt-4">
              <h2 className="text-sm font-semibold">
                {group.title}{" "}
                <span className="num text-subtle">
                  ({items.length}{" "}
                  {plural(items.length, "промпт", "промпти", "промптів")})
                </span>
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-subtle">
                {group.description}
              </p>
            </div>

            <ul className="space-y-3">
              {items.map((prompt) => (
                <PromptCard
                  key={prompt.key}
                  prompt={prompt}
                  isAdmin={Boolean(isAdmin)}
                  busy={busyKey === prompt.key}
                  onSave={save}
                  onReset={reset}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
