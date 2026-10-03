/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 *
 * Protected Event discovery page for campus-wide events and student activities.
 * Consumes useEvents for reactive subscription and filtering, with temporal tabs,
 * category filter pills, community filter dropdown, and search.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Plus } from "lucide-react";
import { useEvents } from "../hooks/useEvents.js";
import { useOptionalCampus } from "../hooks/useCampus.js";
import { useEligibleCommunities } from "../hooks/useEligibleCommunities.js";
import Navbar from "../components/layout/Navbar.jsx";
import PageContainer from "../components/layout/PageContainer.jsx";
import EventFilterBar from "../components/events/EventFilterBar.jsx";
import EventGrid from "../components/events/EventGrid.jsx";
import EventComposerModal from "../components/events/EventComposerModal.jsx";

export default function Events() {
  const navigate = useNavigate();
  const campusContext = useOptionalCampus();
  const campus = campusContext?.campus || null;
  const campusId = campus?.id || campusContext?.campusId || null;

  const { eligibleCommunities = [], hasEligibleCommunities } =
    useEligibleCommunities(campusId);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  // Filter state
  const [timeRange, setTimeRange] = useState("upcoming");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCommunity, setSelectedCommunity] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Pass timeRange and category filters to useEvents hook
  const queryOptions = useMemo(() => {
    const opts = { timeRange };
    if (selectedCategory !== "all") {
      opts.category = selectedCategory;
    }
    return opts;
  }, [timeRange, selectedCategory]);

  const { events, isLoading, error, refetch } = useEvents(queryOptions);

  // Derive unique community filter options from loaded events
  const communityOptions = useMemo(() => {
    if (!Array.isArray(events)) return [];
    const map = new Map();
    events.forEach((e) => {
      if (e.communityId) {
        map.set(e.communityId, e.organizerName || e.communityId);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [events]);

  // Client-side community and search filter
  const filteredEvents = useMemo(() => {
    if (!Array.isArray(events)) return [];

    return events.filter((e) => {
      // Community filter
      if (selectedCommunity !== "all" && e.communityId !== selectedCommunity) {
        return false;
      }

      // Search match across title, organizer, location, description
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const titleMatch = e.title?.toLowerCase().includes(q);
        const orgMatch = e.organizerName?.toLowerCase().includes(q);
        const locMatch = e.location?.toLowerCase().includes(q);
        const descMatch = e.description?.toLowerCase().includes(q);
        return titleMatch || orgMatch || locMatch || descMatch;
      }

      return true;
    });
  }, [events, selectedCommunity, searchTerm]);

  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedCommunity !== "all" ||
    searchTerm.trim() !== "";

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedCommunity("all");
    setSearchTerm("");
  };

  const getEmptyTitle = () => {
    if (hasActiveFilters) return "No matching events found";
    return timeRange === "past"
      ? "No past events found"
      : "No upcoming events found";
  };

  const getEmptyDescription = () => {
    if (hasActiveFilters) {
      return "No events match your current search or filter criteria. Try adjusting or resetting your filters.";
    }
    return timeRange === "past"
      ? "There are no completed events recorded for your campus."
      : "There are currently no upcoming events scheduled at your campus. Check back soon for new workshops and meetups!";
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <PageContainer>
        {/* Header Section */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
                Discover Campus Events
              </h1>
              {campus && (
                <span
                  id="events-campus-badge"
                  data-testid="events-campus-badge"
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200/60"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  {campus.shortName || campus.name}
                </span>
              )}
            </div>
            <p className="mt-1 text-ink-muted">
              {campus
                ? `Explore upcoming workshops, hackathons, and gatherings at ${campus.name}.`
                : "Explore upcoming workshops, hackathons, and gatherings across your campus."}
            </p>
          </div>

          {/* Organizer Creation Action */}
          <div>
            {hasEligibleCommunities ? (
              <button
                type="button"
                onClick={() => setIsComposerOpen(true)}
                data-testid="create-event-btn"
                className="inline-flex items-center gap-2 rounded-xl bg-terracotta-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-terracotta-700 active:bg-terracotta-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Create Event</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                data-testid="create-event-placeholder-btn"
                title="Only community administrators and moderators can create events."
                className="inline-flex items-center gap-2 rounded-xl bg-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-400 shadow-xs cursor-not-allowed"
                aria-disabled="true"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Create Event</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search events by title, organizer, or venue..."
              className="w-full rounded-2xl border border-border-warm bg-surface py-3.5 pl-11 pr-10 text-ink placeholder-stone-400 shadow-xs transition focus:border-terracotta-600 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
              aria-label="Search events"
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
        </div>

        {/* Filter Bar */}
        <div className="mb-6">
          <EventFilterBar
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            selectedCommunity={selectedCommunity}
            onCommunityChange={setSelectedCommunity}
            communityOptions={communityOptions}
            onReset={handleResetFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {/* Results Info Bar */}
        {!isLoading && !error && events.length > 0 && (
          <div className="mb-4 flex items-center justify-between text-xs font-medium text-ink-muted">
            <span data-testid="events-count-label">
              Showing {filteredEvents.length}{" "}
              {filteredEvents.length === 1 ? "event" : "events"}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-terracotta-600 hover:text-terracotta-700 hover:underline focus:outline-none"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Event Grid */}
        <EventGrid
          events={filteredEvents}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          emptyTitle={getEmptyTitle()}
          emptyDescription={getEmptyDescription()}
        />

        {/* Event Creation Modal */}
        {hasEligibleCommunities && (
          <EventComposerModal
            isOpen={isComposerOpen}
            onClose={() => setIsComposerOpen(false)}
            onSuccess={(newEventId) => {
              setIsComposerOpen(false);
              refetch();
              if (newEventId) {
                navigate(`/events/${newEventId}`);
              }
            }}
            eligibleCommunities={eligibleCommunities}
          />
        )}
      </PageContainer>
    </div>
  );
}
