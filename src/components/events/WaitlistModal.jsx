/**
 * Milestone 24 — Unit 24.2: WaitlistModal UI Component
 *
 * Modal dialog enabling students to join a full event's waitlist, view their
 * current queue position, review reservation policies, and withdraw if needed.
 */

import { useState } from "react";
import { X, Clock, Users, AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";
import { useEventWaitlist } from "../../hooks/useEventWaitlist.js";
import { useEventCapacity } from "../../hooks/useEventCapacity.js";
import { calculateQueuePosition } from "../../data/eventWaitlistMembers.js";

/**
 * WaitlistModal Component
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {() => void} props.onClose - Modal close handler
 * @param {object} props.event - Target event object
 * @param {object} [props.user] - Current user object
 * @param {object} [props.coordinator] - Direct coordinator override
 * @param {boolean} [props.isOnWaitlist] - Direct waitlist presence override
 * @param {number} [props.queuePosition] - Direct queue position override
 * @param {object} [props.slot] - Direct slot override
 * @param {() => Promise<void>} [props.onJoin] - Direct Join handler override
 * @param {() => Promise<void>} [props.onLeave] - Direct Leave handler override
 * @param {string} [props.className=""] - Additional class names
 * @returns {React.ReactElement|null}
 */
export default function WaitlistModal({
  isOpen = false,
  onClose,
  event,
  user = null,
  coordinator: propCoordinator = null,
  isOnWaitlist: propIsOnWaitlist = undefined,
  queuePosition: propQueuePosition = undefined,
  slot: propSlot = null,
  onJoin = null,
  onLeave = null,
  className = "",
}) {
  const eventId = event?.id || null;
  const userId = user?.uid || user?.id || null;
  const campusId = user?.campusId || event?.campusId || null;

  const shouldHook =
    propIsOnWaitlist === undefined &&
    propSlot === null &&
    Boolean(eventId && userId);

  const waitlistHook = useEventWaitlist(
    shouldHook ? eventId : null,
    shouldHook ? userId : null
  );

  const { coordinator: hookedCoordinator } = useEventCapacity(
    !propCoordinator && eventId ? eventId : null
  );

  const activeCoordinator = propCoordinator || hookedCoordinator;

  const activeIsOnWaitlist =
    propIsOnWaitlist !== undefined
      ? propIsOnWaitlist
      : shouldHook
      ? waitlistHook.isOnWaitlist
      : false;

  const activeSlot = propSlot || (shouldHook ? waitlistHook.slot : null);

  const activeQueuePosition =
    propQueuePosition !== undefined
      ? propQueuePosition
      : shouldHook
      ? waitlistHook.queuePosition
      : activeSlot && activeCoordinator
      ? calculateQueuePosition(activeSlot.sequenceNumber, activeCoordinator.headSequence)
      : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  if (!isOpen) return null;

  // Estimated position if joining now
  const estimatedJoinPosition =
    activeCoordinator?.headSequence && activeCoordinator?.nextSequence
      ? activeCoordinator.nextSequence - activeCoordinator.headSequence + 1
      : 1;

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onJoin) {
        await onJoin();
      } else if (shouldHook && waitlistHook.join) {
        await waitlistHook.join(campusId);
      }
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to join waitlist. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onLeave) {
        await onLeave();
      } else if (shouldHook && waitlistHook.leave) {
        await waitlistHook.leave();
      }
      setShowLeaveConfirm(false);
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to leave waitlist. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="waitlist-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-modal-title"
    >
      <div
        className={`relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2
              id="waitlist-modal-title"
              data-testid="waitlist-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              {activeIsOnWaitlist ? "Your Waitlist Status" : "Join Event Waitlist"}
            </h2>
          </div>

          <button
            type="button"
            data-testid="waitlist-modal-close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {event?.title && (
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Target Event
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {event.title}
              </div>
            </div>
          )}

          {activeIsOnWaitlist ? (
            /* User is already on waitlist */
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-900">
                      You are on the waitlist!
                    </h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Your position is reserved in strict FIFO order.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-around border-t border-emerald-200/60 pt-3">
                  <div className="text-center">
                    <span className="block text-xs font-medium text-emerald-700">
                      Queue Position
                    </span>
                    <span
                      data-testid="waitlist-queue-position"
                      className="block text-xl font-bold text-emerald-950 font-mono mt-0.5"
                    >
                      #{activeQueuePosition || 1}
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="block text-xs font-medium text-emerald-700">
                      Status
                    </span>
                    <span
                      data-testid="waitlist-member-status"
                      className="block text-sm font-semibold text-emerald-900 capitalize mt-0.5"
                    >
                      {activeSlot?.status || "Waiting"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/70 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <span>Fair Allocation Guarantee</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When an attendee cancels or capacity expands, seats are offered strictly in queue order.
                  You will have 24 hours to claim your seat once notified.
                </p>
              </div>

              {showLeaveConfirm ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-900">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
                    <span>Are you sure you want to leave the waitlist?</span>
                  </div>
                  <p className="text-xs text-red-700">
                    You will forfeit your current spot in line (#{activeQueuePosition || 1}).
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="confirm-leave-waitlist-button"
                      disabled={loading}
                      onClick={handleLeave}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {loading ? "Leaving..." : "Yes, Leave Waitlist"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setShowLeaveConfirm(false)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="leave-waitlist-button"
                  disabled={loading}
                  onClick={() => setShowLeaveConfirm(true)}
                  className="w-full py-2.5 px-4 text-sm font-medium rounded-xl text-red-600 bg-red-50 hover:bg-red-100 transition border border-red-200/60"
                >
                  Leave Waitlist
                </button>
              )}
            </div>
          ) : (
            /* User is not on waitlist */
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-amber-50/80 p-4 border border-amber-200/70">
                <Users className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-sm">
                  <div className="font-semibold text-amber-950">
                    This event is currently full
                  </div>
                  <div className="text-xs text-amber-800 mt-1">
                    Joining the waitlist reserves your place in line. If a confirmed student cancels or capacity is increased, seats are offered in strict FIFO order.
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Estimated spot if you join:</span>
                <span
                  data-testid="estimated-queue-position"
                  className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200"
                >
                  #{estimatedJoinPosition}
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>24-hour claim window applies upon seat offer</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>Zero queue jumping; strictly automated promotions</span>
                </div>
              </div>

              <button
                type="button"
                data-testid="join-waitlist-button"
                disabled={loading}
                onClick={handleJoin}
                className="w-full py-3 px-4 text-sm font-semibold rounded-xl text-white bg-amber-600 hover:bg-amber-700 transition shadow-sm disabled:opacity-50"
              >
                {loading ? "Joining..." : "Join Waitlist"}
              </button>
            </div>
          )}

          {error && (
            <div
              data-testid="waitlist-modal-error"
              className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
