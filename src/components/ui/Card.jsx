const paddings = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

const shadows = {
  none: "shadow-none",
  sm: "shadow-xs",
  md: "shadow-sm",
  lg: "shadow-md",
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
    ? "transition duration-150 hover:border-stone-300 hover:shadow-sm"
    : "";

  return (
    <div
      className={`rounded-2xl border border-border-warm bg-surface ${paddingClass} ${shadowClass} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

