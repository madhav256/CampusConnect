/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 *
 * Reusable filter bar component for Event discovery.
 * Supports temporal tabs (Upcoming / Past Events), category pills (All + 8 locked categories),
 * and community filter dropdown.
 */

import { EVENT_CATEGORIES } from "../../constants.js";

const EVENT_CATEGORY_FILTER_OPTIONS = [
  { id: "all", label: "All Categories" },
  { id: EVENT_CATEGORIES.TECH, label: "Tech" },
  { id: EVENT_CATEGORIES.ACADEMIC, label: "Academic" },
  { id: EVENT_CATEGORIES.CULTURAL, label: "Cultural" },
  { id: EVENT_CATEGORIES.SPORTS, label: "Sports" },
  { id: EVENT_CATEGORIES.CAREER, label: "Career" },
  { id: EVENT_CATEGORIES.WORKSHOP, label: "Workshop" },
  { id: EVENT_CATEGORIES.SOCIAL, label: "Social" },
  { id: EVENT_CATEGORIES.COMPETITION, label: "Competition" },
];

export default function EventFilterBar({
  timeRange = "upcoming",
  onTimeRangeChange,
  selectedCategory = "all",
  onCategoryChange,
  selectedCommunity = "all",
  onCommunityChange,
  communityOptions = [],
  onReset,
  hasActiveFilters = false,
}) {
  return (
    <div
      data-testid="event-filter-bar"
      className="space-y-4 rounded-2xl border border-border-warm bg-surface/60 p-4 shadow-xs"
    >
      {/* Top Row: Time Range Tabs + Community Filter + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Time Scope Tabs */}
        <div
          role="tablist"
          aria-label="Filter events by time scope"
          className="inline-flex rounded-xl bg-stone-100 p-1 border border-border-warm/80"
        >
          <button
            type="button"
            role="tab"
            aria-selected={timeRange === "upcoming"}
            data-testid="time-tab-upcoming"
            onClick={() => onTimeRangeChange?.("upcoming")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${
              timeRange === "upcoming"
                ? "bg-surface text-ink shadow-xs"
                : "text-stone-600 hover:text-ink"
            }`}
          >
            Upcoming
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={timeRange === "past"}
            data-testid="time-tab-past"
            onClick={() => onTimeRangeChange?.("past")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${
              timeRange === "past"
                ? "bg-surface text-ink shadow-xs"
                : "text-stone-600 hover:text-ink"
            }`}
          >
            Past Events
          </button>
        </div>

        {/* Right controls: Community dropdown + optional Reset */}
        <div className="flex items-center gap-3">
          {communityOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="community-filter-select" className="text-xs font-medium text-ink-muted">
                Community:
              </label>
              <select
                id="community-filter-select"
                data-testid="community-filter-select"
                value={selectedCommunity}
                onChange={(e) => onCommunityChange?.(e.target.value)}
                className="rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-xs transition focus:border-terracotta-600 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
                aria-label="Filter by sponsoring community"
              >
                <option value="all">All Communities</option>
                {communityOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && onReset && (
            <button
              type="button"
              data-testid="reset-filters-btn"
              onClick={onReset}
              className="text-xs font-semibold text-terracotta-600 hover:text-terracotta-700 hover:underline focus:outline-none"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Category Filter Pills */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar"
        role="tablist"
        aria-label="Filter events by category"
      >
        {EVENT_CATEGORY_FILTER_OPTIONS.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`category-pill-${cat.id}`}
              onClick={() => onCategoryChange?.(cat.id)}
              className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 ${
                isSelected
                  ? "bg-terracotta-600 text-white shadow-xs font-semibold"
                  : "bg-surface text-stone-600 border border-border-warm/80 hover:bg-stone-50 hover:text-ink"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
