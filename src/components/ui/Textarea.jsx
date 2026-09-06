export default function Textarea({
  error,
  helperText,
  id,
  label,
  required = false,
  className = "",
  ...props
}) {
  const messageId = error ? `${id}-error` : helperText ? `${id}-helper` : undefined;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-stone-700">
          {label}
          {required && <span className="text-terracotta-600"> *</span>}
        </label>
      )}
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={messageId}
        className={`min-h-28 w-full resize-y rounded-xl border bg-surface px-4 py-2 text-ink outline-none transition placeholder:text-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 ${
          error
            ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            : "border-border-warm focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
        } ${className}`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${id}-helper`} className="text-sm text-ink-muted">
          {helperText}
        </p>
      )}
    </div>
  );
}
