/**
 * Milestone 19 — Unit 19.6: Community Detail & Profile Experience
 *
 * Header/Hero component for community detail experience.
 * Displays banner, community identity, category, campus, stats, and membership actions.
 */

import { Users, MessageSquare, ShieldCheck, CheckCircle2 } from "lucide-react";
import Button from "../ui/Button";
import CommunityCategoryBadge from "./CommunityCategoryBadge";
import { CAMPUSES } from "../../data/campuses";

export default function CommunityHero({
  community,
  isMember = false,
  isAdmin = false,
  onJoin,
  onLeave,
  isActionLoading = false,
  actionError = null,
}) {
  if (!community) return null;

  const memberCount = Number(community?.stats?.memberCount) || 0;
  const postCount = Number(community?.stats?.postCount) || 0;
  const campusName =
    (community?.campusId && CAMPUSES[community.campusId]?.shortName) ||
    community?.campusId ||
    null;

  return (
    <div
      data-testid="community-hero"
      className="overflow-hidden rounded-3xl border border-border-warm bg-surface shadow-sm"
    >
      {/* Banner / Visual Header */}
      <div className="relative h-44 sm:h-56 md:h-64 w-full overflow-hidden bg-stone-900">
        {community.bannerURL ? (
          <img
            src={community.bannerURL}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-stone-800 via-stone-900 to-terracotta-900/80 flex items-center justify-center">
            <Users className="h-20 w-20 text-stone-700/60" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Profile Bar with Avatar Overlap & Actions */}
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 sm:-mt-16">
          {/* Avatar / Icon */}
          <div className="flex h-24 w-24 sm:h-28 sm:w-28 shrink-0 items-center justify-center rounded-3xl border-4 border-surface bg-terracotta-50 text-terracotta-600 shadow-md">
            {community.imageURL ? (
              <img
                src={community.imageURL}
                alt=""
                className="h-full w-full rounded-2xl object-cover"
              />
            ) : (
              <Users className="h-12 w-12 text-terracotta-600" aria-hidden="true" />
            )}
          </div>

          {/* Action Button & Status Pill */}
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <span
                data-testid="community-admin-badge"
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 border border-purple-200"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Admin</span>
              </span>
            )}

            {isMember && (
              <span
                data-testid="community-member-badge"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Joined</span>
              </span>
            )}

            {isMember ? (
              <Button
                variant="outline"
                size="md"
                data-testid="leave-community-button"
                onClick={onLeave}
                loading={isActionLoading}
                loadingText="Leaving..."
                className="text-stone-700 hover:text-rose-600 hover:border-rose-300"
              >
                Leave Community
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                data-testid="join-community-button"
                onClick={onJoin}
                loading={isActionLoading}
                loadingText="Joining..."
              >
                Join Community
              </Button>
            )}
          </div>
        </div>

        {/* Action Error if any */}
        {actionError && (
          <div
            data-testid="community-action-error"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700"
          >
            {actionError}
          </div>
        )}

        {/* Community Name & Badges */}
        <div className="mt-5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {campusName && (
              <span
                data-testid="community-hero-campus"
                className="inline-flex items-center rounded-md bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 border border-stone-200"
              >
                {campusName}
              </span>
            )}
            <CommunityCategoryBadge category={community.category} />
            {community.visibility && (
              <span className="inline-flex items-center rounded-md bg-stone-50 px-2 py-0.5 text-xs text-stone-500 border border-stone-200/60">
                {community.visibility === "campus_public" ? "Campus Public" : "Private"}
              </span>
            )}
          </div>

          <h1
            data-testid="community-hero-name"
            className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ink"
          >
            {community.name || "Untitled Community"}
          </h1>

          <p
            data-testid="community-hero-description"
            className="mt-3 max-w-3xl text-sm sm:text-base text-ink-muted leading-relaxed"
          >
            {community.description || "No description provided."}
          </p>
        </div>

        {/* Community Statistics Bar */}
        <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-border-warm/60 pt-5 text-sm font-medium text-ink-muted">
          <div
            data-testid="community-hero-members"
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4 text-stone-400" aria-hidden="true" />
            <span className="text-ink font-semibold">{memberCount}</span>
            <span>{memberCount === 1 ? "member" : "members"}</span>
          </div>

          <div
            data-testid="community-hero-posts"
            className="flex items-center gap-2"
          >
            <MessageSquare className="h-4 w-4 text-stone-400" aria-hidden="true" />
            <span className="text-ink font-semibold">{postCount}</span>
            <span>{postCount === 1 ? "post" : "posts"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
