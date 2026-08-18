/**
 * Іконки Lucide, вбудовані інлайном.
 *
 * Причина та сама, що й у ThemeToggle: десяток штрихів не вартий залежності,
 * а емодзі не фарбуються токеном і по-різному малюються в системах.
 * Товщина обведення всюди 1.5 — інакше набір розсипається.
 */

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

interface IconProps {
  className?: string;
}

export function PlusIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function SettingsIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function LogoutIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function MenuIcon({ className = "size-5" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function CloseIcon({ className = "size-5" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function TrashIcon({ className = "size-3.5" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

export function SidebarIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

export function CheckIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

/** Копіювання в буфер: два аркуші один за одним. */
export function CopyIcon({ className = "size-3.5" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function KeyIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3M17 6l2.5 2.5M14.5 8.5 17 11" />
    </svg>
  );
}

/** Правила для мов: глобус — єдиний знак, що читається як «мова», а не «текст». */
export function GlobeIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </svg>
  );
}

/**
 * Увімкнути / вимкнути правило. Не «око»: око означає видимість, а вимкнене
 * правило видно всім — воно просто не діє.
 */
export function PowerIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 3v9M7.8 6.8a7 7 0 1 0 8.4 0" />
    </svg>
  );
}

/**
 * Промпти: фігурні дужки — тим самим знаком у промпті позначені вставки
 * (`{{topic}}`), тому іконка читається як «текст зі підстановками», а не як
 * абстрактний документ.
 */
export function BracesIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}

/** Скинути промпт до початкового тексту. */
export function UndoIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 8h11a5 5 0 0 1 0 10H8M3 8l4-4M3 8l4 4" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PencilIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function EyeIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ className = "size-4" }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17.7 17.7 0 0 1-3.2 3.9M6.6 6.7A17.6 17.6 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.8M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
