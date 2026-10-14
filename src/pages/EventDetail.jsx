/**
 * Milestone 20 — Unit 20.5: Event Detail Experience & Community Integration
 *
 * Dedicated Event Detail page for individual campus activities and gatherings.
 * Consumes useEvent(eventId) for real-time subscription and data access.
 * Displays normalized event metadata, schedule, venue, sponsoring community,
 * and cancellation state without direct Firestore coupling or RSVP controls.
 */

import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertTriangle,
  Globe,
  Lock,
  RefreshCw,
  Building2,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useEvent } from "../hooks/useEvent.js";
import { useEventRsvp } from "../hooks/useEventRsvp.js";
import { useEventManagement } from "../hooks/useEventManagement.js";
import Navbar from "../components/layout/Navbar.jsx";
import PageContainer from "../components/layout/PageContainer.jsx";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import EventCategoryBadge from "../components/events/EventCategoryBadge.jsx";
import EventStatusBadge from "../components/events/EventStatusBadge.jsx";
import EventRsvpButton from "../components/events/EventRsvpButton.jsx";
import EventAttendeePreview from "../components/events/EventAttendeePreview.jsx";
import RsvpStatusBadge from "../components/events/RsvpStatusBadge.jsx";
import EventManagementToolbar from "../components/events/EventManagementToolbar.jsx";
import EventEditModal from "../components/events/EventEditModal.jsx";
import EventCancelModal from "../components/events/EventCancelModal.jsx";
import EventRepublishModal from "../components/events/EventRepublishModal.jsx";
import EventDeleteModal from "../components/events/EventDeleteModal.jsx";
import { EVENT_STATUSES, EVENT_VISIBILITIES } from "../constants.js";

/**
 * Formats a Date object or Timestamp into a human-readable date string.
 *
 * @param {Date|Timestamp|string|null} val
 * @returns {string}
 */
