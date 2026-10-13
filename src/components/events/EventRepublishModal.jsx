/**
 * Milestone 22 — Unit 22.4: Event Management UI
 *
 * Confirmation dialog for republishing a cancelled upcoming event.
 * Explains restoring the event to discovery surfaces, clearing cancellation banners,
 * and reopening RSVP registration.
 */

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import Button from "../ui/Button.jsx";

export default function EventRepublishModal({
  isOpen,
  onClose,
  event,
  isMutating = false,
  onConfirm,
}) {
  const modalId = "event-republish";
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
      setError(err?.message || "Failed to republish event. Please try again.");
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
      data-testid="event-republish-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-xs transition-opacity"
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-terracotta-200 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-warm/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-terracotta-200 bg-terracotta-50 text-terracotta-600">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={`${modalId}-title`}
                data-testid="republish-modal-title"
                className="font-serif text-lg font-bold text-ink"
              >
                Republish Event
              </h2>
              <p className="text-xs text-ink-muted">Restore active status</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isMutating}
            data-testid="republish-modal-close-btn"
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
              data-testid="republish-error-alert"
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              {error}
            </div>
          )}

          <p className="text-sm text-ink leading-relaxed">
            Are you sure you want to republish{" "}
            <span className="font-semibold text-stone-900">
              &ldquo;{event.title}&rdquo;
            </span>
            ?
          </p>

          <div className="space-y-2 rounded-2xl border border-terracotta-100 bg-terracotta-50/60 p-4 text-xs text-stone-800 leading-normal">
            <p className="font-semibold text-terracotta-900">What happens when you republish:</p>
            <ul className="list-disc pl-4 space-y-1 text-stone-700">
              <li>The event status changes back to Published.</li>
              <li>The cancellation alert banner will be removed.</li>
              <li>RSVP registration will reopen for eligible students.</li>
              <li>The event will reappear in standard campus and community discovery feeds.</li>
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
            data-testid="republish-dismiss-btn"
          >
            Dismiss
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={isSubmitting || isMutating}
            loadingText="Republishing..."
            disabled={isSubmitting || isMutating}
            onClick={handleConfirm}
            data-testid="republish-confirm-btn"
          >
            Republish Event
          </Button>
        </div>
      </div>
    </div>
  );
}
