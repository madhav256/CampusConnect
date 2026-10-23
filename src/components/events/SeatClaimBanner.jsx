/**
 * Milestone 24 — Unit 24.2: SeatClaimBanner UI Component
 *
 * Reactive claim banner rendered at the top of the event view when a student
 * receives an offered seat from the waitlist. Features live countdown timer,
 * primary Claim action, and secondary Decline action.
 */

import { useState } from "react";
import { Sparkles, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useEventWaitlist } from "../../hooks/useEventWaitlist.js";
import { isOfferActive, getOfferRemainingMs } from "../../data/eventWaitlistSlots.js";

/**
 * Formats milliseconds into HH:MM:SS format.
 *
 * @param {number} ms
 * @returns {string} Formatted string
 */
function formatTimeRemaining(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * SeatClaimBanner Component
 *
 * @param {object} props
 * @param {string} [props.eventId] - Target event ID
 * @param {string} [props.userId] - Target user ID
 * @param {object} [props.slot] - Direct slot document override
 * @param {boolean} [props.isOffered] - Direct offered state override
 * @param {number} [props.timeRemainingMs] - Direct time remaining override
 * @param {() => Promise<void>} [props.onClaim] - Direct Claim handler override
 * @param {() => Promise<void>} [props.onDecline] - Direct Decline handler override
 * @param {string} [props.className=""] - Additional class names
 * @returns {React.ReactElement|null}
 */
export default function SeatClaimBanner({
  eventId = null,
  userId = null,
  slot: propSlot = null,
  isOffered: propIsOffered = undefined,
  timeRemainingMs: propTimeRemainingMs = undefined,
  onClaim = null,
  onDecline = null,
  className = "",
}) {
  const shouldHook =
    propIsOffered === undefined &&
    propSlot === null &&
    Boolean(eventId && userId);

  const hookResult = useEventWaitlist(
    shouldHook ? eventId : null,
    shouldHook ? userId : null
  );

  const activeSlot = propSlot || (shouldHook ? hookResult.slot : null);
  const activeIsOffered =
    propIsOffered !== undefined
      ? propIsOffered
      : shouldHook
      ? hookResult.isOffered
      : Boolean(activeSlot && isOfferActive(activeSlot));

  const activeTimeRemaining =
    propTimeRemainingMs !== undefined
      ? propTimeRemainingMs
      : shouldHook
      ? hookResult.timeRemainingMs
      : activeSlot
      ? getOfferRemainingMs(activeSlot)
      : 0;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);

  // If there is no active offer, do not render banner
  if (!activeIsOffered || activeTimeRemaining <= 0) {
    return null;
  }

  const handleClaim = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onClaim) {
        await onClaim();
      } else if (shouldHook && hookResult.claim) {
        await hookResult.claim();
      }
    } catch (err) {
      setError(err?.message || "Failed to claim seat. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onDecline) {
        await onDecline();
      } else if (shouldHook && hookResult.decline) {
        await hookResult.decline();
      }
      setShowDeclineConfirm(false);
    } catch (err) {
      setError(err?.message || "Failed to decline seat. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="seat-claim-banner"
      className={`relative overflow-hidden rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 via-amber-100/70 to-emerald-50 p-4 shadow-sm ${className}`}
      role="region"
      aria-label="Seat reservation offer notification"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                A seat opened up for you!
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                <span>Reserved</span>
              </span>
            </div>

            <p className="mt-0.5 text-sm text-slate-600">
              You are next in line. Claim your seat before the 24-hour reservation window expires.
            </p>

            <div className="mt-2 flex items-center gap-2 font-mono text-sm font-semibold text-amber-900">
              <Clock className="h-4 w-4 text-amber-700" aria-hidden="true" />
              <span>Time Remaining:</span>
              <span
                data-testid="seat-claim-countdown"
                className="rounded bg-amber-200/80 px-2 py-0.5 text-amber-950 font-bold"
              >
                {formatTimeRemaining(activeTimeRemaining)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto self-end sm:self-center">
          {showDeclineConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-medium">Decline seat?</span>
              <button
                type="button"
                data-testid="confirm-decline-button"
                disabled={loading}
                onClick={handleDecline}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {loading ? "Declining..." : "Yes, Decline"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowDeclineConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                data-testid="decline-seat-button"
                disabled={loading}
                onClick={() => setShowDeclineConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-slate-700 bg-white/80 border border-slate-300 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
              >
                <XCircle className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <span>Decline</span>
              </button>

              <button
                type="button"
                data-testid="claim-seat-button"
                disabled={loading}
                onClick={handleClaim}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-white" aria-hidden="true" />
                <span>{loading ? "Claiming..." : "Claim Seat"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div
          data-testid="seat-claim-error"
          className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700 border border-red-200"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
