import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-inset text-muted",
  accent: "border-accent-line bg-accent-soft text-accent",
  success: "border-success-line bg-success-soft text-success",
  warn: "border-warn-line bg-warn-soft text-warn",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-inset border px-1.5 py-0.5
        text-2xs leading-none font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
