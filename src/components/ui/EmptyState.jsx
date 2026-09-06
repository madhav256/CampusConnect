import React from "react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
  compact = false,
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact
          ? "py-8 px-4"
          : "rounded-2xl border border-border-warm bg-surface/90 py-12 px-6 shadow-xs sm:py-16"
      } ${className}`}
    >
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-terracotta-200/60 bg-terracotta-50 text-terracotta-600 shadow-xs">
          {React.isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon className="h-7 w-7 text-terracotta-600" aria-hidden="true" />
          )}
        </div>
      )}
      {title && (
        <h3 className="mt-4 font-serif text-lg font-semibold tracking-tight text-ink">{title}</h3>
      )}
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
