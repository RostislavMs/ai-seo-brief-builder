import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && (
        // max-w тримає рядок у межах 60–75 знаків: довший центрований абзац
        // читається помітно гірше.
        <p className="max-w-md text-sm leading-relaxed text-subtle">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
