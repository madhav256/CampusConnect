/**
 * Milestone 19 — Unit 19.6: Community Detail & Profile Experience
 *
 * Dedicated community profile page providing full identity, metadata,
 * statistics, membership actions, and member preview.
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertCircle, Sparkles, Building2 } from "lucide-react";
import { useCommunity } from "../hooks/useCommunity";
import { useCommunityMembers } from "../hooks/useCommunityMembers";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import CommunityHero from "../components/community/CommunityHero";
import CommunityCategoryBadge from "../components/community/CommunityCategoryBadge";
import CommunityMembersPreview from "../components/community/CommunityMembersPreview";
import { CAMPUSES } from "../data/campuses";

export default function CommunityDetail() {
  const { communityId } = useParams();
  const {
    community,
    isLoading: isCommunityLoading,
    error: communityError,
    refetch: refetchCommunity,
  } = useCommunity(communityId);

  const {
    members,
    isMember,
    isAdmin,
    join,
    leave,
  } = useCommunityMembers(communityId);

  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  const handleJoin = async () => {
    if (!community?.campusId) return;
    try {
      setIsActionLoading(true);
      setActionError(null);
      await join(community.campusId);
    } catch (err) {
      setActionError(err?.message || "Failed to join community.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeave = async () => {
    try {
      setIsActionLoading(true);
      setActionError(null);
      await leave();
    } catch (err) {
      setActionError(err?.message || "Failed to leave community.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const campusName =
    (community?.campusId && CAMPUSES[community.campusId]?.name) ||
    (community?.campusId && CAMPUSES[community.campusId]?.shortName) ||
    community?.campusId ||
    "Campus";

  // Loading State
  if (isCommunityLoading) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div data-testid="community-detail-loading" className="space-y-6">
            <div className="h-6 w-36 animate-pulse rounded-md bg-stone-200" />
            <div className="h-72 w-full animate-pulse rounded-3xl bg-stone-200/80" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="h-56 animate-pulse rounded-2xl bg-stone-200/70 lg:col-span-2" />
              <div className="h-56 animate-pulse rounded-2xl bg-stone-200/70" />
            </div>
          </div>
        </PageContainer>
      </div>
    );
  }

  // Error State
  if (communityError) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div data-testid="community-detail-error" className="py-12">
            <Card className="mx-auto max-w-lg text-center space-y-4 py-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="font-serif text-xl font-bold text-ink">Unable to Load Community</h2>
              <p className="text-sm text-ink-muted">{communityError}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => refetchCommunity()}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>Retry</span>
                </Button>
                <Link
                  to="/communities"
                  className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700"
                >
                  Back to Communities
                </Link>
              </div>
            </Card>
          </div>
        </PageContainer>
      </div>
    );
  }

  // Not Found State
  if (!community) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div data-testid="community-detail-not-found" className="py-12">
            <EmptyState
              title="Community Not Found"
              description="The community you are looking for does not exist or may have been removed."
              action={
                <Link
                  to="/communities"
                  data-testid="not-found-back-link"
                  className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700"
                >
                  Back to Communities
                </Link>
              }
            />
          </div>
        </PageContainer>
      </div>
    );
  }

  // Loaded State
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />
      <PageContainer>
        <div className="space-y-6">
          {/* Back Navigation */}
          <div>
            <Link
              to="/communities"
              data-testid="back-to-communities"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-700 hover:text-terracotta-800 transition"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Communities</span>
            </Link>
          </div>

          {/* Hero Section */}
          <CommunityHero
            community={community}
            isMember={isMember}
            isAdmin={isAdmin}
            onJoin={handleJoin}
            onLeave={handleLeave}
            isActionLoading={isActionLoading}
            actionError={actionError}
          />

          {/* Information & Content Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* About / Main Column */}
            <div className="space-y-6 lg:col-span-2">
              <Card data-testid="community-about-card" className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border-warm/60 pb-3">
                  <Sparkles className="h-4 w-4 text-terracotta-600" aria-hidden="true" />
                  <h2 className="font-serif text-lg font-bold text-ink">About this Community</h2>
                </div>

                <p
                  data-testid="community-detail-description"
                  className="text-sm sm:text-base leading-relaxed text-ink-muted"
                >
                  {community.description || "No full description provided for this community."}
                </p>

                <div className="border-t border-border-warm/60 pt-4 flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-ink">Category:</span>
                    <CommunityCategoryBadge category={community.category} />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
                    <span className="font-medium text-ink">Campus:</span>
                    <span data-testid="community-detail-campus" className="text-stone-600 font-medium">
                      {campusName}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Sidebar Column */}
            <div className="space-y-6 lg:col-span-1">
              {/* Statistics Card */}
              <Card data-testid="community-stats-card" className="space-y-3">
                <h2 className="font-serif text-base font-bold text-ink border-b border-border-warm/60 pb-2">
                  Community Stats
                </h2>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-xl bg-stone-50 p-3 border border-border-warm/60">
                    <div
                      data-testid="community-stat-members"
                      className="font-serif text-2xl font-bold text-ink"
                    >
                      {Number(community?.stats?.memberCount) || 0}
                    </div>
                    <div className="text-xs font-medium text-ink-muted">Members</div>
                  </div>

                  <div className="rounded-xl bg-stone-50 p-3 border border-border-warm/60">
                    <div
                      data-testid="community-stat-posts"
                      className="font-serif text-2xl font-bold text-ink"
                    >
                      {Number(community?.stats?.postCount) || 0}
                    </div>
                    <div className="text-xs font-medium text-ink-muted">Posts</div>
                  </div>
                </div>
              </Card>

              {/* Members Preview Card */}
              <CommunityMembersPreview members={members} />
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
