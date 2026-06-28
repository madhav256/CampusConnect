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
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={messageId}
        className={`min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 ${className}`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={`${id}-helper`} className="text-sm text-slate-500">
          {helperText}
        </p>
      )}
    </div>
  );
}
