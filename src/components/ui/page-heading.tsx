import type { ReactNode } from "react";

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-base-content/70">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
const badgeClasses = {
  neutral: "badge-ghost",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};
export function StatusBadge({
  children,
  status = "neutral",
}: {
  children: ReactNode;
  status?: keyof typeof badgeClasses;
}) {
  return (
    <span className={`badge badge-sm ${badgeClasses[status]}`}>{children}</span>
  );
}
