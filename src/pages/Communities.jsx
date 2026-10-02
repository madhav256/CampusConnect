/**
 * Milestone 19 — Unit 19.5: Community UI & Discovery Foundation
 *
 * Campus-scoped community discovery page.
 * Allows students to explore student clubs, societies, and cohorts
 * within their institutional tenant.
 */

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { useCommunities } from "../hooks/useCommunities";
import { useOptionalCampus } from "../hooks/useCampus";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import CommunityGrid from "../components/community/CommunityGrid";
import { COMMUNITY_CATEGORIES } from "../constants";

const CATEGORY_FILTERS = [
  { id: "all", label: "All Communities" },
  { id: COMMUNITY_CATEGORIES.TECH, label: "Tech & Robotics" },
  { id: COMMUNITY_CATEGORIES.ACADEMIC, label: "Academic" },
  { id: COMMUNITY_CATEGORIES.CULTURAL, label: "Cultural & Arts" },
  { id: COMMUNITY_CATEGORIES.SPORTS, label: "Sports" },
  { id: COMMUNITY_CATEGORIES.CAREER, label: "Career" },
  { id: COMMUNITY_CATEGORIES.BATCH, label: "Batch" },
  { id: COMMUNITY_CATEGORIES.INTEREST, label: "Interests" },
];

export default function Communities() {
  const campusContext = useOptionalCampus();
  const campus = campusContext?.campus || null;
  const campusId = campusContext?.campusId || null;

  const { communities, isLoading, error, refetch } = useCommunities(campusId);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Client-side search and category filtering
  const filteredCommunities = useMemo(() => {
    if (!Array.isArray(communities)) return [];

    return communities.filter((item) => {
      // Category match
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }

      // Search match across name, description, and category
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const nameMatch = item.name?.toLowerCase().includes(query);
        const descMatch = item.description?.toLowerCase().includes(query);
        const catMatch = item.category?.toLowerCase().includes(query);
        return nameMatch || descMatch || catMatch;
      }

      return true;
    });
  }, [communities, searchTerm, selectedCategory]);

  const hasActiveFilters = searchTerm.trim() !== "" || selectedCategory !== "all";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <PageContainer>
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
              Campus Communities
            </h1>
            {campus && (
              <span
                id="communities-campus-badge"
                data-testid="communities-campus-badge"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/60"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
                {campus.shortName || campus.name}
              </span>
            )}
          </div>
          <p className="mt-1 text-ink-muted">
            {campus
              ? `Join student clubs, societies, and cohorts at ${campus.name} to connect with peers and participate in discussions.`
              : "Explore student clubs, societies, and cohorts across your campus."}
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search communities by name, topic, or category..."
              className="w-full rounded-2xl border border-border-warm bg-surface py-3.5 pl-11 pr-10 text-ink placeholder-stone-400 shadow-xs transition focus:border-terracotta-600 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
              aria-label="Search communities"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-stone-400 hover:text-ink focus:outline-none"
                aria-label="Clear search"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar"
            role="tablist"
            aria-label="Filter communities by category"
          >
            {CATEGORY_FILTERS.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`category-filter-${cat.id}`}
                  onClick={() => setSelectedCategory(cat.id)}
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

        {/* Results Info Bar */}
        {!isLoading && !error && communities.length > 0 && (
          <div className="mb-4 flex items-center justify-between text-xs font-medium text-ink-muted">
            <span data-testid="communities-count-label">
              Showing {filteredCommunities.length}{" "}
              {filteredCommunities.length === 1 ? "community" : "communities"}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                }}
                className="text-terracotta-600 hover:text-terracotta-700 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Community Grid / States */}
        <CommunityGrid
          communities={filteredCommunities}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          emptyTitle={
            hasActiveFilters
              ? "No matching communities"
              : "No communities on campus yet"
          }
          emptyDescription={
            hasActiveFilters
              ? "No communities matched your search or category filter. Try clearing filters or searching for something else."
              : "There are currently no active communities registered for your campus."
          }
        />
      </PageContainer>
    </div>
  );
}
