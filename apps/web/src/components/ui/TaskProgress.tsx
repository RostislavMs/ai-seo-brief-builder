import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";

/**
 * Очікування довгої відповіді моделі: лічильник часу, чесна підказка
 * й можливість не чекати.
 *
 * Раніше тут стояла оцінка «20–45 секунд» — і вона перестала бути правдою:
 * ТЗ на кількох великих конкурентах іде хвилину й довше, а якщо перша
 * відповідь не збіглася зі схемою, сервер робить другу спробу. Замість
 * точнішого прогнозу показуємо те, що знаємо напевно: скільки часу вже
 * пройшло. Здогадуватися, «зависло чи ні», користувачеві більше не треба.
 *
 * Підказка змінюється з часом, але жодна не вигадує стану на сервері:
 * скільком розділам ТЗ модель уже дала лад, ми не знаємо, і малювати
 * поетапний прогрес означало б брехати смужкою.
 */

interface TaskProgressProps {
  /** Що саме відбувається: «Модель складає ТЗ…». */
  title: string;
  /** Від чого залежить час: «6 сторінок». Показується біля лічильника. */
  scope?: string;
  /** Немає — кнопки скасування теж немає. */
  onCancel?: () => void;
}

interface Stage {
  /** Від якої секунди діє ця підказка. */
  after: number;
  hint: string;
}

const FIRST_HINT =
  "Зазвичай 1–2 хвилини: структура, ключі й рекомендації складаються " +
  "одним запитом.";

/**
 * Пороги виведені з реальних замірів: типова генерація вкладається у дві
 * хвилини, а все, що довше, майже завжди означає другу спробу.
 */
const LATER_STAGES: readonly Stage[] = [
  {
    after: 90,
    hint:
      "Довше за звичайне. Час залежить від обсягу конкурентів більше, " +
      "ніж від їхньої кількості.",
  },
  {
    after: 180,
    hint:
      "Понад три хвилини — схоже, перша відповідь не збіглася зі схемою " +
      "й сервер повторює запит. Можна дочекатися або скасувати.",
  },
];

/** Останній поріг, який уже настав; поки жоден — початкова підказка. */
function stageHint(seconds: number): string {
  return LATER_STAGES.reduce(
    (hint, stage) => (seconds >= stage.after ? stage.hint : hint),
    FIRST_HINT,
  );
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TaskProgress({ title, scope, onCancel }: TaskProgressProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    // Не seconds + 1: у прихованій вкладці таймери браузер притримує,
    // і лічильник відстав би від справжнього часу очікування.
    const timer = setInterval(
      () => setSeconds(Math.round((Date.now() - started) / 1000)),
      1000,
    );

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Spinner className="size-6" />

      {/* Заголовок і підказка озвучуються, лічильник — ні: скрінрідер читав
          би секунди щоразу, перекриваючи все інше на сторінці. */}
      <div role="status" className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-subtle">
          {stageHint(seconds)}
        </p>
      </div>

      <p aria-hidden className="text-xs text-subtle">
        <span className="num">{clock(seconds)}</span>
        {scope ? ` · ${scope}` : ""}
      </p>

      {onCancel && (
        <button
          type="button"
          className="btn-quiet border border-line-strong"
          onClick={onCancel}
        >
          Скасувати
        </button>
      )}
    </div>
  );
}
