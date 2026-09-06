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
        compact ? "py-8 px-4" : "rounded-2xl border border-dashed border-slate-200 bg-white/70 py-12 px-6 shadow-sm sm:py-16"
      } ${className}`}
    >
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-sm">
          {React.isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon className="h-7 w-7 text-indigo-600" aria-hidden="true" />
          )}
        </div>
      )}
      {title && (
        <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      )}
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
