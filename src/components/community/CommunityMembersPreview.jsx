/**
 * Milestone 19 — Unit 19.6: Community Detail & Profile Experience
 *
 * Compact preview component for community members.
 * Handles zero members, single member, and multiple members gracefully.
 */

import { Users, Shield } from "lucide-react";
import Avatar from "../ui/Avatar";
import Card from "../ui/Card";

export default function CommunityMembersPreview({ members = [], maxPreview = 6 }) {
  const memberList = Array.isArray(members) ? members : [];
  const previewList = memberList.slice(0, maxPreview);
  const remainingCount = memberList.length - previewList.length;

  return (
    <Card data-testid="community-members-preview" className="space-y-4">
      <div className="flex items-center justify-between border-b border-border-warm/60 pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-terracotta-600" aria-hidden="true" />
          <h2 className="font-serif text-base font-bold text-ink">Members</h2>
        </div>
        <span
          data-testid="community-members-count-badge"
          className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600"
        >
          {memberList.length}
        </span>
      </div>

      {memberList.length === 0 ? (
        <div
          data-testid="community-members-empty"
          className="py-6 text-center text-sm text-ink-muted"
        >
          No members yet. Be the first to join!
        </div>
      ) : (
        <div className="space-y-2.5">
          <ul data-testid="community-members-list" className="space-y-2">
            {previewList.map((member) => {
              const displayName =
                member.displayName || member.name || member.userId || "Student";
              const isAdmin = member.role === "admin";

              return (
                <li
                  key={member.id || member.userId}
                  data-testid={`member-row-${member.userId || member.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl p-2 hover:bg-stone-50 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      name={displayName}
                      photoURL={member.photoURL}
                      size="sm"
                    />
                    <span className="truncate text-sm font-medium text-ink">
                      {displayName}
                    </span>
                  </div>

                  {isAdmin && (
                    <span
                      data-testid={`member-admin-pill-${member.userId || member.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200"
                    >
                      <Shield className="h-3 w-3" aria-hidden="true" />
                      <span>Admin</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {remainingCount > 0 && (
            <div
              data-testid="community-members-more-count"
              className="border-t border-border-warm/60 pt-3 text-center text-xs font-medium text-ink-muted"
            >
              + {remainingCount} more {remainingCount === 1 ? "member" : "members"}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
