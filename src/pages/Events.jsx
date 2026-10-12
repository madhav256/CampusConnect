/**
 * Milestone 20 — Unit 20.4: Event Discovery UI & Navigation
 * Milestone 21 — Unit 21.5: Participation Discovery Surfaces (Going tab & card badges)
 *
 * Protected Event discovery page for campus-wide events and student activities.
 * Consumes useEvents and useMyRsvps for reactive subscription and filtering, with temporal
 * tabs (Upcoming / Past Events / Going), category filter pills, community filter dropdown, and search.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { useEvents } from "../hooks/useEvents.js";
import { useOptionalCampus } from "../hooks/useCampus.js";
import { useEligibleCommunities } from "../hooks/useEligibleCommunities.js";
import { useMyRsvps } from "../hooks/useMyRsvps.js";
import { resolveEvent } from "../services/eventService.js";
import { deleteEventRsvp } from "../services/eventRsvpService.js";
import Navbar from "../components/layout/Navbar.jsx";
import PageContainer from "../components/layout/PageContainer.jsx";
import EventFilterBar from "../components/events/EventFilterBar.jsx";
import EventGrid from "../components/events/EventGrid.jsx";
import EventComposerModal from "../components/events/EventComposerModal.jsx";

const EMPTY_RESOLUTIONS = {};

export default function Events() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
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
  // When timeRange is "going", queryOptions remains "all" so useEvents doesn't break
  const queryOptions = useMemo(() => {
    const opts = { timeRange: timeRange === "going" ? "all" : timeRange };
    if (selectedCategory !== "all") {
      opts.category = selectedCategory;
    }
    return opts;
  }, [timeRange, selectedCategory]);

  const { events, isLoading, error, refetch } = useEvents(queryOptions);

  // Source of user RSVPs via locked Q2 query
  const {
    rsvps: myRsvps = [],
    eventIds: myRsvpEventIds = new Set(),
    isLoading: isRsvpsLoading,
    error: rsvpsError,
    refetch: refetchMyRsvps,
  } = useMyRsvps();

  // Scope resolution cache to active user and campus context
  const activeContextKey = `${authUser?.uid || ""}:${campusId || ""}`;
  const activeContextRef = useRef(activeContextKey);
  activeContextRef.current = activeContextKey;

  // Resolutions map for Going tab: Record<eventId, EventResolution>
  // Strictly scoped to active user and campus context
  const [resolutionState, setResolutionState] = useState({
    contextKey: activeContextKey,
    resolutions: {},
  });

  const resolutions = useMemo(() => {
    return resolutionState.contextKey === activeContextKey
      ? resolutionState.resolutions
      : EMPTY_RESOLUTIONS;
  }, [resolutionState.contextKey, resolutionState.resolutions, activeContextKey]);
  const resolutionsRef = useRef(resolutions);
  resolutionsRef.current = resolutions;

  const [isResolving, setIsResolving] = useState(false);
  const [removingRsvps, setRemovingRsvps] = useState({});
  const [removeErrors, setRemoveErrors] = useState({});
  const [retryingResolutions, setRetryingResolutions] = useState({});

  // Reset resolution cache and mutation states synchronously during render when context changes
  const [prevContextKey, setPrevContextKey] = useState(activeContextKey);
  if (activeContextKey !== prevContextKey) {
    setPrevContextKey(activeContextKey);
    resolutionsRef.current = {};
    setIsResolving(false);
    setRemovingRsvps({});
    setRemoveErrors({});
    setRetryingResolutions({});
  }

  // Effect to resolve un-resolved parent events for current user's RSVPs when on Going tab
  const rsvpsKey = useMemo(() => {
    return (myRsvps || [])
      .map((r) => r.eventId)
      .filter(Boolean)
      .sort()
      .join(",");
  }, [myRsvps]);

  useEffect(() => {
    if (timeRange !== "going") return;
    if (!authUser?.uid || !campusId || !myRsvps || myRsvps.length === 0) {
      setResolutionState({ contextKey: activeContextKey, resolutions: {} });
      setIsResolving(false);
      return;
    }

    const currentContext = activeContextRef.current;
    let isMounted = true;

    // Active RSVP event IDs for current user
    const activeRsvpEventIds = new Set(
      myRsvps.map((r) => r.eventId).filter(Boolean)
    );

    // Prune cached resolutions for events no longer in current user's RSVPs
    setResolutionState((prev) => {
      if (prev.contextKey !== currentContext) {
        return { contextKey: currentContext, resolutions: {} };
      }
      let changed = false;
      const pruned = {};
      for (const [id, res] of Object.entries(prev.resolutions)) {
        if (activeRsvpEventIds.has(id)) {
          pruned[id] = res;
        } else {
          changed = true;
        }
      }
      return changed ? { contextKey: currentContext, resolutions: pruned } : prev;
    });

    const unresolvedEventIds = Array.from(activeRsvpEventIds).filter(
      (id) => !resolutionsRef.current[id]
    );

    if (unresolvedEventIds.length === 0) {
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    Promise.all(
      unresolvedEventIds.map(async (eventId) => {
        try {
          const res = await resolveEvent(eventId);
          return { eventId, res };
        } catch (err) {
          return {
            eventId,
            res: {
              status: "error",
              event: null,
              error:
                err instanceof Error
                  ? err
                  : new Error(String(err || "Failed to resolve event")),
            },
          };
        }
      })
    ).then((results) => {
      if (!isMounted) return;
      // Stale context guard
      if (activeContextRef.current !== currentContext) return;

      setResolutionState((prev) => {
        const base = prev.contextKey === currentContext ? prev.resolutions : {};
        const next = { ...base };
        for (const { eventId, res } of results) {
          if (activeRsvpEventIds.has(eventId)) {
            next[eventId] = res;
          }
        }
        return { contextKey: currentContext, resolutions: next };
      });
      setIsResolving(false);
    });

    return () => {
      isMounted = false;
    };
  }, [timeRange, authUser?.uid, campusId, rsvpsKey, myRsvps, activeContextKey]);

  const handleRetryResolve = useCallback(
    async (eventId) => {
      if (!eventId || !authUser?.uid || !campusId) return;
      const currentContext = activeContextRef.current;
      setRetryingResolutions((prev) => ({ ...prev, [eventId]: true }));
      try {
        const res = await resolveEvent(eventId);
        if (activeContextRef.current !== currentContext) return;
        setResolutionState((prev) => {
          const base = prev.contextKey === currentContext ? prev.resolutions : {};
          return {
            contextKey: currentContext,
            resolutions: { ...base, [eventId]: res },
          };
        });
      } catch (err) {
        if (activeContextRef.current !== currentContext) return;
        setResolutionState((prev) => {
          const base = prev.contextKey === currentContext ? prev.resolutions : {};
          return {
            contextKey: currentContext,
            resolutions: {
              ...base,
              [eventId]: {
                status: "error",
                event: null,
                error:
                  err instanceof Error
                    ? err
                    : new Error(String(err || "Failed to resolve event")),
              },
            },
          };
        });
      } finally {
        if (activeContextRef.current === currentContext) {
          setRetryingResolutions((prev) => ({ ...prev, [eventId]: false }));
        }
      }
    },
    [authUser?.uid, campusId]
  );

  const handleRemoveRsvp = useCallback(
    async (eventId) => {
      if (!eventId || !authUser?.uid || !campusId) return;
      const currentContext = activeContextRef.current;
      setRemovingRsvps((prev) => ({ ...prev, [eventId]: true }));
      setRemoveErrors((prev) => ({ ...prev, [eventId]: null }));
      try {
        await deleteEventRsvp(eventId, authUser.uid);
        if (activeContextRef.current !== currentContext) return;
        setResolutionState((prev) => {
          const base = prev.contextKey === currentContext ? prev.resolutions : {};
          const next = { ...base };
          delete next[eventId];
          return { contextKey: currentContext, resolutions: next };
        });
      } catch (err) {
        if (activeContextRef.current !== currentContext) return;
        setRemoveErrors((prev) => ({
          ...prev,
          [eventId]: err?.message || "Failed to remove RSVP. Please try again.",
        }));
      } finally {
        if (activeContextRef.current === currentContext) {
          setRemovingRsvps((prev) => ({ ...prev, [eventId]: false }));
        }
      }
    },
    [authUser?.uid, campusId]
  );

  // Partition Going tab items
  const goingPartition = useMemo(() => {
    if (timeRange !== "going") {
      return { availableEvents: [], inaccessibleRsvps: [], resolutionErrors: [] };
    }

    const availableEvents = [];
    const inaccessibleRsvps = [];
    const resolutionErrors = [];

    for (const rsvp of myRsvps) {
      const res = resolutions[rsvp.eventId];
      if (!res) continue;

      if (res.status === "available" && res.event) {
        availableEvents.push(res.event);
      } else if (res.status === "inaccessible") {
        inaccessibleRsvps.push(rsvp);
      } else if (res.status === "error") {
        resolutionErrors.push({ eventId: rsvp.eventId, error: res.error });
      }
    }

    return { availableEvents, inaccessibleRsvps, resolutionErrors };
  }, [timeRange, myRsvps, resolutions]);

  // Derive unique community filter options from loaded events (or going events)
  const communityOptions = useMemo(() => {
    const sourceList = timeRange === "going" ? goingPartition.availableEvents : events;
    if (!Array.isArray(sourceList)) return [];
    const map = new Map();
    sourceList.forEach((e) => {
      if (e.communityId) {
        map.set(e.communityId, e.organizerName || e.communityId);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [timeRange, goingPartition.availableEvents, events]);

  // Client-side community and search filter
  const filteredEvents = useMemo(() => {
    const listToFilter =
      timeRange === "going" ? goingPartition.availableEvents : events;

    if (!Array.isArray(listToFilter)) return [];

    return listToFilter.filter((e) => {
      // Category filter
      if (selectedCategory !== "all" && e.category !== selectedCategory) {
        return false;
      }

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
  }, [
    timeRange,
    goingPartition.availableEvents,
    events,
    selectedCategory,
    selectedCommunity,
    searchTerm,
  ]);

  const hasActiveFilters =
    selectedCategory !== "all" ||
    selectedCommunity !== "all" ||
    searchTerm.trim() !== "";

  const displayedInaccessibleRsvps = useMemo(() => {
    if (timeRange !== "going") return [];
    return goingPartition.inaccessibleRsvps;
  }, [timeRange, goingPartition.inaccessibleRsvps]);

  const displayedResolutionErrors = useMemo(() => {
    if (timeRange !== "going") return [];
    return goingPartition.resolutionErrors;
  }, [timeRange, goingPartition.resolutionErrors]);

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSelectedCommunity("all");
    setSearchTerm("");
  };

  const getEmptyTitle = () => {
    if (hasActiveFilters) return "No matching events found";
    if (timeRange === "going") return "No events RSVP'd yet";
    return timeRange === "past"
      ? "No past events found"
      : "No upcoming events found";
  };

  const getEmptyDescription = () => {
    if (hasActiveFilters) {
      return "No events match your current search or filter criteria. Try adjusting or resetting your filters.";
    }
    if (timeRange === "going") {
      return "You haven't RSVP'd to any events yet. Explore upcoming campus events and reserve your spot!";
    }
    return timeRange === "past"
      ? "There are no completed events recorded for your campus."
      : "There are currently no upcoming events scheduled at your campus. Check back soon for new workshops and meetups!";
  };

  const gridLoading =
    timeRange === "going"
      ? isRsvpsLoading || (myRsvps.length > 0 && isResolving && Object.keys(resolutions).length === 0)
      : isLoading;

  const gridError = timeRange === "going" ? rsvpsError : error;

  const totalItemCount =
    timeRange === "going"
      ? filteredEvents.length + displayedInaccessibleRsvps.length + displayedResolutionErrors.length
      : filteredEvents.length;

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
        {!gridLoading && !gridError && totalItemCount > 0 && (
          <div className="mb-4 flex items-center justify-between text-xs font-medium text-ink-muted">
            <span data-testid="events-count-label">
              Showing {totalItemCount}{" "}
              {totalItemCount === 1 ? "event" : "events"}
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
          isLoading={gridLoading}
          error={gridError}
          onRetry={timeRange === "going" ? refetchMyRsvps : refetch}
          emptyTitle={getEmptyTitle()}
          emptyDescription={getEmptyDescription()}
          hasActiveFilters={hasActiveFilters}
          rsvpEventIds={myRsvpEventIds}
          inaccessibleRsvps={displayedInaccessibleRsvps}
          onRemoveRsvp={handleRemoveRsvp}
          removingRsvps={removingRsvps}
          removeErrors={removeErrors}
          resolutionErrors={displayedResolutionErrors}
          onRetryResolve={handleRetryResolve}
          retryingResolutions={retryingResolutions}
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
