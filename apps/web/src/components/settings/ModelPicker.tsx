import { useMemo } from "react";
import type { ModelOption, ModelsResponse } from "@brief/shared";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Combobox, type ComboboxOption } from "../ui/Combobox";

/**
 * Вибір моделі.
 *
 * Список приходить від самого провайдера — доступність залежить від ключа,
 * і показувати каталог як істину означало б пропонувати те, чого немає.
 * Каталог додає лише ціни й мітки.
 *
 * Комбобокс, а не `<select>`: у провайдера доступних моделей десятки, назви
 * в них починаються однаково («Gemini 2.5 Flash Lite», «Gemini 2.0 Flash»), і
 * в нативному списку їх доводиться перечитувати очима. З пошуком «lite» або
 * «3.6» відповідь одна. Групи лишаються — вони кажуть, що взяти, коли байдуже.
 */

const TIER_LABEL: Record<NonNullable<ModelOption["tier"]>, string> = {
  recommended: "Рекомендована",
  balanced: "Збалансована",
  budget: "Дешевша",
  premium: "Преміум",
};

const TIER_TONE: Record<NonNullable<ModelOption["tier"]>, BadgeTone> = {
  recommended: "accent",
  balanced: "info",
  budget: "success",
  premium: "warn",
};

/** Порядок груп: спершу те, що варто взяти, потім усе інше. */
const TIER_ORDER: NonNullable<ModelOption["tier"]>[] = [
  "recommended",
  "balanced",
  "budget",
  "premium",
];

function formatPrice(model: ModelOption): string | null {
  if (model.inputPrice === null || model.outputPrice === null) return null;
  return `$${model.inputPrice} / $${model.outputPrice} за 1M токенів`;
}

interface ModelPickerProps {
  data: ModelsResponse;
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelPicker({
  data,
  value,
  onChange,
  disabled = false,
}: ModelPickerProps) {
  const options = useMemo<ComboboxOption[]>(() => {
    const inTier = (tier: ModelOption["tier"]): ModelOption[] =>
      data.models.filter((model) => model.tier === tier);

    const groups: { label: string; items: ModelOption[] }[] = [
      ...TIER_ORDER.map((tier) => ({
        label: TIER_LABEL[tier],
        items: inTier(tier),
      })),
      { label: "Інші доступні за ключем", items: inTier(null) },
    ].filter((group) => group.items.length > 0);

    return groups.flatMap((group) =>
      group.items.map((model) => ({
        value: model.id,
        label: model.label,
        // Ідентифікатор другим рядком, а не в назві: шукають і за ним
        // («gemini-3.6»), але читають усе ж назву.
        hint: model.id,
        meta: formatPrice(model),
        group: group.label,
      })),
    );
  }, [data.models]);

  const selected = data.models.find((model) => model.id === value) ?? null;

  return (
    <div className="space-y-2">
      <Combobox
        label="Модель"
        value={value}
        options={options}
        onChange={onChange}
        // Модель могла бути збережена раніше, а потім зникнути з переліку:
        // без цього підпису поле показало б порожнечу замість причини.
        missingLabel={(id) => `${id} (недоступна)`}
        placeholder="Назва або ідентифікатор моделі"
        disabled={disabled}
      />

      {selected && (
        <div className="panel space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.tier && (
              <Badge tone={TIER_TONE[selected.tier]}>
                {TIER_LABEL[selected.tier]}
              </Badge>
            )}
            {selected.id === data.recommended && selected.tier !== "recommended" && (
              <Badge tone="accent">за замовчуванням</Badge>
            )}
            <span className="num text-2xs text-subtle">{selected.id}</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs">
            <div>
              <dt className="text-subtle">Вхід</dt>
              <dd className="num text-fg">
                {selected.inputPrice === null
                  ? "невідомо"
                  : `$${selected.inputPrice} / 1M`}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Вихід</dt>
              <dd className="num text-fg">
                {selected.outputPrice === null
                  ? "невідомо"
                  : `$${selected.outputPrice} / 1M`}
              </dd>
            </div>
            {selected.contextTokens !== null && (
              <div className="col-span-2">
                <dt className="text-subtle">Контекст</dt>
                <dd className="num text-fg">
                  {(selected.contextTokens / 1000).toLocaleString("uk-UA")}K токенів
                </dd>
              </div>
            )}
          </dl>

          {selected.note && (
            <p className="text-2xs leading-relaxed text-muted">{selected.note}</p>
          )}

          {selected.inputPrice === null && (
            <p className="text-2xs leading-relaxed text-subtle">
              Ціну не підтверджено — перевірте її на сторінці тарифів
              провайдера, перш ніж планувати бюджет.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
