function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CC";
}

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

export default function Avatar({ name, photoURL, size = "lg" }) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={`${name || "User"} avatar`}
        className={`${sizes[size]} rounded-full object-cover ring-4 ring-white`}
      />
    );
  }

  return (
    <div
      aria-label={`${name || "User"} avatar`}
      className={`${sizes[size]} flex items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ring-4 ring-white`}
    >
      {getInitials(name)}
    </div>
  );
}
