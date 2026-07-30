import type { ReactNode } from "react";

export type CalloutTone = "danger" | "warn" | "info";

/**
 * Кольори станів беруться з семантичних токенів, а не з палітри Tailwind:
 * так світла й темна теми лишаються узгодженими між собою, і жоден стан
 * не «випадає» при перемиканні.
 */
const TONES: Record<CalloutTone, string> = {
  danger: "border-danger-line bg-danger-soft text-danger",
  warn: "border-warn-line bg-warn-soft text-warn",
  info: "border-info-line bg-info-soft text-info",
};

interface CalloutProps {
  tone?: CalloutTone;
  /**
   * Для повідомлень, що з'являються у відповідь на дію користувача.
   * Скрінрідер має озвучити їх сам — інакше про помилку дізнається лише той,
   * хто її бачить.
   */
  live?: boolean;
  size?: "sm" | "xs";
  children: ReactNode;
}

export function Callout({
  tone = "danger",
  live = false,
  size = "sm",
  children,
}: CalloutProps) {
  return (
    <p
      {...(live ? { role: "alert" } : {})}
      className={`rounded-inset border px-3 py-2 leading-relaxed ${
        size === "sm" ? "text-sm" : "text-xs"
      } ${TONES[tone]}`}
    >
      {children}
    </p>
  );
}
