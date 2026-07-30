import type { ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";
import type { ThemePreference } from "../lib/theme";

/**
 * Іконки — Lucide, вбудовані інлайном: три штуки не варті залежності, а емодзі
 * тут не підходять принципово (різний рендер у системах, не фарбуються токеном).
 * Однакова товщина обведення 1.5 у всіх трьох — інакше набір розсипається.
 */
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-4",
} as const;

function SunIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

interface Option {
  id: ThemePreference;
  label: string;
  icon: ReactNode;
}

const OPTIONS: Option[] = [
  { id: "light", label: "Світла тема", icon: <SunIcon /> },
  { id: "system", label: "Як у системі", icon: <SystemIcon /> },
  { id: "dark", label: "Темна тема", icon: <MoonIcon /> },
];

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div
      className="inline-flex gap-0.5 rounded-control border border-line bg-inset p-0.5"
      role="group"
      aria-label="Тема інтерфейсу"
    >
      {OPTIONS.map((option) => {
        const active = preference === option.id;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setPreference(option.id)}
            aria-pressed={active}
            aria-label={
              option.id === "system"
                ? `Як у системі (зараз ${resolved === "dark" ? "темна" : "світла"})`
                : option.label
            }
            title={option.label}
            /*
             * Видима висота 40px, а after розтягує зону натискання до 44px —
             * рівно на padding контейнера, тому сусідні сегменти не
             * перекриваються і випадкових натискань не буде.
             */
            className={`relative grid h-10 w-11 place-items-center rounded-inset
              transition-colors duration-150 ease-out
              after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']
              ${
                active
                  ? "bg-surface text-fg"
                  : "text-subtle hover:bg-hover hover:text-fg"
              }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
