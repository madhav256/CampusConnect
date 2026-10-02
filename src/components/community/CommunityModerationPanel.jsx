/**
 * Milestone 19 — Unit 19.8: Community Moderation & Management
 *
 * Compact role-aware moderation interface for community moderators and admins.
 * Backed by authoritative Firestore security rules on communityMembers.
 */

import { useState } from "react";
import {
  Shield,
  ShieldAlert,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import {
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../constants.js";

export default function CommunityModerationPanel({
  community,
  members = [],
  isModerator = false,
  isAdmin = false,
  onUpdateRole,
  onUpdateStatus,
}) {
  const [actionInProgress, setActionInProgress] = useState(null); // userId being updated
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Authority Gate: Only active moderators and admins can view or interact
  if (!isModerator) {
    return null;
  }

  const handleRoleChange = async (targetUserId, newRole) => {
    if (!onUpdateRole) return;
    setError(null);
    setSuccessMessage(null);
    setActionInProgress(targetUserId);

    try {
      await onUpdateRole(targetUserId, newRole);
      setSuccessMessage(
        `Successfully updated role to ${newRole} for user ${targetUserId}.`
      );
    } catch (err) {
      console.error("Moderation role update failed:", err);
      setError(err?.message || "Failed to update member role.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStatusChange = async (targetUserId, newStatus) => {
    if (!onUpdateStatus) return;
    setError(null);
    setSuccessMessage(null);
    setActionInProgress(targetUserId);

    try {
      await onUpdateStatus(targetUserId, newStatus);
      setSuccessMessage(
        `Successfully updated status to ${newStatus} for user ${targetUserId}.`
      );
    } catch (err) {
      console.error("Moderation status update failed:", err);
      setError(err?.message || "Failed to update member status.");
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <Card
      data-testid="community-moderation-panel"
      className="mb-8 border border-amber-200 bg-amber-50/30 p-5 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            {isAdmin ? (
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Shield className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold tracking-tight text-ink">
              Community Moderation
            </h2>
            <p className="text-xs text-ink-muted">
              {isAdmin ? "Admin Controls" : "Moderator Controls"} for{" "}
              {community?.name || "this community"}
            </p>
          </div>
        </div>

        <span
          data-testid="moderation-role-badge"
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
            isAdmin
              ? "bg-terracotta-100 text-terracotta-800"
              : "bg-blue-100 text-blue-800"
          }`}
        >
          {isAdmin ? "Admin" : "Moderator"}
        </span>
      </div>

      {/* Feedback alerts */}
      {error && (
        <div
          data-testid="moderation-error"
          className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div
          data-testid="moderation-success"
          className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Member Management Table */}
      <div className="mt-4 overflow-x-auto">
        {members.length === 0 ? (
          <p
            data-testid="moderation-empty"
            className="py-6 text-center text-xs text-ink-muted"
          >
            No members in this community.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-warm/60 text-stone-500">
                <th className="pb-2 font-medium">Member</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-warm/40">
              {members.map((m) => {
                const isTargetAdmin = m.role === COMMUNITY_MEMBER_ROLES.ADMIN;
                const isTargetMod =
                  m.role === COMMUNITY_MEMBER_ROLES.MODERATOR;
                const isTargetMember =
                  m.role === COMMUNITY_MEMBER_ROLES.MEMBER ||
                  (!isTargetAdmin && !isTargetMod);
                const isActive =
                  m.status === COMMUNITY_MEMBER_STATUSES.ACTIVE;
                const isRemoved =
                  m.status === COMMUNITY_MEMBER_STATUSES.REMOVED;
                const isPending = actionInProgress === m.userId;

                return (
                  <tr
                    key={m.id || m.userId}
                    data-testid={`moderation-member-row-${m.userId}`}
                    className="hover:bg-amber-100/30"
                  >
                    {/* Member ID / Display */}
                    <td className="py-2.5 font-medium text-ink">
                      <span className="font-mono text-xs">{m.userId}</span>
                    </td>

                    {/* Role Badge */}
                    <td className="py-2.5">
                      <span
                        data-testid={`member-role-badge-${m.userId}`}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${
                          isTargetAdmin
                            ? "bg-terracotta-100 text-terracotta-800"
                            : isTargetMod
                            ? "bg-amber-100 text-amber-800"
                            : "bg-stone-100 text-stone-700"
                        }`}
                      >
                        {m.role || "member"}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="py-2.5">
                      <span
                        data-testid={`member-status-badge-${m.userId}`}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${
                          isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : isRemoved
                            ? "bg-rose-100 text-rose-800"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {m.status || "active"}
                      </span>
                    </td>

                    {/* Actions Column */}
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Admin Role Actions */}
                        {isAdmin && isTargetMember && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            data-testid={`promote-moderator-${m.userId}`}
                            onClick={() =>
                              handleRoleChange(
                                m.userId,
                                COMMUNITY_MEMBER_ROLES.MODERATOR
                              )
                            }
                            className="h-7 px-2 text-[11px] border-amber-300 bg-white hover:bg-amber-50"
                            title="Promote to Moderator"
                          >
                            Promote to Mod
                          </Button>
                        )}

                        {isAdmin && isTargetMod && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            data-testid={`demote-member-${m.userId}`}
                            onClick={() =>
                              handleRoleChange(
                                m.userId,
                                COMMUNITY_MEMBER_ROLES.MEMBER
                              )
                            }
                            className="h-7 px-2 text-[11px] border-stone-300 bg-white hover:bg-stone-50"
                            title="Demote to Member"
                          >
                            Demote to Member
                          </Button>
                        )}

                        {/* Status Actions: Allowed for Admin, or Moderator on regular members */}
                        {(isAdmin || (!isAdmin && isModerator && isTargetMember)) &&
                          !isTargetAdmin && (
                            <>
                              {isActive ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  data-testid={`remove-member-${m.userId}`}
                                  onClick={() =>
                                    handleStatusChange(
                                      m.userId,
                                      COMMUNITY_MEMBER_STATUSES.REMOVED
                                    )
                                  }
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                  title="Remove Member"
                                >
                                  <UserX className="h-3 w-3" aria-hidden="true" />
                                  <span>Remove</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  data-testid={`restore-member-${m.userId}`}
                                  onClick={() =>
                                    handleStatusChange(
                                      m.userId,
                                      COMMUNITY_MEMBER_STATUSES.ACTIVE
                                    )
                                  }
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                                  title="Restore Member"
                                >
                                  <UserCheck className="h-3 w-3" aria-hidden="true" />
                                  <span>Restore</span>
                                </button>
                              )}
                            </>
                          )}

                        {/* Protected indicator for admin or moderator targeting admin */}
                        {!isAdmin && isModerator && !isTargetMember && (
                          <span className="text-[11px] font-medium text-stone-400">
                            Protected
                          </span>
                        )}

                        {isAdmin && isTargetAdmin && (
                          <span className="text-[11px] font-medium text-stone-400">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