function formatFullDate(val) {
  if (!val) return "Date TBA";
  const d = val.toDate ? val.toDate() : new Date(val);
  if (isNaN(d.getTime())) return "Date TBA";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/**
 * Formats start and end times into a friendly time span string.
 *
 * @param {Date|Timestamp|string|null} startVal
 * @param {Date|Timestamp|string|null} endVal
 * @returns {string}
 */
function formatTimeRange(startVal, endVal) {
  if (!startVal) return "Time TBA";
  const start = startVal.toDate ? startVal.toDate() : new Date(startVal);
  if (isNaN(start.getTime())) return "Time TBA";

  const startTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(start);

  if (!endVal) return `Starts at ${startTimeStr}`;

  const end = endVal.toDate ? endVal.toDate() : new Date(endVal);
  if (isNaN(end.getTime())) return `Starts at ${startTimeStr}`;

  const endTimeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(end);

  return `${startTimeStr} – ${endTimeStr}`;
}

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { event, availability, isLoading, error, refetch } = useEvent(eventId);
  const { rsvp } = useEventRsvp(eventId);

  // Modal Open States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isRepublishOpen, setIsRepublishOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Authority & Reactive Temporal Lifecycle Management
  const {
    isLeader,
    isAdmin,
    temporalState,
    isOngoing,
    canEdit,
    canCancel,
    canRepublish,
    canDelete,
    isMutating,
    mutationError,
    clearError,
    deliveryLedger,
    isDelivering,
    deliveryError,
    resumeDelivery,
    editDetails,
    cancelCurrentEvent,
    republishCurrentEvent,
    deleteCurrentEvent,
  } = useEventManagement(event);

  const handleSaveEdit = async (sparseUpdates) => {
    await editDetails(sparseUpdates);
  };

  const handleConfirmCancel = async () => {
    await cancelCurrentEvent();
  };

  const handleConfirmRepublish = async () => {
    await republishCurrentEvent();
  };

  const handleConfirmDelete = async () => {
    await deleteCurrentEvent();
    navigate("/events", { replace: true });
  };

  const eventResolution = useMemo(() => {
    if (availability === "available" && event) {
      return { status: "available", event, error: null };
    }
    if (availability === "inaccessible") {
      return { status: "inaccessible", event: null, error: null };
    }
    if (availability === "error") {
      return {
        status: "error",
        event: null,
        error: error instanceof Error ? error : new Error(String(error || "Failed to load event.")),
      };
    }
    return null;
  }, [availability, event, error]);

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div data-testid="event-detail-loading" className="space-y-6">
            <div className="h-6 w-32 animate-pulse rounded-md bg-stone-200" />
            <div className="h-64 sm:h-80 w-full animate-pulse rounded-3xl bg-stone-200/80" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="h-64 animate-pulse rounded-2xl bg-stone-200/70 lg:col-span-2" />
              <div className="h-64 animate-pulse rounded-2xl bg-stone-200/70" />
            </div>
          </div>
        </PageContainer>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div data-testid="event-detail-error" className="py-12">
            <Card className="mx-auto max-w-lg text-center space-y-4 py-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-xl font-bold text-ink">
                Unable to Load Event
              </h2>
              <p className="text-sm text-ink-muted">{error}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>Retry</span>
                </Button>
                <Link
                  to="/events"
                  className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700"
                >
                  Back to Events
                </Link>
              </div>
            </Card>
          </div>
        </PageContainer>
      </div>
    );
  }

  // Missing Event / Not Found State
  if (!event) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div data-testid="event-detail-not-found" className="py-12">
            <EmptyState
              title="Event Not Found"
              description="The event you are looking for does not exist or may have been removed."
              action={
                <Link
                  to="/events"
                  data-testid="not-found-back-link"
                  className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700"
                >
                  Back to Events
                </Link>
              }
            />
          </div>
        </PageContainer>
      </div>
    );
  }

  const isCancelled =
    event.status === EVENT_STATUSES.CANCELLED || event.status === "cancelled";
  const formattedDate = formatFullDate(event.startAt);
  const formattedTime = formatTimeRange(event.startAt, event.endAt);
  const isCommunityOnly = event.visibility === EVENT_VISIBILITIES.COMMUNITY_ONLY;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <PageContainer>
        <div className="space-y-6 pb-24 lg:pb-0">
          {/* Back Navigation */}
          <div>
            <Link
              to="/events"
              data-testid="back-to-events"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-700 hover:text-terracotta-800 transition"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Events</span>
            </Link>
          </div>

          {/* Cancellation Alert Banner */}
          {isCancelled && (
            <div
              data-testid="event-cancelled-banner"
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 shadow-xs"
            >
              <AlertTriangle
                className="h-5 w-5 shrink-0 text-rose-600 mt-0.5"
                aria-hidden="true"
              />
              <div className="text-sm">
                <p className="font-semibold text-rose-800">
                  This event has been cancelled
                </p>
                <p className="mt-0.5 text-rose-700 text-xs sm:text-sm">
                  The organizers have cancelled this session. It remains visible
                  for informational purposes.
                </p>
              </div>
            </div>
          )}

          {/* Cancellation Notification Delivery Status (For Authorized Leaders/Admins) */}
          {isCancelled && (isLeader || isAdmin || canRepublish || canDelete) && (
            <div className="space-y-2">
              {isDelivering && (
                <div
                  data-testid="cancellation-delivery-in-progress"
                  className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs sm:text-sm text-amber-900 shadow-xs"
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden="true" />
                  <span>
                    Delivering cancellation notifications to attendees...
                    {deliveryLedger?.processedCount !== undefined ? ` (${deliveryLedger.processedCount} processed)` : ""}
                  </span>
                </div>
              )}

              {!isDelivering && (deliveryError || (deliveryLedger && (deliveryLedger.status === "pending" || deliveryLedger.status === "in_progress"))) && (
                <div
                  data-testid="cancellation-delivery-pending-card"
                  role="status"
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs sm:text-sm text-amber-950 shadow-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold text-amber-900">
                        Cancellation notification delivery incomplete
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        {deliveryError
                          ? deliveryError
                          : `Delivery was interrupted. ${deliveryLedger?.processedCount || 0} attendees notified so far.`}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="resume-delivery-btn"
                    disabled={isDelivering || isMutating}
                    onClick={async () => {
                      try {
                        await resumeDelivery();
                      } catch {
                        // error captured in hook state
                      }
                    }}
                    className="shrink-0 gap-1.5 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Resume Delivery</span>
                  </Button>
                </div>
              )}

              {!isDelivering && deliveryLedger?.status === "completed" && (
                <div
                  data-testid="cancellation-delivery-completed"
                  className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 shadow-xs"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span>
                    Cancellation notifications delivered ({deliveryLedger.processedCount} attendee{deliveryLedger.processedCount === 1 ? "" : "s"} notified).
                  </span>
                </div>
              )}

              {!isDelivering && deliveryLedger?.status === "superseded" && (
                <div
                  data-testid="cancellation-delivery-superseded"
                  className="rounded-2xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-600"
                >
                  Notification delivery superseded by republishing or lifecycle update.
                </div>
              )}
            </div>
          )}

          {/* Management Toolbar for Authorized Leaders */}
          {event && (canEdit || canCancel || canRepublish || canDelete) && (
            <EventManagementToolbar
              data-testid="event-management-toolbar"
              event={event}
              isLeader={isLeader}
              isAdmin={isAdmin}
              temporalState={temporalState}
              isOngoing={isOngoing}
              canEdit={canEdit}
              canCancel={canCancel}
              canRepublish={canRepublish}
              canDelete={canDelete}
              isMutating={isMutating}
              mutationError={mutationError}
              onClearError={clearError}
              onOpenEdit={() => setIsEditOpen(true)}
              onOpenCancel={() => setIsCancelOpen(true)}
              onOpenRepublish={() => setIsRepublishOpen(true)}
              onOpenDelete={() => setIsDeleteOpen(true)}
            />
          )}

          {/* Event Header Banner / Hero Card */}
          <div
            data-testid="event-hero-card"
            className="overflow-hidden rounded-3xl border border-border-warm bg-surface shadow-xs"
          >
            {event.imageURL ? (
              <div className="relative h-56 sm:h-72 lg:h-80 w-full overflow-hidden bg-stone-100">
                <img
                  src={event.imageURL}
                  alt={event.title || "Event banner"}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <EventCategoryBadge category={event.category} />
                    <EventStatusBadge event={event} />
                  </div>
                  <h1
                    data-testid="event-detail-title"
                    className={`font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white ${
                      isCancelled ? "line-through opacity-85" : ""
                    }`}
                  >
                    {event.title}
                  </h1>
                </div>
              </div>
            ) : (
              <div className="relative bg-gradient-to-br from-terracotta-50/70 via-surface to-stone-100 p-6 sm:p-8 border-b border-border-warm/60">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <EventCategoryBadge category={event.category} />
                  <EventStatusBadge event={event} />
                </div>
                <h1
                  data-testid="event-detail-title"
                  className={`font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-ink ${
                    isCancelled ? "line-through text-stone-500" : ""
                  }`}
                >
                  {event.title}
                </h1>
                {event.organizerName && (
                  <p
                    data-testid="event-detail-organizer"
                    className="mt-2 text-sm text-ink-muted"
                  >
                    Organized by{" "}
                    <span className="font-semibold text-stone-800">
                      {event.organizerName}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Details & Information Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main Content Column (Description & Overview) */}
            <div className="space-y-6 lg:col-span-2">
              <Card data-testid="event-description-card" className="space-y-4">
                <h2 className="font-serif text-lg font-bold text-ink border-b border-border-warm/60 pb-3">
                  About this Event
                </h2>
                <div
                  data-testid="event-detail-description"
                  className="prose prose-stone max-w-none text-sm sm:text-base leading-relaxed text-ink-muted whitespace-pre-line"
                >
                  {event.description || "No full description provided for this event."}
                </div>
              </Card>

              {/* Sponsoring Community Integration Card */}
              {event.communityId && (
                <Card
                  data-testid="event-sponsoring-community-card"
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-terracotta-200/60 bg-terracotta-50 text-terracotta-600">
                      <Building2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">
                        Sponsoring Community
                      </p>
                      <p
                        data-testid="event-detail-community-name"
                        className="font-serif text-base font-bold text-ink"
                      >
                        {event.organizerName || "Campus Community"}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/communities/${event.communityId}`}
                    data-testid="event-community-link"
                    className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-stone-400 hover:text-terracotta-700 hover:bg-stone-50"
                  >
                    View Community
                  </Link>
                </Card>
              )}
            </div>

            {/* Sidebar Column (Time, Venue, Details) */}
            <div className="space-y-6 lg:col-span-1">
              {/* Event Registration & RSVP Card */}
              <Card data-testid="event-rsvp-card" className="space-y-4">
                <div className="flex items-center justify-between border-b border-border-warm/60 pb-3">
                  <h2 className="font-serif text-base font-bold text-ink">
                    Registration
                  </h2>
                  <RsvpStatusBadge resolution={eventResolution} rsvp={rsvp} />
                </div>

                <EventRsvpButton
                  eventId={eventId}
                  event={event}
                  availability={availability}
                />

                <div className="border-t border-border-warm/60 pt-3">
                  <EventAttendeePreview
                    eventId={eventId}
                    enabled={availability === "available"}
                  />
                </div>
              </Card>

              <Card data-testid="event-meta-card" className="space-y-5">
                <h2 className="font-serif text-base font-bold text-ink border-b border-border-warm/60 pb-2">
                  Event Details
                </h2>

                {/* Date & Time */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Calendar
                      className="h-5 w-5 text-terracotta-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-medium text-ink-muted">Date</p>
                      <p
                        data-testid="event-detail-date"
                        className="text-sm font-semibold text-ink"
                      >
                        {formattedDate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Clock
                      className="h-5 w-5 text-terracotta-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-medium text-ink-muted">Time</p>
                      <p
                        data-testid="event-detail-time"
                        className="text-sm font-semibold text-ink"
                      >
                        {formattedTime}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Venue / Location */}
                <div className="border-t border-border-warm/60 pt-3">
                  <div className="flex items-start gap-3">
                    <MapPin
                      className="h-5 w-5 text-terracotta-600 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-medium text-ink-muted">Location</p>
                      <p
                        data-testid="event-detail-location"
                        className="text-sm font-semibold text-ink"
                      >
                        {event.location || "Location to be announced"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Visibility */}
                <div className="border-t border-border-warm/60 pt-3">
                  <div className="flex items-start gap-3">
                    {isCommunityOnly ? (
                      <Lock
                        className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <Globe
                        className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <p className="text-xs font-medium text-ink-muted">Visibility</p>
                      <p
                        data-testid="event-detail-visibility"
                        className="text-sm font-semibold text-ink"
                      >
                        {isCommunityOnly ? "Community Only" : "Campus Public"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {isCommunityOnly
                          ? "Accessible to active members of this community."
                          : "Open to all students from this campus."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Organizer */}
                {event.organizerName && (
                  <div className="border-t border-border-warm/60 pt-3">
                    <div className="flex items-start gap-3">
                      <Users
                        className="h-5 w-5 text-stone-500 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-xs font-medium text-ink-muted">Host</p>
                        <p
                          data-testid="event-detail-host"
                          className="text-sm font-semibold text-ink"
                        >
                          {event.organizerName}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </PageContainer>
      {/* Sticky Bottom Action Bar (Mobile Viewport < 1024px) */}
      <div
        data-testid="event-rsvp-mobile-bar"
        className="fixed bottom-0 inset-x-0 z-30 border-t border-border-warm bg-surface/95 backdrop-blur-md p-4 shadow-lg lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <RsvpStatusBadge resolution={eventResolution} rsvp={rsvp} />
          </div>
          <div className="shrink-0 w-44">
            <EventRsvpButton
              eventId={eventId}
              event={event}
              availability={availability}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Management Action Modals */}
      {isEditOpen && (
        <EventEditModal
          data-testid="event-edit-modal"
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          event={event}
          isOngoing={isOngoing}
          isMutating={isMutating}
          onSave={handleSaveEdit}
        />
      )}

      {isCancelOpen && (
        <EventCancelModal
          data-testid="event-cancel-modal"
          isOpen={isCancelOpen}
          onClose={() => setIsCancelOpen(false)}
          event={event}
          isMutating={isMutating}
          onConfirm={handleConfirmCancel}
        />
      )}

      {isRepublishOpen && (
        <EventRepublishModal
          data-testid="event-republish-modal"
          isOpen={isRepublishOpen}
          onClose={() => setIsRepublishOpen(false)}
          event={event}
          isMutating={isMutating}
          onConfirm={handleConfirmRepublish}
        />
      )}

      {isDeleteOpen && (
        <EventDeleteModal
          data-testid="event-delete-modal"
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          event={event}
          isMutating={isMutating}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
