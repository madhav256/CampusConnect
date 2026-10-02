/**
 * Milestone 19 — Unit 19.5: Community UI & Discovery Foundation
 *
 * Reusable community card component displaying metadata, category badge,
 * campus identity, and engagement statistics.
 */

import { Users, MessageSquare, Globe } from "lucide-react";
import Card from "../ui/Card";
import CommunityCategoryBadge from "./CommunityCategoryBadge";
import { CAMPUSES } from "../../data/campuses";

export default function CommunityCard({ community }) {
  if (!community) return null;

  const memberCount = Number(community?.stats?.memberCount) || 0;
  const postCount = Number(community?.stats?.postCount) || 0;
  const campusName =
    (community?.campusId && CAMPUSES[community.campusId]?.shortName) ||
    community?.campusId ||
    null;

  return (
    <Card
      data-testid={`community-card-${community.id}`}
      className="flex flex-col justify-between transition duration-150 hover:border-stone-300 hover:shadow-sm"
    >
      <div>
        {/* Banner / Header Image or Fallback Header */}
        {community.bannerURL ? (
          <div className="relative mb-4 h-28 w-full overflow-hidden rounded-xl bg-stone-100">
            <img
              src={community.bannerURL}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-terracotta-200/60 bg-terracotta-50 text-terracotta-600 shadow-xs">
              {community.imageURL ? (
                <img
                  src={community.imageURL}
                  alt=""
                  className="h-full w-full rounded-2xl object-cover"
                />
              ) : (
                <Users className="h-6 w-6 text-terracotta-600" aria-hidden="true" />
              )}
            </div>
            {community.visibility && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{community.visibility === "campus_public" ? "Campus Public" : "Private"}</span>
              </span>
            )}
          </div>
        )}

        {/* Community Name & Badges */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {campusName && (
              <span
                data-testid="community-card-campus"
                className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 border border-stone-200"
              >
                {campusName}
              </span>
            )}
            <CommunityCategoryBadge category={community.category} />
          </div>

          <h3 className="truncate font-serif text-lg font-bold tracking-tight text-ink">
            {community.name || "Untitled Community"}
          </h3>
        </div>

        {/* Description Preview */}
        <p className="mt-2.5 line-clamp-3 text-sm text-ink-muted leading-relaxed">
          {community.description || "No description provided for this community."}
        </p>
      </div>

      {/* Engagement Stats Footer */}
      <div className="mt-6 flex items-center justify-between border-t border-border-warm/60 pt-4 text-xs font-medium text-ink-muted">
        <div className="flex items-center gap-1.5" data-testid="community-card-members">
          <Users className="h-4 w-4 text-stone-400" aria-hidden="true" />
          <span>{`${memberCount} ${memberCount === 1 ? "member" : "members"}`}</span>
        </div>

        <div className="flex items-center gap-1.5" data-testid="community-card-posts">
          <MessageSquare className="h-4 w-4 text-stone-400" aria-hidden="true" />
          <span>{`${postCount} ${postCount === 1 ? "post" : "posts"}`}</span>
        </div>
      </div>
    </Card>
  );
}
