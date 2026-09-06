import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../hooks/useSettings";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import SecurityTestPanel from "../components/dev/SecurityTestPanel";
import Card from "../components/ui/Card";

export default function Settings() {
  const { user, logout } = useAuth();
  const currentUid = user?.uid;
  const navigate = useNavigate();
  const {
    settings,
    isLoading,
    isSaving,
    error,
    feedback,
    updatePrivacy,
    updateNotificationPreference,
  } = useSettings();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      setLogoutError(err.message || "Failed to sign out. Please try again.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      {/* Main Container */}
      <PageContainer maxWidth="max-w-3xl">

        {/* Page Title */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Settings</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage your account details, privacy controls, and notification preferences.
          </p>
        </div>

        {/* Development-only Security Audit Test Panel */}
        {import.meta.env.DEV && (
          <SecurityTestPanel
            currentUid={currentUid}
            initialSuite="milestone9"
          />
        )}

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            role="status"
          >
            {feedback}
          </div>
        )}

        {/* Global Error Alert */}
        {(error || logoutError) && (
          <div
            className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            role="alert"
          >
            {error || logoutError}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6">
            <div className="h-40 animate-pulse rounded-2xl bg-stone-200" />
            <div className="h-40 animate-pulse rounded-2xl bg-stone-200" />
          </div>
        )}

        {!isLoading && (
          <div className="space-y-6">
            {/* 1. Account Section */}
            <Card className="p-6">
              <h2 className="font-serif text-xl font-bold text-ink">Account</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Your authenticated university identity and profile links.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    Email Address
                  </label>
                  <div className="mt-1 flex items-center justify-between rounded-xl border border-border-warm bg-stone-100/70 px-3.5 py-2 text-sm text-ink">
                    <span>{settings.email || "No email available"}</span>
                    <span className="rounded-md bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      Read-only
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border-warm bg-stone-50/80 p-3 text-xs text-stone-700">
                  <p>
                    <strong>Email Privacy:</strong> Your email address is strictly private. It is never displayed on your public student profile, student search cards, or posts.
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    to="/profile"
                    className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-4 py-2 text-xs font-semibold text-ink shadow-sm transition hover:border-stone-300 hover:text-terracotta-700"
                  >
                    Edit Public Profile &rarr;
                  </Link>
                </div>
              </div>
            </Card>

            {/* 2. Privacy Section */}
            <Card className="p-6">
              <h2 className="font-serif text-xl font-bold text-ink">Privacy & Visibility</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Control how you appear in campus searches and directory discovery.
              </p>

              <div className="mt-4 divide-y divide-stone-100">
                <div className="flex items-start justify-between py-3">
                  <div className="pr-4">
                    <label
                      htmlFor="toggle-discoverable"
                      className="cursor-pointer text-sm font-semibold text-ink"
                    >
                      Discoverable in Student Search
                    </label>
                    <p className="mt-1 text-xs text-ink-muted">
                      When enabled, other students can find your profile by searching your name, department, or skills on the Discover page. When disabled, your profile is hidden from search results.
                    </p>
                    <p className="mt-1 text-[11px] text-stone-400">
                      Note: Direct links to your profile from posts, comments, or connections remain accessible to authenticated students.
                    </p>
                  </div>
                  <button
                    id="toggle-discoverable"
                    type="button"
                    role="switch"
                    aria-checked={settings.isDiscoverable}
                    disabled={isSaving}
                    onClick={() => updatePrivacy(!settings.isDiscoverable)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-terracotta-500 focus:ring-offset-2 disabled:opacity-50 ${
                      settings.isDiscoverable ? "bg-terracotta-600" : "bg-stone-300"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.isDiscoverable ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </Card>

            {/* 3. Notification Preferences Section */}
            <Card className="p-6">
              <h2 className="font-serif text-xl font-bold text-ink">Notification Preferences</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Configure which incoming events generate inbox notifications.
              </p>

              <div className="mt-4 divide-y divide-stone-100">
                {/* Connection Requests Toggle */}
                <div className="flex items-center justify-between py-3">
                  <div className="pr-4">
                    <label
                      htmlFor="toggle-notif-req"
                      className="cursor-pointer text-sm font-semibold text-ink"
                    >
                      Connection Requests
                    </label>
                    <p className="text-xs text-ink-muted">
                      Receive an inbox notification when another student sends you a connection request.
                    </p>
                  </div>
                  <button
                    id="toggle-notif-req"
                    type="button"
                    role="switch"
                    aria-checked={settings.notificationPreferences.connectionRequests}
                    disabled={isSaving}
                    onClick={() =>
                      updateNotificationPreference(
                        "connectionRequests",
                        !settings.notificationPreferences.connectionRequests
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-terracotta-500 focus:ring-offset-2 disabled:opacity-50 ${
                      settings.notificationPreferences.connectionRequests
                        ? "bg-terracotta-600"
                        : "bg-stone-300"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.notificationPreferences.connectionRequests
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Accepted Connections Toggle */}
                <div className="flex items-center justify-between py-3">
                  <div className="pr-4">
                    <label
                      htmlFor="toggle-notif-acc"
                      className="cursor-pointer text-sm font-semibold text-ink"
                    >
                      Accepted Connections
                    </label>
                    <p className="text-xs text-ink-muted">
                      Receive an inbox notification when another student accepts your connection request.
                    </p>
                  </div>
                  <button
                    id="toggle-notif-acc"
                    type="button"
                    role="switch"
                    aria-checked={settings.notificationPreferences.connectionAccepted}
                    disabled={isSaving}
                    onClick={() =>
                      updateNotificationPreference(
                        "connectionAccepted",
                        !settings.notificationPreferences.connectionAccepted
                      )
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-terracotta-500 focus:ring-offset-2 disabled:opacity-50 ${
                      settings.notificationPreferences.connectionAccepted
                        ? "bg-terracotta-600"
                        : "bg-stone-300"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.notificationPreferences.connectionAccepted
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </Card>

            {/* 4. Session & Sign Out */}
            <Card className="p-6">
              <h2 className="font-serif text-xl font-bold text-ink">Session</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Manage your active session on this device.
              </p>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Signed in as <span className="font-semibold">{settings.email}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    Signing out will return you to the login screen.
                  </p>
                </div>
                <button
                  id="btn-settings-signout"
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-4 py-2 text-xs font-semibold text-ink-muted shadow-sm transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                >
                  {isLoggingOut ? "Signing out…" : "Sign Out"}
                </button>
              </div>
            </Card>

            {/* 5. Danger Zone (Deferred Account Deletion) */}
            <Card className="border-rose-200/60 bg-rose-50/20 p-6">
              <h2 className="font-serif text-xl font-bold text-rose-950">Danger Zone</h2>
              <p className="mt-0.5 text-xs text-rose-800">
                Irreversible account actions.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Delete Account
                  </p>
                  <p className="text-xs text-ink-muted">
                    Account deletion is deferred pending backend cascade cleanup support.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-xl border border-rose-200 bg-surface px-4 py-2 text-xs font-semibold text-rose-400 opacity-60"
                  title="Account deletion requires administrator cascade support."
                >
                  Delete Account (Coming Soon)
                </button>
              </div>
            </Card>
          </div>
        )}
      </PageContainer>
    </div>
  );
}

