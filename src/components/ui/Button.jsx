import { Loader2 } from "lucide-react";

const variants = {
  primary: "bg-terracotta-600 text-white hover:bg-terracotta-700 active:bg-terracotta-800 focus-visible:ring-terracotta-500 disabled:bg-stone-200 disabled:text-stone-400 shadow-xs",
  secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200/80 focus-visible:ring-stone-400 disabled:text-stone-400 disabled:bg-stone-100",
  outline: "border border-border-warm bg-surface text-stone-800 hover:bg-stone-50 hover:border-stone-400 focus-visible:ring-terracotta-500 disabled:text-stone-400 disabled:border-stone-200",
  ghost: "bg-transparent text-stone-700 hover:bg-stone-100/80 hover:text-stone-900 focus-visible:ring-stone-400 disabled:text-stone-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 disabled:bg-rose-200 disabled:text-rose-400",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export default function Button({
  children,
  className = "",
  disabled = false,
  loading = false,
  loadingText,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin text-current" aria-hidden="true" />}
      {loading ? (loadingText || children) : children}
    </button>
  );
}
