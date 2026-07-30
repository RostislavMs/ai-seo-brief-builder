import { useCallback, useMemo } from "react";
import { ALL_LANGUAGES } from "@brief/shared";
import { useAccount } from "../auth/AccountContext";
import { LanguagePicker } from "../components/rules/LanguagePicker";
import { RuleCard } from "../components/rules/RuleCard";
import { RuleForm } from "../components/rules/RuleForm";
import { Badge } from "../components/ui/Badge";
import { Callout } from "../components/ui/Callout";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useLanguageRules } from "../hooks/useLanguageRules";
import { plural } from "../lib/format";
import { scopeFullName } from "../lib/ruleScope";

/**
 * Правила для мов.
 *
 * Один екран на обидві ролі, а не окремий «адмінський розділ»: правила ті
 * самі, і бачити, за якими вимогами генерується його ТЗ, має кожен. Роль
 * додає кнопки розгляду, а не другу сторінку.
 *
 * Черга пропозицій стоїть над списком мови й охоплює всі мови одразу.
 * Інакше адмін дізнавався б про нову пропозицію лише випадково — відкривши
 * саму ту мову з 183.
 */
export function RulesPage() {
  const { me, refresh } = useAccount();

  // Стабільне посилання: хук перечитує /api/me після кожної зміни,
  // і нове посилання на кожен рендер зациклило б його ефекти.
  const onChanged = useCallback(() => refresh(), [refresh]);

  const {
    loadState,
    error,
    counts,
    language,
    selectLanguage,
    rules,
    listLoading,
    pending,
    busyId,
    actionError,
    propose,
    review,
    remove,
  } = useLanguageRules(onChanged);

  const isAdmin = me?.profile.role === "admin";

  /** Скільки правил уже діє на всьому проєкті — щоб масштаб був видний одразу. */
  const total = useMemo(
    () => counts.reduce((sum, count) => sum + count.active, 0),
    [counts],
  );

  const globalCount = useMemo(
    () => counts.find((count) => count.languageCode === ALL_LANGUAGES)?.active ?? 0,
    [counts],
  );

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

  const active = rules.filter(
    (rule) => rule.status === "approved" && rule.enabled,
  );

  // Пропозиції звідси прибрані навмисно: усі, які видимі цьому користувачеві,
  // уже стоять у черзі розгляду вище. Без цього фільтра власна пропозиція
  // показувалася б на одному екрані двічі.
  const others = rules.filter(
    (rule) => rule.status !== "pending" && !(rule.status === "approved" && rule.enabled),
  );

  const forAll = language === ALL_LANGUAGES;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Правила для мов</h1>
          {isAdmin && <Badge tone="accent">адміністратор</Badge>}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-subtle">
          Додаткові вимоги до ТЗ. Чинні правила дописуються в промпт кожного
          разу, коли генерується ТЗ: спільні — завжди, мовні — коли мова
          проаналізованих сторінок збігається з мовою правила.
        </p>
      </div>

      {/* Підсумок: без нього незрозуміло, чи взагалі на проєкті є правила,
          доки не перебереш мови в списку. */}
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
        <span className="text-subtle">
          Чинних правил:{" "}
          <span className="num text-fg">{total}</span>
        </span>
        <span className="text-subtle">
          для всіх мов: <span className="num text-fg">{globalCount}</span>
        </span>
        <span className="text-subtle">
          мов із правилами:{" "}
          <span className="num text-fg">
            {counts.filter((count) => count.languageCode !== ALL_LANGUAGES).length}
          </span>
        </span>
        {pending.length > 0 && (
          <span className="text-warn">
            на розгляді: <span className="num">{pending.length}</span>
          </span>
        )}
      </div>

      {actionError && (
        <Callout tone="danger" live>
          {actionError}
        </Callout>
      )}

      {/* ── Черга розгляду ──────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">
              {isAdmin ? "Пропозиції на розгляд" : "Ваші пропозиції"}{" "}
              <span className="num text-subtle">({pending.length})</span>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              {isAdmin
                ? "З усіх мов одразу. На генерацію ТЗ пропозиція не впливає, доки її не схвалено."
                : "Чекають на розгляд адміністратора. На генерацію ТЗ вони поки не впливають."}
            </p>
          </div>

          <ul className="space-y-2">
            {pending.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                isAdmin={Boolean(isAdmin)}
                showScope
                busy={busyId === rule.id}
                onReview={review}
                onDelete={remove}
                onPickScope={selectLanguage}
              />
            ))}
          </ul>
        </section>
      )}

      {/* ── Правила однієї області дії ──────────────────────────────────── */}
      <section className="space-y-4">
        {/* Під час завантаження список не блокуємо: попередній запит хук
            скасовує сам, а вибір, який на пів секунди перестає слухатися,
            дратує більше, ніж допомагає. */}
        <LanguagePicker
          value={language}
          counts={counts}
          onChange={selectLanguage}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4">
          <h2 className="text-sm font-semibold">{scopeFullName(language)}</h2>
          <p className="text-2xs text-subtle">
            {active.length > 0
              ? `${active.length} ${plural(active.length, "чинне правило", "чинних правила", "чинних правил")}`
              : "чинних правил немає"}
          </p>
        </div>

        {/* Мовні правила діють разом зі спільними — про це має бути видно
            звідси, інакше перелік читається як повний. */}
        {!forAll && globalCount > 0 && (
          <p className="text-xs leading-relaxed text-subtle">
            Разом із ними діють{" "}
            <button
              type="button"
              className="text-accent underline hover:no-underline"
              onClick={() => selectLanguage(ALL_LANGUAGES)}
            >
              {globalCount}{" "}
              {plural(globalCount, "правило", "правила", "правил")} для всіх мов
            </button>
            . При суперечці виграє правило мови.
          </p>
        )}

        {listLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        ) : active.length === 0 && others.length === 0 ? (
          <EmptyState
            title={
              forAll
                ? "Спільних правил ще немає"
                : "Правил для цієї мови ще немає"
            }
            description={
              isAdmin
                ? "ТЗ генеруються за загальними вимогами. Додайте правило, якщо потрібні власні."
                : "ТЗ генеруються за загальними вимогами. Запропонуйте правило, якщо потрібні власні."
            }
          />
        ) : (
          <>
            {active.length > 0 && (
              <ul className="space-y-2">
                {active.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    isAdmin={Boolean(isAdmin)}
                    busy={busyId === rule.id}
                    onReview={review}
                    onDelete={remove}
                  />
                ))}
              </ul>
            )}

            {/* Вимкнені й відхилені — під чинними й із підписом: інакше
                вони читаються як такі, що діють. */}
            {others.length > 0 && (
              <div className="space-y-2">
                <p className="text-2xs font-medium tracking-wide text-subtle uppercase">
                  Не діють
                </p>
                <ul className="space-y-2">
                  {others.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      isAdmin={Boolean(isAdmin)}
                      busy={busyId === rule.id}
                      onReview={review}
                      onDelete={remove}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <RuleForm
          languageCode={language}
          isAdmin={Boolean(isAdmin)}
          busy={busyId === "new"}
          onSubmit={propose}
        />
      </section>
    </div>
  );
}
