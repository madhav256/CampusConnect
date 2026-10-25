/**
 * Milestone 20 — Unit 20.5: Event Detail Experience & Community Integration
 *
 * Modal dialog for authorized community leaders (admin/moderator) to create events.
 * Enforces community selection, locked 8 categories, 2-tier visibility,
 * date validation (endAt >= startAt), and delegates mutation to createEvent().
 */

import { useState, useEffect } from "react";
import { X, Calendar, AlertCircle, Globe, Lock } from "lucide-react";
import { useAuth } from "../../hooks/useAuth.js";
import { useOptionalCampus } from "../../hooks/useCampus.js";
import { useEligibleCommunities } from "../../hooks/useEligibleCommunities.js";
import { createEvent } from "../../services/eventService.js";
import {
  EVENT_CATEGORY_LIST,
  EVENT_VISIBILITIES,
} from "../../constants.js";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import Textarea from "../ui/Textarea.jsx";

function generateSlug(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

export default function EventComposerModal({
  isOpen,
  onClose,
  onSuccess,
  initialCommunityId = "",
  eligibleCommunities: propEligibleCommunities,
}) {
  const modalId = "event-composer";
  const { user } = useAuth();
  const campusCtx = useOptionalCampus();
  const campusId = campusCtx?.campusId || null;

  // Use hook if communities not explicitly supplied
  const { eligibleCommunities: hookEligibleCommunities, isLoading: isCheckingEligible } =
    useEligibleCommunities(campusId);

  const eligibleCommunities = propEligibleCommunities || hookEligibleCommunities || [];

  // Form State
  const [selectedCommunityId, setSelectedCommunityId] = useState(initialCommunityId);
  const communityId =
    selectedCommunityId ||
    initialCommunityId ||
    (eligibleCommunities.length > 0 ? eligibleCommunities[0].id : "");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [category, setCategory] = useState("tech");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [visibility, setVisibility] = useState(EVENT_VISIBILITIES.CAMPUS_PUBLIC);
  const [imageURL, setImageURL] = useState("");
  const [description, setDescription] = useState("");

  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleTitleChange = (e) => {
    const val = e.target.value;
    setTitle(val);
    if (!isSlugTouched) {
      setSlug(generateSlug(val));
    }
    if (formErrors.title) {
      setFormErrors((prev) => ({ ...prev, title: undefined }));
    }
  };

  const handleSlugChange = (e) => {
    setIsSlugTouched(true);
    setSlug(e.target.value);
  };

  const validateForm = () => {
    const errors = {};

    if (!communityId) {
      errors.communityId = "Please select a sponsoring community.";
    }

    if (!title.trim()) {
      errors.title = "Event title is required.";
    }

    if (!category || !EVENT_CATEGORY_LIST.includes(category)) {
      errors.category = "Please select a valid event category.";
    }

    if (!location.trim()) {
      errors.location = "Event location or venue is required.";
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
      const startTime = new Date(startAt).getTime();
      const endTime = new Date(endAt).getTime();
      if (!isNaN(startTime) && !isNaN(endTime) && endTime < startTime) {
        errors.endAt = "End time must be after or equal to start time.";
      }
    }

    if (capacity !== "" && capacity !== null && capacity !== undefined) {
      const parsedCap = Number(capacity);
      if (!Number.isInteger(parsedCap) || parsedCap < 1 || parsedCap > 10000) {
        errors.capacity = "Capacity must be a whole number between 1 and 10,000.";
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

    const selectedCommunity = eligibleCommunities.find((c) => c.id === communityId);
    const organizerName = selectedCommunity?.name || "Campus Community";

    const payload = {
      communityId,
      campusId,
      createdBy: user?.uid,
      title: title.trim(),
      slug: (slug.trim() || generateSlug(title)) || undefined,
      description: description.trim(),
      category,
      location: location.trim(),
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      imageURL: imageURL.trim() || null,
      organizerName,
      visibility,
    };

    if (capacity !== "" && capacity !== null && capacity !== undefined) {
      payload.capacity = Number(capacity);
    }

    setIsSubmitting(true);
    try {
      const newEventId = await createEvent(payload, {
        uid: user?.uid,
        campusId,
      });

      // Reset form
      setTitle("");
      setSlug("");
      setIsSlugTouched(false);
      setLocation("");
      setStartAt("");
      setEndAt("");
      setCapacity("");
      setImageURL("");
      setDescription("");
      setFormErrors({});

      onClose();
      if (onSuccess) {
        onSuccess(newEventId);
      }
    } catch (err) {
      setSubmitError(err?.message || "Failed to create event. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      data-testid="event-composer-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-xs transition-opacity"
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border-warm bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border-warm/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-terracotta-200/60 bg-terracotta-50 text-terracotta-600">
              <Calendar className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={`${modalId}-title`}
                data-testid="composer-modal-title"
                className="font-serif text-lg font-bold text-ink"
              >
                Create New Event
              </h2>
              <p className="text-xs text-ink-muted">
                Publish a campus gathering, workshop, or competition
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            data-testid="composer-close-btn"
            aria-label="Close modal"
            className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-ink transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form
          onSubmit={handleSubmit}
          data-testid="event-composer-form"
          className="max-h-[75vh] overflow-y-auto p-6 space-y-5"
        >
          {/* Submission Error Banner */}
          {submitError && (
            <div
              data-testid="composer-error-alert"
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 text-sm"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold text-rose-800">Event creation failed</p>
                <p className="text-xs sm:text-sm text-rose-700 mt-0.5">{submitError}</p>
              </div>
            </div>
          )}

          {/* Sponsoring Community Selection */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${modalId}-community`}
              className="block text-sm font-medium text-stone-700"
            >
              Sponsoring Community <span className="text-terracotta-600">*</span>
            </label>
            {eligibleCommunities.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                You do not have leadership roles (moderator or admin) in any campus community.
                Only community leaders may create events.
              </div>
            ) : (
              <div className="relative">
                <select
                  id={`${modalId}-community`}
                  data-testid="composer-community-select"
                  value={communityId}
                  onChange={(e) => {
                    setSelectedCommunityId(e.target.value);
                    if (formErrors.communityId) {
                      setFormErrors((prev) => ({ ...prev, communityId: undefined }));
                    }
                  }}
                  disabled={isSubmitting || isCheckingEligible}
                  className="w-full rounded-xl border border-border-warm bg-surface px-4 py-2 text-sm text-ink outline-none transition focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
                >
                  <option value="" disabled>
                    Select an eligible community...
                  </option>
                  {eligibleCommunities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {formErrors.communityId && (
              <p className="text-xs text-rose-600">{formErrors.communityId}</p>
            )}
          </div>

          {/* Title & Slug Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id={`${modalId}-title`}
              label="Event Title"
              required
              data-testid="composer-title-input"
              value={title}
              onChange={handleTitleChange}
              placeholder="e.g., Annual AI Hackathon 2026"
              error={formErrors.title}
              disabled={isSubmitting}
            />

            <Input
              id={`${modalId}-slug`}
              label="URL Slug"
              data-testid="composer-slug-input"
              value={slug}
              onChange={handleSlugChange}
              placeholder="annual-ai-hackathon-2026"
              helperText="URL-friendly identifier"
              disabled={isSubmitting}
            />
          </div>

          {/* Category & Location Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor={`${modalId}-category`}
                className="block text-sm font-medium text-stone-700"
              >
                Category <span className="text-terracotta-600">*</span>
              </label>
              <select
                id={`${modalId}-category`}
                data-testid="composer-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border-warm bg-surface px-4 py-2 text-sm text-ink outline-none transition focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
              >
                {EVENT_CATEGORY_LIST.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat] || cat}
                  </option>
                ))}
              </select>
            </div>

            <Input
              id={`${modalId}-location`}
              label="Location / Venue"
              required
              data-testid="composer-location-input"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                if (formErrors.location) {
                  setFormErrors((prev) => ({ ...prev, location: undefined }));
                }
              }}
              placeholder="e.g., Student Center Room 402 or Main Auditorium"
              error={formErrors.location}
              disabled={isSubmitting}
            />
          </div>

          {/* Dates & Times Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor={`${modalId}-start-at`}
                className="block text-sm font-medium text-stone-700"
              >
                Start Date & Time <span className="text-terracotta-600">*</span>
              </label>
              <input
                id={`${modalId}-start-at`}
                type="datetime-local"
                data-testid="composer-start-at-input"
                value={startAt}
                onChange={(e) => {
                  setStartAt(e.target.value);
                  if (formErrors.startAt) {
                    setFormErrors((prev) => ({ ...prev, startAt: undefined }));
                  }
                }}
                disabled={isSubmitting}
                className={`w-full rounded-xl border bg-surface px-4 py-2 text-sm text-ink outline-none transition ${
                  formErrors.startAt
                    ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                    : "border-border-warm focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
                }`}
              />
              {formErrors.startAt && (
                <p className="text-xs text-rose-600">{formErrors.startAt}</p>
              )}
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
                data-testid="composer-end-at-input"
                value={endAt}
                onChange={(e) => {
                  setEndAt(e.target.value);
                  if (formErrors.endAt) {
                    setFormErrors((prev) => ({ ...prev, endAt: undefined }));
                  }
                }}
                disabled={isSubmitting}
                className={`w-full rounded-xl border bg-surface px-4 py-2 text-sm text-ink outline-none transition ${
                  formErrors.endAt
                    ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                    : "border-border-warm focus:border-terracotta-600 focus:ring-2 focus:ring-terracotta-500/20"
                }`}
              />
              {formErrors.endAt && (
                <p className="text-xs text-rose-600">{formErrors.endAt}</p>
              )}
            </div>
          </div>

          {/* Visibility Section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-700">
              Visibility <span className="text-terracotta-600">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                data-testid="composer-visibility-public"
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${
                  visibility === EVENT_VISIBILITIES.CAMPUS_PUBLIC
                    ? "border-terracotta-600 bg-terracotta-50/40 text-ink ring-1 ring-terracotta-600"
                    : "border-border-warm bg-surface hover:border-stone-300"
                }`}
              >
                <input
                  type="radio"
                  name={`${modalId}-visibility`}
                  value={EVENT_VISIBILITIES.CAMPUS_PUBLIC}
                  checked={visibility === EVENT_VISIBILITIES.CAMPUS_PUBLIC}
                  onChange={() => setVisibility(EVENT_VISIBILITIES.CAMPUS_PUBLIC)}
                  disabled={isSubmitting}
                  className="mt-1 text-terracotta-600 focus:ring-terracotta-500"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Globe className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span>Campus Public</span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Visible to all authenticated students from your campus.
                  </p>
                </div>
              </label>

              <label
                data-testid="composer-visibility-community"
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${
                  visibility === EVENT_VISIBILITIES.COMMUNITY_ONLY
                    ? "border-terracotta-600 bg-terracotta-50/40 text-ink ring-1 ring-terracotta-600"
                    : "border-border-warm bg-surface hover:border-stone-300"
                }`}
              >
                <input
                  type="radio"
                  name={`${modalId}-visibility`}
                  value={EVENT_VISIBILITIES.COMMUNITY_ONLY}
                  checked={visibility === EVENT_VISIBILITIES.COMMUNITY_ONLY}
                  onChange={() => setVisibility(EVENT_VISIBILITIES.COMMUNITY_ONLY)}
                  disabled={isSubmitting}
                  className="mt-1 text-terracotta-600 focus:ring-terracotta-500"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Lock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    <span>Community Only</span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Visible only to active members of the sponsoring community.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Capacity & Banner Image Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id={`${modalId}-capacity`}
              type="number"
              min="1"
              max="10000"
              label="Seat Capacity (Optional)"
              data-testid="composer-capacity-input"
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                if (formErrors.capacity) {
                  setFormErrors((prev) => ({ ...prev, capacity: undefined }));
                }
              }}
              placeholder="Leave blank for uncapped event"
              helperText="Max attendees (1–10,000); enables FIFO waitlist when full"
              error={formErrors.capacity}
              disabled={isSubmitting}
            />

            <Input
              id={`${modalId}-image`}
              label="Banner Image URL"
              data-testid="composer-image-input"
              value={imageURL}
              onChange={(e) => setImageURL(e.target.value)}
              placeholder="https://example.com/images/hackathon-banner.jpg"
              helperText="Optional link to a high-resolution banner photo"
              disabled={isSubmitting}
            />
          </div>

          {/* Description */}
          <Textarea
            id={`${modalId}-description`}
            label="Event Description"
            data-testid="composer-description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the agenda, speakers, prerequisites, or topics covered..."
            disabled={isSubmitting}
          />

          {/* Modal Footer Controls */}
          <div className="border-t border-border-warm/60 pt-4 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="composer-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              loadingText="Creating Event..."
              disabled={isSubmitting || eligibleCommunities.length === 0}
              data-testid="composer-submit-btn"
            >
              Publish Event
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
