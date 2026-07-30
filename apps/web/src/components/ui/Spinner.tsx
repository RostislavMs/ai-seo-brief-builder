interface SpinnerProps {
  className?: string;
  /**
   * "on-accent" — для спінера поверх залитої акцентом кнопки: звичайні
   * кольори меж на індиго не читаються.
   */
  tone?: "default" | "on-accent";
}

const TONES = {
  default: "border-line-strong border-t-accent",
  "on-accent": "border-accent-ink/35 border-t-accent-ink",
} as const;

export function Spinner({ className = "size-4", tone = "default" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Завантаження"
      className={`inline-block shrink-0 animate-spin rounded-full border-2
        ${TONES[tone]} ${className}`}
    />
  );
}
