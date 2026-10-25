/**
 * Milestone 22 — Unit 22.4: Event Management UI
 *
 * Modal dialog for editing event details. Supports adaptive mutability states:
 * - Upcoming events: allows modifying all 9 domain allowlisted fields (including organizerName).
 * - Ongoing events: locks title, slug, category, host, and startAt; allows location, description,
 *   imageURL, and endAt extension.
 * Constructs sparse updates patches containing only modified fields and omits unchanged timestamps.
 */

import { useState, useEffect, useMemo } from "react";
import { X, Pencil, Lock, AlertCircle } from "lucide-react";
import { EVENT_CATEGORY_LIST } from "../../constants.js";
import { UPCOMING_MUTABLE_FIELDS, ONGOING_MUTABLE_FIELDS } from "../../data/events.js";
import { isCappedEvent } from "../../data/eventCapacities.js";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import Textarea from "../ui/Textarea.jsx";

const CATEGORY_LABELS = {
  academic: "Academic",
  tech: "Technology & Coding",
  cultural: "Arts & Culture",
  sports: "Sports & Athletics",
  career: "Career & Professional",
  workshop: "Hands-on Workshop",
  social: "Social & Gathering",
  competition: "Contest & Hackathon",
};

/**
 * Converts a Date, Timestamp, or ISO string to local datetime-local format (YYYY-MM-DDTHH:mm).
 *
 * @param {Date|object|string|null} val
 * @returns {string}
 */
