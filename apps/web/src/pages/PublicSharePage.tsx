import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { PublicShare } from "@brief/shared";
import { IntroBlock } from "../components/brief/IntroBlock";
import { KeywordTable } from "../components/brief/KeywordTable";
import { MetaBlock } from "../components/brief/MetaBlock";
import { Recommendations } from "../components/brief/Recommendations";
import { StructureTree } from "../components/brief/StructureTree";
import { ComparisonReport } from "../components/compare/ComparisonReport";
import { PublicShell } from "../components/layout/PublicShell";
import {
  SharedPageCard,
  SharedPageList,
} from "../components/share/SharedPageList";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { TabBar, type TabItem } from "../components/ui/TabBar";
import { ApiRequestError } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { loadPublicShare } from "../services/shares";

/**
 * Публічна версія сесії — /p/:token.
 *
 * Живе поза RequireAuth: посилання відкривають люди, яких у застосунку немає.
 * Через це сторінка не звертається ні до контексту акаунта, ні до списку
 * сесій — усе, що вона показує, приходить одним запитом за токеном.
 *
 * Вкладки збігаються з робочою сесією, але зʼявляються лише ті, у яких є
 * вміст: автор міг опублікувати саме ТЗ, а міг — увесь набір. Чату немає
 * ніколи, і це вирішується не тут, а в самому зліпку.
 */

type Tab = "brief" | "pages" | "own";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; share: PublicShare }
  | { status: "error"; message: string };

export function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("brief");

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "Посилання неповне." });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    void (async () => {
      try {
        const share = await loadPublicShare(token, controller.signal);
        setState({ status: "ready", share });
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === "aborted") return;

        setState({
          status: "error",
          // Повідомлення сервера тут інформативніше за власний текст: воно
          // розрізняє «немає такого посилання» і «зліпок у старому форматі,
          // попросіть автора оновити».
          message:
            error instanceof Error
              ? error.message
              : "Не вдалося завантажити публічну версію.",
        });
      }
    })();

    return () => controller.abort();
  }, [token]);

  /**
   * Назва сесії в заголовку вкладки браузера. Публічне посилання часто
   * тримають відкритим поряд з іншими, і «AI SEO Brief Builder» у всіх
   * однаковий.
   */
  const name = state.status === "ready" ? state.share.snapshot.name : null;

  useEffect(() => {
    if (!name) return;

    const previous = document.title;
    document.title = `${name} — SEO ТЗ`;

    return () => {
      document.title = previous;
    };
  }, [name]);

  if (state.status === "loading") {
    return (
      <PublicShell>
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      </PublicShell>
    );
  }

  if (state.status === "error") {
    return (
      <PublicShell>
        <EmptyState title="Сторінка недоступна" description={state.message} />
      </PublicShell>
    );
  }

  const { snapshot, publishedAt } = state.share;

  // Склад вкладок — з вмісту зліпка, а не з вибору автора: розділ, який він
  // увімкнув, міг лишитися порожнім, і вкладка без нічого гірша за її
  // відсутність.
  const hasPages = snapshot.pages.length > 0;
  const hasOwn = snapshot.ownPage !== null || snapshot.comparison !== null;

  const tabs: TabItem<Tab>[] = [
    ...(snapshot.brief ? [{ id: "brief" as const, label: "SEO ТЗ" }] : []),
    ...(hasPages
      ? [
          {
            id: "pages" as const,
            label: "Аналіз",
            badge: String(snapshot.pages.length),
          },
        ]
      : []),
    ...(hasOwn
      ? [
          {
            id: "own" as const,
            label: "Моя сторінка",
            badge: snapshot.comparison
              ? String(snapshot.comparison.score.total)
              : null,
          },
        ]
      : []),
  ];

  // Перша наявна вкладка як активна: за замовчуванням стоїть «SEO ТЗ», а його
  // могли не публікувати — тоді сторінка відкрилася б порожньою.
  const active = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id;

  return (
    <PublicShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{snapshot.name}</h1>

          {snapshot.topic && snapshot.topic !== snapshot.name && (
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {snapshot.topic}
            </p>
          )}

          <p className="num mt-1.5 text-2xs text-subtle">
            опубліковано {formatDateTime(publishedAt)}
          </p>
        </div>

        {tabs.length > 1 && active && (
          <TabBar items={tabs} active={active} onSelect={setTab} />
        )}

        {active === "brief" && snapshot.brief && (
          <div className="space-y-4">
            <MetaBlock brief={snapshot.brief} />
            <IntroBlock intro={snapshot.brief.intro} />
            <StructureTree brief={snapshot.brief} />
            <KeywordTable keywords={snapshot.brief.keywords} />
            <Recommendations recommendations={snapshot.brief.recommendations} />
          </div>
        )}

        {active === "pages" && <SharedPageList pages={snapshot.pages} />}

        {active === "own" && (
          <div className="space-y-4">
            {snapshot.ownPage && <SharedPageCard item={snapshot.ownPage} />}
            {snapshot.comparison && (
              <ComparisonReport comparison={snapshot.comparison} />
            )}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
