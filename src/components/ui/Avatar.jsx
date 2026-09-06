function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CC";
}

const sizes = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

export default function Avatar({ name, photoURL, size = "lg", bordered = true, className = "" }) {
  const sizeClass = sizes[size] || sizes.lg;
  const borderClass = bordered ? "ring-2 ring-surface shadow-xs" : "";

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={`${name || "User"} avatar`}
        className={`${sizeClass} rounded-full object-cover ${borderClass} ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={`${name || "User"} avatar`}
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-stone-100 font-serif font-semibold text-stone-800 ring-1 ring-border-warm ${borderClass} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}

