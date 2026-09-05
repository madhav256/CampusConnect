import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchUserById } from "../services/userService";
import { useAuth } from "../hooks/useAuth";
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
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <Card className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-semibold text-slate-950">Student not found</h1>
          <p className="mt-2 text-slate-600">
            {error || "The profile you are looking for does not exist."}
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <Link
              to="/discover"
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Back to Discover
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Dashboard
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/discover"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              &larr; Back to Discover
            </Link>
            <span className="text-slate-300">|</span>
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Dashboard
            </Link>
          </div>

          {isOwnProfile && (
            <Link
              to="/profile"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Edit your profile
            </Link>
          )}
        </div>

        {isOwnProfile && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800">
            This is how your profile appears to other students. To update your info,{" "}
            <Link to="/profile" className="font-semibold underline hover:text-indigo-900">
              edit your profile
            </Link>
            .
          </div>
        )}

        {/* Profile Header Banner & Avatar */}
        <Card className="overflow-hidden p-0">
          <div className="h-28 bg-indigo-600" />
          <div className="px-6 pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Avatar name={profile.displayName} photoURL={profile.photoURL} size="xl" />
                <div>
                  <h1 className="text-3xl font-bold text-slate-950">{profile.displayName}</h1>
                  {/* Note: email is purposefully NOT displayed for public profiles */}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.department && (
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                    {profile.department}
                  </span>
                )}
                {profile.year && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    {profile.year}
                  </span>
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
              <p className="text-slate-700">
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
                        className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No skills added yet.</p>
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
                        className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600"
                      >
                        <span className="capitalize">{platform}</span>
                        <svg
                          className="h-4 w-4 text-slate-400"
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
                  <p className="text-sm text-slate-500">No social links added yet.</p>
                )}
              </Section>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
