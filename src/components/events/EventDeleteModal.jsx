/**
 * Milestone 22 — Unit 22.4: Event Management UI
 *
 * Destruction modal for permanently deleting an upcoming event. Restricted to
 * active community admins. Highlights orphan RSVP retention and advises leaders
 * to prefer cancellation when appropriate.
 */

import { useEffect, useState } from "react";
import { Trash2, AlertTriangle, X } from "lucide-react";
import Button from "../ui/Button.jsx";

export default function EventDeleteModal({
  isOpen,
  onClose,
  event,
  isMutating = false,
  onConfirm,
}) {
  const modalId = "event-delete";
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
      setError(err?.message || "Failed to delete event. Please try again.");
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
      data-testid="event-delete-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-xs transition-opacity"
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-rose-300 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300 bg-rose-100 text-rose-700">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={`${modalId}-title`}
                data-testid="delete-modal-title"
                className="font-serif text-lg font-bold text-rose-950"
              >
                Permanently Delete Event
              </h2>
              <p className="text-xs text-rose-700 font-medium">Irreversible admin action</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isMutating}
            data-testid="delete-modal-close-btn"
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
              data-testid="delete-error-alert"
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              {error}
            </div>
          )}

          <p className="text-sm text-ink leading-relaxed">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-stone-900">
              &ldquo;{event.title}&rdquo;
            </span>
            ?
          </p>

          <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-950 leading-normal">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" aria-hidden="true" />
              <p className="font-semibold text-rose-900">Warning: This action cannot be undone.</p>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-rose-850">
              <li>The event document will be permanently removed from Firestore.</li>
              <li>
                <strong>Orphan RSVP retention:</strong> Any student who already RSVP'd will retain their record,
                which will appear in their "Attention Required" list until removed.
              </li>
              <li>
                If this event was called off or rescheduled, consider <strong>Cancelling</strong> instead to preserve history and show clear status to students.
              </li>
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
            data-testid="delete-dismiss-btn"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={isSubmitting || isMutating}
            loadingText="Deleting Event..."
            disabled={isSubmitting || isMutating}
            onClick={handleConfirm}
            data-testid="delete-confirm-btn"
          >
            Delete Event Permanently
          </Button>
        </div>
      </div>
    </div>
  );
}
