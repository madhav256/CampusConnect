/**
 * Milestone 19 — Unit 19.5: Community UI & Discovery Foundation
 *
 * Badge component for displaying community categories with distinct, accessible color palettes.
 */

import { COMMUNITY_CATEGORIES } from "../../constants.js";

const categoryStyles = {
  [COMMUNITY_CATEGORIES.TECH]: "bg-sky-50 text-sky-700 border-sky-200/60",
  [COMMUNITY_CATEGORIES.ACADEMIC]: "bg-indigo-50 text-indigo-700 border-indigo-200/60",
  [COMMUNITY_CATEGORIES.CULTURAL]: "bg-amber-50 text-amber-800 border-amber-200/60",
  [COMMUNITY_CATEGORIES.SPORTS]: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  [COMMUNITY_CATEGORIES.CAREER]: "bg-purple-50 text-purple-700 border-purple-200/60",
  [COMMUNITY_CATEGORIES.BATCH]: "bg-rose-50 text-rose-700 border-rose-200/60",
  [COMMUNITY_CATEGORIES.INTEREST]: "bg-teal-50 text-teal-700 border-teal-200/60",
};

const categoryLabels = {
  [COMMUNITY_CATEGORIES.TECH]: "Tech & Robotics",
  [COMMUNITY_CATEGORIES.ACADEMIC]: "Academic",
  [COMMUNITY_CATEGORIES.CULTURAL]: "Cultural & Arts",
  [COMMUNITY_CATEGORIES.SPORTS]: "Sports & Fitness",
  [COMMUNITY_CATEGORIES.CAREER]: "Career & Professional",
  [COMMUNITY_CATEGORIES.BATCH]: "Batch & Cohort",
  [COMMUNITY_CATEGORIES.INTEREST]: "Special Interest",
};

export default function CommunityCategoryBadge({ category, className = "" }) {
  const normalizedCategory = typeof category === "string" ? category.toLowerCase() : "";
  const style = categoryStyles[normalizedCategory] || "bg-stone-100 text-stone-700 border-stone-200/60";
  const label =
    categoryLabels[normalizedCategory] ||
    (normalizedCategory
      ? normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1)
      : "General");

  return (
    <span
      data-testid="community-category-badge"
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${style} ${className}`}
    >
      {label}
    </span>
  );
}
