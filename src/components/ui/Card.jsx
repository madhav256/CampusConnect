const paddings = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

const shadows = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

export default function Card({
  children,
  className = "",
  padding = "md",
  shadow = "sm",
  hoverable = false,
  ...props
}) {
  const paddingClass = paddings[padding] || paddings.md;
  const shadowClass = shadows[shadow] || shadows.sm;
  const hoverClass = hoverable
    ? "transition duration-150 hover:shadow-md hover:border-slate-300"
    : "";

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white ${paddingClass} ${shadowClass} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

