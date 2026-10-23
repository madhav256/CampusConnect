/**
 * Milestone 24 — Unit 24.2: CapacityIndicator UI Component
 *
 * Visual indicator displaying live capacity occupancy, vacancy counts,
 * capacity progress bar, and waitlist badge.
 */

import { Users, Clock, AlertTriangle } from "lucide-react";
import { computeCapacityMetrics, isCappedEvent } from "../../data/eventCapacities.js";
import { useEventCapacity } from "../../hooks/useEventCapacity.js";

/**
 * CapacityIndicator Component
 *
 * @param {object} props
 * @param {object} [props.event] - Event object
 * @param {string} [props.eventId] - Event ID to hook into coordinator if coordinator not passed
 * @param {object} [props.coordinator] - Direct coordinator object override
 * @param {object} [props.metrics] - Direct metrics override
 * @param {boolean} [props.showProgress=true] - Whether to render progress bar
 * @param {string} [props.size="md"] - Size: "sm" | "md" | "lg"
 * @param {string} [props.className=""] - Additional class names
 * @returns {React.ReactElement}
 */
export default function CapacityIndicator({
  event = null,
  eventId = null,
  coordinator: propCoordinator = null,
  metrics: propMetrics = null,
  showProgress = true,
  size = "md",
  className = "",
}) {
  const targetEventId = event?.id || eventId;
  const shouldHook = !propCoordinator && !propMetrics && Boolean(targetEventId);

  const { coordinator: hookedCoordinator } = useEventCapacity(
    shouldHook ? targetEventId : null
  );

  const activeCoordinator = propCoordinator || (shouldHook ? hookedCoordinator : null);

  const metrics =
    propMetrics ||
    computeCapacityMetrics({
      event,
      coordinator: activeCoordinator,
    });

  // Size styling
  const sizeStyles = {
    sm: {
      text: "text-xs",
      icon: "w-3.5 h-3.5",
      bar: "h-1.5",
      badge: "px-1.5 py-0.5 text-xs",
    },
    md: {
      text: "text-sm",
      icon: "w-4 h-4",
      bar: "h-2",
      badge: "px-2 py-0.5 text-xs",
    },
    lg: {
      text: "text-base",
      icon: "w-5 h-5",
      bar: "h-2.5",
      badge: "px-2.5 py-1 text-sm",
    },
  }[size] || {
    text: "text-sm",
    icon: "w-4 h-4",
    bar: "h-2",
    badge: "px-2 py-0.5 text-xs",
  };

  // If event is not capped (uncapped open event)
  if (!isCappedEvent(event) && !metrics.isCapped) {
    return (
      <div
        data-testid="capacity-indicator"
        className={`inline-flex items-center gap-1.5 text-slate-500 font-medium ${sizeStyles.text} ${className}`}
      >
        <Users className={sizeStyles.icon} aria-hidden="true" />
        <span data-testid="capacity-uncapped-text">Open Event (Uncapped)</span>
      </div>
    );
  }

  const {
    capacity,
    offeredCount,
    waitlistCount,
    allocatedSeats,
    availableSeats,
    isFull,
  } = metrics;

  const percent = Math.min(100, Math.round((allocatedSeats / (capacity || 1)) * 100));

  let barColor = "bg-emerald-500";
  if (percent >= 100) {
    barColor = "bg-red-500";
  } else if (percent >= 80) {
    barColor = "bg-amber-500";
  }

  return (
    <div
      data-testid="capacity-indicator"
      className={`flex flex-col gap-1.5 ${className}`}
      aria-label={`Capacity: ${allocatedSeats} of ${capacity} seats allocated`}
    >
      <div className={`flex items-center justify-between gap-2 font-medium ${sizeStyles.text}`}>
        <div className="flex items-center gap-1.5 text-slate-700">
          <Users className={`${sizeStyles.icon} text-slate-500`} aria-hidden="true" />
          <span data-testid="capacity-count-text">
            {allocatedSeats} / {capacity} seats filled
          </span>
          {offeredCount > 0 && (
            <span
              data-testid="capacity-offered-count"
              className="text-amber-600 text-xs font-normal"
            >
              ({offeredCount} reserved)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {waitlistCount > 0 ? (
            <span
              data-testid="capacity-waitlist-badge"
              className={`inline-flex items-center gap-1 font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 ${sizeStyles.badge}`}
            >
              <Clock className="w-3 h-3 text-amber-600" aria-hidden="true" />
              <span>{waitlistCount} on waitlist</span>
            </span>
          ) : isFull ? (
            <span
              data-testid="capacity-full-badge"
              className={`inline-flex items-center gap-1 font-semibold rounded-full bg-red-50 text-red-700 border border-red-200/60 ${sizeStyles.badge}`}
            >
              <AlertTriangle className="w-3 h-3 text-red-600" aria-hidden="true" />
              <span>Full</span>
            </span>
          ) : (
            <span
              data-testid="capacity-available-badge"
              className={`inline-flex items-center font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 ${sizeStyles.badge}`}
            >
              <span>{availableSeats} left</span>
            </span>
          )}
        </div>
      </div>

      {showProgress && (
        <div
          data-testid="capacity-progress-track"
          className={`w-full bg-slate-100 rounded-full overflow-hidden ${sizeStyles.bar}`}
          role="progressbar"
          aria-valuenow={allocatedSeats}
          aria-valuemin={0}
          aria-valuemax={capacity}
        >
          <div
            data-testid="capacity-progress-bar"
            className={`${barColor} h-full transition-all duration-300 rounded-full`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
