/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 *
 * Reusable badge component for displaying the eight locked event categories
 * with accessible, distinct visual styling.
 */

import { EVENT_CATEGORIES } from "../../constants.js";

const categoryStyles = {
  [EVENT_CATEGORIES.TECH]: "bg-sky-50 text-sky-700 border-sky-200/60",
  [EVENT_CATEGORIES.ACADEMIC]: "bg-indigo-50 text-indigo-700 border-indigo-200/60",
  [EVENT_CATEGORIES.CULTURAL]: "bg-amber-50 text-amber-800 border-amber-200/60",
  [EVENT_CATEGORIES.SPORTS]: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  [EVENT_CATEGORIES.CAREER]: "bg-purple-50 text-purple-700 border-purple-200/60",
  [EVENT_CATEGORIES.WORKSHOP]: "bg-orange-50 text-orange-700 border-orange-200/60",
  [EVENT_CATEGORIES.SOCIAL]: "bg-rose-50 text-rose-700 border-rose-200/60",
  [EVENT_CATEGORIES.COMPETITION]: "bg-teal-50 text-teal-700 border-teal-200/60",
};

const categoryLabels = {
  [EVENT_CATEGORIES.TECH]: "Tech",
  [EVENT_CATEGORIES.ACADEMIC]: "Academic",
  [EVENT_CATEGORIES.CULTURAL]: "Cultural",
  [EVENT_CATEGORIES.SPORTS]: "Sports",
  [EVENT_CATEGORIES.CAREER]: "Career",
  [EVENT_CATEGORIES.WORKSHOP]: "Workshop",
  [EVENT_CATEGORIES.SOCIAL]: "Social",
  [EVENT_CATEGORIES.COMPETITION]: "Competition",
};

export default function EventCategoryBadge({ category, className = "" }) {
  const normalized = typeof category === "string" ? category.toLowerCase().trim() : "";
  const style = categoryStyles[normalized] || "bg-stone-100 text-stone-700 border-stone-200/60";
  const label =
    categoryLabels[normalized] ||
    (normalized
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
      : "General");

  return (
    <span
      data-testid="event-category-badge"
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${style} ${className}`}
    >
      {label}
    </span>
  );
}
