const variants = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 disabled:bg-slate-300",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400 disabled:text-slate-400",
  outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-indigo-500 disabled:text-slate-400",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400 disabled:text-slate-400",
  danger: "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 disabled:bg-red-300",
};

const sizes = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export default function Button({
  children,
  className = "",
  disabled = false,
  loading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? "Saving..." : children}
    </button>
  );
}
