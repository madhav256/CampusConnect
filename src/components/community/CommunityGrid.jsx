/**
 * Milestone 19 — Unit 19.5: Community UI & Discovery Foundation
 *
 * Responsive grid component for rendering community cards with built-in
 * loading skeletons and empty states.
 */

import { Users, AlertCircle } from "lucide-react";
import CommunityCard from "./CommunityCard";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";

export default function CommunityGrid({
  communities = [],
  isLoading = false,
  error = null,
  emptyTitle = "No communities found",
  emptyDescription = "There are no communities matching your criteria at this campus.",
  onRetry = null,
}) {
  if (error) {
    return (
      <Card className="text-center" data-testid="community-grid-error">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-ink">Unable to Load Communities</h3>
        <p className="mt-1 text-sm text-ink-muted">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
          >
            Try Again
          </button>
        )}
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div
        data-testid="community-grid-loading"
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            data-testid="community-skeleton-card"
            className="animate-pulse rounded-2xl border border-border-warm bg-surface p-6 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-2xl bg-stone-200" />
              <div className="h-4 w-20 rounded bg-stone-200" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <div className="h-5 w-24 rounded bg-stone-200" />
                <div className="h-5 w-16 rounded bg-stone-200" />
              </div>
              <div className="h-6 w-3/4 rounded bg-stone-200" />
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="h-3 w-full rounded bg-stone-200" />
              <div className="h-3 w-5/6 rounded bg-stone-200" />
            </div>
            <div className="mt-6 flex justify-between border-t border-border-warm/60 pt-4">
              <div className="h-4 w-20 rounded bg-stone-200" />
              <div className="h-4 w-16 rounded bg-stone-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (communities.length === 0) {
    return (
      <EmptyState
        data-testid="community-grid-empty"
        icon={Users}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div
      data-testid="community-grid"
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {communities.map((community) => (
        <CommunityCard
          key={community.id}
          data-testid={`community-card-${community.id}`}
          community={community}
        />
      ))}
    </div>
  );
}