function toDatetimeLocal(val) {
  if (!val) return "";
  const d = val.toDate ? val.toDate() : new Date(val);
  if (isNaN(d.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function EventEditModal({
  isOpen,
  onClose,
  event,
  coordinator = null,
  isOngoing = false,
  isMutating = false,
  onSave,
  ...props
}) {
  const modalId = "event-edit";
  const isCapped = isCappedEvent(event);

  // Form Fields
  const [title, setTitle] = useState(event?.title || "");
  const [slug, setSlug] = useState(event?.slug || "");
  const [category, setCategory] = useState(event?.category || "tech");
  const [location, setLocation] = useState(event?.location || "");
  const [organizerName, setOrganizerName] = useState(event?.organizerName || "");
  const [startAt, setStartAt] = useState(() => toDatetimeLocal(event?.startAt));
  const [endAt, setEndAt] = useState(() => toDatetimeLocal(event?.endAt));
  const [capacity, setCapacity] = useState(() =>
    isCappedEvent(event) ? String(event.capacity) : ""
  );
  const [imageURL, setImageURL] = useState(event?.imageURL || "");
  const [description, setDescription] = useState(event?.description || "");

  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronize form state if event identity changes while modal is mounted
  const [prevEventId, setPrevEventId] = useState(event?.id);
  if (event?.id !== prevEventId) {
    setPrevEventId(event?.id);
    setTitle(event?.title || "");
    setSlug(event?.slug || "");
    setCategory(event?.category || "tech");
    setLocation(event?.location || "");
    setOrganizerName(event?.organizerName || "");
    setStartAt(toDatetimeLocal(event?.startAt));
    setEndAt(toDatetimeLocal(event?.endAt));
    setCapacity(isCappedEvent(event) ? String(event.capacity) : "");
    setImageURL(event?.imageURL || "");
    setDescription(event?.description || "");
    setFormErrors({});
    setSubmitError(null);
  }

  // Handle ESC key
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isSubmitting && !isMutating) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, isMutating, onClose]);

  // Compute sparse diff against original event
  const sparseDiff = useMemo(() => {
    if (!event) return {};
    const diff = {};

    if (!isOngoing) {
      if (title.trim() !== (event.title || "").trim()) {
        diff.title = title.trim();
      }
      if (slug.trim() !== (event.slug || "").trim()) {
        diff.slug = slug.trim();
      }
      if (category !== event.category) {
        diff.category = category;
      }
      if (organizerName.trim() !== (event.organizerName || "").trim()) {
        diff.organizerName = organizerName.trim();
      }

      const initialStartStr = toDatetimeLocal(event.startAt);
      if (startAt && startAt !== initialStartStr) {
        diff.startAt = new Date(startAt);
      }

      if (isCapped && capacity.trim() !== "") {
        const parsedCap = Number(capacity);
        if (!Number.isNaN(parsedCap) && parsedCap !== event.capacity) {
          diff.capacity = parsedCap;
        }
      }
    }

    if (location.trim() !== (event.location || "").trim()) {
      diff.location = location.trim();
    }
    if (description.trim() !== (event.description || "").trim()) {
      diff.description = description.trim();
    }

    const normalizedNewImg = imageURL.trim() || null;
    const existingImg = event.imageURL || null;
    if (normalizedNewImg !== existingImg) {
      diff.imageURL = normalizedNewImg;
    }

    const initialEndStr = toDatetimeLocal(event.endAt);
    if (endAt && endAt !== initialEndStr) {
      diff.endAt = new Date(endAt);
    }

    // Defensively enforce that only allowlisted mutable fields for the temporal state can be submitted
    const allowedFields = isOngoing ? ONGOING_MUTABLE_FIELDS : UPCOMING_MUTABLE_FIELDS;
    const sanitizedDiff = {};
    for (const key of Object.keys(diff)) {
      if (allowedFields.includes(key)) {
        sanitizedDiff[key] = diff[key];
      }
    }

    return sanitizedDiff;
  }, [event, isOngoing, isCapped, title, slug, category, organizerName, startAt, endAt, capacity, location, description, imageURL]);

  const hasModifications = Object.keys(sparseDiff).length > 0;

  if (!isOpen || !event) return null;

  const validateForm = () => {
    const errors = {};

    if (!isOngoing) {
      if (!title.trim()) {
        errors.title = "Event title is required.";
      } else if (title.trim().length < 3) {
        errors.title = "Title must be at least 3 characters.";
      }

      if (!location.trim()) {
        errors.location = "Location is required.";
      }

      if (!startAt) {
        errors.startAt = "Start date and time are required.";
      } else {
        const startDate = new Date(startAt);
        if (isNaN(startDate.getTime())) {
          errors.startAt = "Invalid start date.";
        }
      }

      if (!endAt) {
        errors.endAt = "End date and time are required.";
      } else {
        const endDate = new Date(endAt);
        if (isNaN(endDate.getTime())) {
          errors.endAt = "Invalid end date.";
        }
      }

      if (startAt && endAt) {
        const startMs = new Date(startAt).getTime();
        const endMs = new Date(endAt).getTime();
        if (!isNaN(startMs) && !isNaN(endMs) && endMs < startMs) {
          errors.endAt = "End date/time must be at or after start date/time.";
        }
      }

      if (isCapped) {
        const parsedCap = Number(capacity);
        if (!capacity.trim() || !Number.isInteger(parsedCap) || parsedCap < 1 || parsedCap > 10000) {
          errors.capacity = "Capacity must be a whole number between 1 and 10,000.";
        } else if (coordinator) {
          const allocated =
            (Number(coordinator.confirmedCount) || 0) +
            (Number(coordinator.offeredCount) || 0);
          if (parsedCap < allocated) {
            errors.capacity = `Capacity cannot be less than currently allocated seats (${allocated}).`;
          }
        }
      }
    } else {
      // Ongoing event validation
      if (!location.trim()) {
        errors.location = "Location is required.";
      }

      if (sparseDiff.endAt) {
        const newEndMs = new Date(endAt).getTime();
        const existingEnd = event.endAt
          ? event.endAt.toDate
            ? event.endAt.toDate()
            : new Date(event.endAt)
          : null;
        const existingEndMs = existingEnd ? existingEnd.getTime() : 0;

        if (isNaN(newEndMs)) {
          errors.endAt = "Invalid end date.";
        } else if (newEndMs < existingEndMs) {
          errors.endAt = "Ongoing event end time cannot be shortened.";
        }
      }
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if (!hasModifications) {
      setSubmitError("No modifications were detected.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onSave) {
        await onSave(sparseDiff);
      }
      onClose();
    } catch (err) {
      setSubmitError(err?.message || "Failed to update event. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isSubmitting && !isMutating) {
      onClose();
    }
  };

  const existingEndStr = toDatetimeLocal(event.endAt);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      data-testid="event-edit-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-xs transition-opacity"
      {...props}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border-warm bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-warm/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-terracotta-200/60 bg-terracotta-50 text-terracotta-600">
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={`${modalId}-title`}
                data-testid="edit-modal-title"
                className="font-serif text-lg font-bold text-ink"
              >
                {isOngoing ? "Edit Ongoing Event" : "Edit Event Details"}
              </h2>
              <p className="text-xs text-ink-muted">
                {isOngoing
                  ? "Update live venue, description, banner, or extend end time"
                  : "Modify schedule, venue, host display name, and details"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isMutating}
            data-testid="edit-close-btn"
            aria-label="Close modal"
            className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-ink transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Ongoing Lock Banner */}
        {isOngoing && (
          <div
            data-testid="edit-ongoing-banner"
            role="status"
            className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50/90 px-6 py-3 text-xs sm:text-sm text-amber-900"
          >
            <Lock className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-amber-900">Event is currently in progress</p>
              <p className="text-amber-800 text-xs mt-0.5">
                Core identity (Title, Slug, Category, Host, and Start Time) is locked to prevent attendee confusion.
                You can update the location, description, image, or extend the end time.
              </p>
            </div>
          </div>
        )}

        {/* Body / Form */}
        <form
          onSubmit={handleSubmit}
          data-testid="event-edit-form"
          className="max-h-[72vh] overflow-y-auto p-6 space-y-4"
        >
          {/* Submission Error Banner */}
          {submitError && (
            <div
              data-testid="edit-error-alert"
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 text-sm"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold text-rose-800">Unable to save changes</p>
                <p className="text-xs sm:text-sm text-rose-700 mt-0.5">{submitError}</p>
              </div>
            </div>
          )}

          {/* Title & Slug Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id={`${modalId}-title`}
              label="Event Title"
              required={!isOngoing}
              data-testid="edit-title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formErrors.title) setFormErrors((prev) => ({ ...prev, title: undefined }));
              }}
              error={formErrors.title}
              disabled={isOngoing || isSubmitting || isMutating}
              helperText={isOngoing ? "Locked while event is ongoing" : undefined}
            />

            <Input
              id={`${modalId}-slug`}
              label="URL Slug"
              data-testid="edit-slug-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={isOngoing || isSubmitting || isMutating}
              helperText={isOngoing ? "Locked while event is ongoing" : "Identifier slug"}
            />
          </div>

          {/* Category & Host (Organizer Name) Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor={`${modalId}-category`}
                className="block text-sm font-medium text-stone-700"
              >
                Category {!isOngoing && <span className="text-terracotta-600">*</span>}
              </label>
              <select
                id={`${modalId}-category`}
                data-testid="edit-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isOngoing || isSubmitting || isMutating}
                className="w-full rounded-xl border border-border-warm bg-surface px-4 py-2 text-sm text-ink outline-none transition focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
              >
                {EVENT_CATEGORY_LIST.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] || cat}
                  </option>
                ))}
              </select>
              {isOngoing && (
                <p className="text-xs text-ink-muted">Locked while event is ongoing</p>
              )}
            </div>

            <Input
              id={`${modalId}-organizer`}
              label="Host / Organizer Name"
              data-testid="edit-organizer-input"
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              disabled={isOngoing || isSubmitting || isMutating}
              placeholder="e.g. Campus AI Club"
              helperText={isOngoing ? "Locked while event is ongoing" : "Public host name"}
            />
          </div>

          {/* Location / Venue */}
          <Input
            id={`${modalId}-location`}
            label="Location / Venue"
            required
            data-testid="edit-location-input"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              if (formErrors.location) setFormErrors((prev) => ({ ...prev, location: undefined }));
            }}
            placeholder="e.g., Student Center Room 402 or Main Auditorium"
            error={formErrors.location}
            disabled={isSubmitting || isMutating}
          />

          {/* Dates & Times Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor={`${modalId}-start-at`}
                className="block text-sm font-medium text-stone-700"
              >
                Start Date & Time {!isOngoing && <span className="text-terracotta-600">*</span>}
              </label>
              <input
                id={`${modalId}-start-at`}
                type="datetime-local"
                data-testid="edit-start-at-input"
                value={startAt}
                onChange={(e) => {
                  setStartAt(e.target.value);
                  if (formErrors.startAt) setFormErrors((prev) => ({ ...prev, startAt: undefined }));
                }}
                disabled={isOngoing || isSubmitting || isMutating}
                className={`w-full rounded-xl border bg-surface px-4 py-2 text-sm text-ink outline-none transition disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 ${
                  formErrors.startAt
                    ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                    : "border-border-warm focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
                }`}
              />
              {formErrors.startAt ? (
                <p className="text-xs text-rose-600">{formErrors.startAt}</p>
              ) : isOngoing ? (
                <p className="text-xs text-ink-muted">Locked once event has started</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={`${modalId}-end-at`}
                className="block text-sm font-medium text-stone-700"
              >
                End Date & Time <span className="text-terracotta-600">*</span>
              </label>
              <input
                id={`${modalId}-end-at`}
                type="datetime-local"
                data-testid="edit-end-at-input"
                value={endAt}
                min={isOngoing ? existingEndStr : undefined}
                onChange={(e) => {
                  setEndAt(e.target.value);
                  if (formErrors.endAt) setFormErrors((prev) => ({ ...prev, endAt: undefined }));
                }}
                disabled={isSubmitting || isMutating}
                className={`w-full rounded-xl border bg-surface px-4 py-2 text-sm text-ink outline-none transition disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 ${
                  formErrors.endAt
                    ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                    : "border-border-warm focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
                }`}
              />
              {formErrors.endAt ? (
                <p className="text-xs text-rose-600">{formErrors.endAt}</p>
              ) : isOngoing ? (
                <p className="text-xs text-ink-muted">Extension only (cannot end earlier)</p>
              ) : null}
            </div>
          </div>

          {/* Capacity (for Capped Events) & Banner Image URL */}
          {isCapped && (
            <Input
              id={`${modalId}-capacity`}
              type="number"
              min="1"
              max="10000"
              label="Seat Capacity"
              data-testid="edit-capacity-input"
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                if (formErrors.capacity) setFormErrors((prev) => ({ ...prev, capacity: undefined }));
              }}
              error={formErrors.capacity}
              disabled={isOngoing || isSubmitting || isMutating}
              helperText={
                isOngoing
                  ? "Locked while event is ongoing"
                  : "Increasing capacity automatically promotes waitlisted students"
              }
            />
          )}

          {/* Banner Image URL */}
          <Input
            id={`${modalId}-image`}
            label="Banner Image URL"
            data-testid="edit-image-input"
            value={imageURL}
            onChange={(e) => setImageURL(e.target.value)}
            placeholder="https://example.com/banner.jpg"
            helperText="Optional URL to header photo"
            disabled={isSubmitting || isMutating}
          />

          {/* Description */}
          <Textarea
            id={`${modalId}-description`}
            label="Event Description"
            data-testid="edit-description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Event details, speakers, agenda..."
            disabled={isSubmitting || isMutating}
          />

          {/* Modal Footer Controls */}
          <div className="border-t border-border-warm/60 pt-4 flex items-center justify-between">
            <div className="text-xs text-ink-muted">
              {hasModifications ? (
                <span className="text-emerald-700 font-medium">
                  {Object.keys(sparseDiff).length} field(s) modified
                </span>
              ) : (
                <span>No changes made</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting || isMutating}
                data-testid="edit-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting || isMutating}
                loadingText="Saving Changes..."
                disabled={!hasModifications || isSubmitting || isMutating}
                data-testid="edit-submit-btn"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
