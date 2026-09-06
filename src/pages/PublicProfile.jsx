import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchUserById } from "../services/userService";
import { useAuth } from "../hooks/useAuth";
import { useConnectionState } from "../hooks/useConnectionState";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import Section from "../components/layout/Section";
import Avatar from "../components/ui/Avatar";
import Card from "../components/ui/Card";


function getVisibleLinks(socialLinks = {}) {
  return Object.entries(socialLinks).filter(([, value]) => Boolean(value));
}

export default function PublicProfile() {
  const { uid } = useParams();
  const { user: authUser } = useAuth();
  const [profileState, setProfileState] = useState({
    loadedUid: null,
    profile: null,
    error: null,
  });

  const isOwnProfile = authUser?.uid === uid;

  const {
    connectionState,
    isConnLoading,
    isPending,
    connError,
    handleConnect,
    handleCancel,
    handleAccept,
    handleDecline,
    handleRemove,
  } = useConnectionState(isOwnProfile ? null : uid);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const data = await fetchUserById(uid);
        if (!isMounted) return;

        if (!data) {
          setProfileState({
            loadedUid: uid,
            profile: null,
            error: "This student profile does not exist or has been removed.",
          });
        } else {
          setProfileState({
            loadedUid: uid,
            profile: data,
            error: null,
          });
        }
      } catch (err) {
        if (!isMounted) return;
        setProfileState({
          loadedUid: uid,
          profile: null,
          error: err.message || "Failed to load student profile.",
        });
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [uid]);

  const isLoading = profileState.loadedUid !== uid;
  const profile = profileState.profile;
  const error = profileState.error;

  const visibleLinks = profile?.socialLinks
    ? getVisibleLinks(profile.socialLinks)
    : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <div className="space-y-6">
            <div className="h-48 animate-pulse rounded-2xl bg-stone-200" />
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="h-64 animate-pulse rounded-2xl bg-stone-200" />
              <div className="h-64 animate-pulse rounded-2xl bg-stone-200" />
            </div>
          </div>
        </PageContainer>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <Navbar />
        <PageContainer>
          <Card className="mx-auto max-w-2xl text-center">
            <h1 className="font-serif text-2xl font-bold text-ink">Student not found</h1>
            <p className="mt-2 text-ink-muted">
              {error || "The profile you are looking for does not exist."}
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <Link
                to="/discover"
                className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
              >
                Back to Discover
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-stone-50"
              >
                Dashboard
              </Link>
            </div>
          </Card>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />
      <PageContainer>
        <div className="space-y-6">

          <div className="flex items-center justify-between">
            <Link
              to="/discover"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-700 hover:text-terracotta-800"
            >
              &larr; Back to Discover
            </Link>

            {isOwnProfile && (
              <Link
                to="/profile"
                className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3.5 py-1.5 text-sm font-medium text-ink transition hover:bg-stone-50"
              >
                Edit your profile
              </Link>
            )}
          </div>

        {isOwnProfile && (
          <div className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 p-3 text-sm text-terracotta-900">
            This is how your profile appears to other students. To update your info,{" "}
            <Link to="/profile" className="font-semibold underline text-terracotta-700 hover:text-terracotta-950">
              edit your profile
            </Link>
            .
          </div>
        )}

        {/* Profile Header Banner & Avatar */}
        <Card className="overflow-hidden p-0">
          <div className="relative z-0 flex h-32 sm:h-36 items-center sm:items-end bg-gradient-to-r from-stone-200 via-[#fde8d7] to-[#fbd5be] border-b border-border-warm px-6 pb-1 sm:pb-2">
            <div className="w-full text-center sm:w-auto sm:pl-28 sm:text-left">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                {profile.displayName}
              </h1>
            </div>
          </div>
          <div className="relative z-10 px-6 pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="relative z-20 shrink-0">
                <Avatar name={profile.displayName} photoURL={profile.photoURL} size="xl" />
              </div>
              <div className="flex flex-col items-start sm:items-end gap-3 pb-2">
                <div className="flex flex-wrap gap-2">
                  {profile.department && (
                    <span className="rounded-full bg-terracotta-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-terracotta-700 border border-terracotta-200/50">
                      {profile.department}
                    </span>
                  )}
                  {profile.year && (
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 border border-stone-200">
                      {profile.year}
                    </span>
                  )}
                </div>

                {/* Connection Actions — hidden on own profile and while loading */}
                {!isOwnProfile && !isConnLoading && (
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      {connectionState === "none" && (
                        <button
                          id="btn-connect"
                          onClick={handleConnect}
                          disabled={isPending}
                          className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-terracotta-700 disabled:opacity-50"
                        >
                          {isPending ? "Sending…" : "Connect"}
                        </button>
                      )}

                      {connectionState === "outgoing_pending" && (
                        <>
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 border border-amber-200">
                            Request Sent
                          </span>
                          <button
                            id="btn-cancel-request"
                            onClick={handleCancel}
                            disabled={isPending}
                            className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:text-ink hover:bg-stone-50 disabled:opacity-50"
                          >
                            {isPending ? "Cancelling…" : "Cancel"}
                          </button>
                        </>
                      )}

                      {connectionState === "incoming_pending" && (
                        <>
                          <button
                            id="btn-accept-request"
                            onClick={handleAccept}
                            disabled={isPending}
                            className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-terracotta-700 disabled:opacity-50"
                          >
                            {isPending ? "Accepting…" : "Accept"}
                          </button>
                          <button
                            id="btn-decline-request"
                            onClick={handleDecline}
                            disabled={isPending}
                            className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:text-ink hover:bg-stone-50 disabled:opacity-50"
                          >
                            {isPending ? "Declining…" : "Decline"}
                          </button>
                        </>
                      )}

                      {connectionState === "connected" && (
                        <>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 border border-emerald-200">
                            Connected
                          </span>
                          <button
                            id="btn-remove-connection"
                            onClick={handleRemove}
                            disabled={isPending}
                            className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-rose-300 hover:text-rose-700 hover:bg-stone-50 disabled:opacity-50"
                          >
                            {isPending ? "Removing…" : "Remove"}
                          </button>
                        </>
                      )}
                    </div>

                    {connError && (
                      <p className="text-xs text-rose-600" role="alert">
                        {connError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Profile Content Grid */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* About Section */}
          <Card>
            <Section title="About" subtitle="Academic profile and introduction.">
              <p className="text-ink leading-relaxed whitespace-pre-line">
                {profile.bio || "This student hasn't added a bio yet."}
              </p>
            </Section>
          </Card>

          {/* Sidebar: Skills & Social Links */}
          <div className="space-y-6">
            <Card>
              <Section title="Skills">
                {profile.skills?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 border border-stone-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No skills added yet.</p>
                )}
              </Section>
            </Card>

            <Card>
              <Section title="Links & Social">
                {visibleLinks.length > 0 ? (
                  <div className="space-y-2">
                    {visibleLinks.map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-xl border border-border-warm bg-surface p-3 text-sm font-medium text-ink transition hover:border-stone-300 hover:text-terracotta-700"
                      >
                        <span className="capitalize">{platform}</span>
                        <svg
                          className="h-4 w-4 text-ink-muted"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">No social links added yet.</p>
                )}
              </Section>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  </div>
);

}
