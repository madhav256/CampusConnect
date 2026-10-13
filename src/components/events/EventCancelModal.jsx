/**
 * Milestone 22 — Unit 22.4: Event Management UI
 *
 * Confirmation dialog for cancelling an event. Explains immediate registration closure,
 * visual cancellation badges/banners, attendee voluntary RSVP cancellation, and option
 * to republish before event start time. (Zero mention of notifications).
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import Button from "../ui/Button.jsx";

export default function EventCancelModal({
  isOpen,
  onClose,
  event,
  isMutating = false,
  onConfirm,
}) {
  const modalId = "event-cancel";
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  if (!isOpen || !event) return null;

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      if (onConfirm) {
        await onConfirm();
      }
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to cancel event. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isSubmitting && !isMutating) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      data-testid="event-cancel-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-xs transition-opacity"
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-warm/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={`${modalId}-title`}
                data-testid="cancel-modal-title"
                className="font-serif text-lg font-bold text-ink"
              >
                Cancel Event
              </h2>
              <p className="text-xs text-ink-muted">Consequential lifecycle update</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isMutating}
            data-testid="cancel-modal-close-btn"
            aria-label="Close modal"
            className="rounded-xl p-1.5 text-stone-400 hover:bg-stone-100 hover:text-ink transition disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div
              data-testid="cancel-error-alert"
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              {error}
            </div>
          )}

          <p className="text-sm text-ink leading-relaxed">
            Are you sure you want to cancel{" "}
            <span className="font-semibold text-stone-900">
              &ldquo;{event.title}&rdquo;
            </span>
            ?
          </p>

          <div className="space-y-2 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-xs text-rose-900 leading-normal">
            <p className="font-semibold text-rose-950">What happens when you cancel:</p>
            <ul className="list-disc pl-4 space-y-1 text-rose-850">
              <li>Registration closes immediately; no new attendees will be able to RSVP.</li>
              <li>A prominent cancellation banner and badge will appear on this event.</li>
              <li>Existing attendee RSVPs remain stored, and students can voluntarily cancel their registration.</li>
              <li>You can republish this event at any time before its scheduled start time.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border-warm/60 px-6 py-4 flex items-center justify-end gap-3 bg-stone-50/50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting || isMutating}
            data-testid="cancel-dismiss-btn"
          >
            Keep Event
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={isSubmitting || isMutating}
            loadingText="Cancelling Event..."
            disabled={isSubmitting || isMutating}
            onClick={handleConfirm}
            data-testid="cancel-confirm-btn"
          >
            Cancel Event
          </Button>
        </div>
      </div>
    </div>
  );
}
