/**
 * Milestone 22 — Unit 22.4: Event Management UI
 *
 * Dedicated management toolbar rendered on EventDetail for authorized community leaders.
 * Consumes permissions from useEventManagement and exposes Edit, Cancel, Republish,
 * and Delete actions with persistent concurrency locks and error alerts.
 */

import {
  Pencil,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  X,
} from "lucide-react";
import Button from "../ui/Button.jsx";

export default function EventManagementToolbar({
  event,
  isLeader = false,
  isAdmin = false,
  temporalState = null,
  isOngoing = false,
  canEdit = false,
  canCancel = false,
  canRepublish = false,
  canDelete = false,
  isMutating = false,
  mutationError = null,
  onClearError = () => {},
  onOpenEdit = () => {},
  onOpenCancel = () => {},
  onOpenRepublish = () => {},
  onOpenDelete = () => {},
}) {
  // Safe fail-closed visibility check
  const hasActions = canEdit || canCancel || canRepublish || canDelete;
  if (!event || !event.communityId || !hasActions) {
    return null;
  }

  const roleLabel = isAdmin ? "Community Admin" : isLeader ? "Community Moderator" : "Leader";

  return (
    <div
      data-testid="event-management-toolbar"
      className="rounded-2xl border border-terracotta-200/80 bg-gradient-to-r from-terracotta-50/60 via-surface to-stone-50 p-4 shadow-xs"
    >
      {/* Mutation Error Alert Banner */}
      {mutationError && (
        <div
          data-testid="management-error-alert"
          role="alert"
          className="mb-3.5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs sm:text-sm text-rose-900"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-rose-600 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold text-rose-800">Operation failed</p>
              <p className="mt-0.5 text-rose-700">{mutationError}</p>
            </div>
          </div>
          <button
            type="button"
            data-testid="management-clear-error-btn"
            onClick={onClearError}
            aria-label="Dismiss error"
            className="rounded-lg p-1 text-rose-500 hover:bg-rose-100 transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Toolbar Content */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: Role and State Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {temporalState && (
            <span data-testid="management-temporal-state" className="sr-only">
              {temporalState}
            </span>
          )}
          <div
            data-testid="management-role-badge"
            className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta-300 bg-terracotta-100/70 px-2.5 py-1 text-xs font-semibold text-terracotta-800"
          >
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 text-terracotta-700" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-terracotta-700" aria-hidden="true" />
            )}
            <span>{roleLabel}</span>
          </div>

          {isOngoing && (
            <span
              data-testid="management-ongoing-badge"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              <span>Ongoing · Live</span>
            </span>
          )}

          {isMutating && (
            <span
              data-testid="management-mutating-indicator"
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-terracotta-600" aria-hidden="true" />
              <span>Saving changes...</span>
            </span>
          )}
        </div>

        {/* Right: Management Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={onOpenEdit}
              data-testid="manage-edit-btn"
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Edit Details</span>
            </Button>
          )}

          {canCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={onOpenCancel}
              data-testid="manage-cancel-btn"
              className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-400"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
              <span>Cancel Event</span>
            </Button>
          )}

          {canRepublish && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isMutating}
              onClick={onOpenRepublish}
              data-testid="manage-republish-btn"
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Republish Event</span>
            </Button>
          )}

          {canDelete && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isMutating}
              onClick={onOpenDelete}
              data-testid="manage-delete-btn"
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete Event</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
