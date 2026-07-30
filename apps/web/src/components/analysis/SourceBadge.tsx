import type { ContentSource } from "@brief/shared";
import { Badge, type BadgeTone } from "../ui/Badge";

const SOURCE: Record<ContentSource, { tone: BadgeTone; label: string; hint: string }> = {
  direct: {
    tone: "neutral",
    label: "прямий запит",
    hint: "Сторінку отримано звичайним HTTP-запитом",
  },
  browser: {
    tone: "info",
    label: "браузер",
    hint: "Сайт закритий від простих запитів — сторінку відкрито у справжньому браузері",
  },
  archive: {
    tone: "warn",
    label: "архів",
    hint: "Сайт недоступний напряму — узято копію з Wayback Machine",
  },
};

interface SourceBadgeProps {
  source: ContentSource;
  archivedAt: string | null;
  /** Прямий запит — норма, і в щільних списках його краще не показувати. */
  hideDirect?: boolean;
}

export function SourceBadge({
  source,
  archivedAt,
  hideDirect = false,
}: SourceBadgeProps) {
  // Дані з localStorage можуть бути записані версією без цього поля.
  // Міграція їх виправляє, але компонент не має падати з чорним екраном.
  const config = SOURCE[source] ?? SOURCE.direct;

  if (config === SOURCE.direct && hideDirect) return null;
  const date = archivedAt ? archivedAt.slice(0, 10) : null;

  return (
    <span title={config.hint}>
      <Badge tone={config.tone}>
        {config.label}
        {date && ` · ${date}`}
      </Badge>
    </span>
  );
}
