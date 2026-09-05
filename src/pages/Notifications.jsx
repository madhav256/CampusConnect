import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import NotificationItem from "../components/notifications/NotificationItem";
import SecurityTestPanel from "../components/dev/SecurityTestPanel";
import Card from "../components/ui/Card";

export default function Notifications() {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid;

  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotificationItem,
  } = useNotifications();

  const [filterTab, setFilterTab] = useState("all"); // "all" | "unread"

  const displayedNotifications =
    filterTab === "unread"
      ? notifications.filter((n) => !n.isRead)
      : notifications;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <Link to="/dashboard" className="text-xl font-bold text-indigo-600">
            CampusConnect
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Dashboard
            </Link>
            <Link
              to="/discover"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Discover
            </Link>
            <Link
              to="/connections"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Connections
            </Link>
            <Link
              to="/notifications"
              className="relative text-sm font-semibold text-indigo-600"
            >
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
            <Link
              to="/settings"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Settings
            </Link>
            <Link
              to="/profile"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Profile
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-3xl p-4 sm:p-6 md:p-8">
        {/* Page Title & Actions */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">Notifications</h1>
            <p className="mt-1 text-slate-500">
              Stay updated with your campus connections.
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              id="btn-mark-all-read"
              onClick={markAllAsRead}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Development-only Security Audit Test Panel */}
        {import.meta.env.DEV && (
          <SecurityTestPanel
            currentUid={currentUid}
            notifications={notifications}
          />
        )}

        {/* Error Alert */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50 text-center text-red-600">
            {error}
          </Card>
        )}

        {/* Tab filters */}
        <div className="mb-6 flex gap-6 border-b border-slate-200">
          <button
            onClick={() => setFilterTab("all")}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              filterTab === "all"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            All{" "}
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {notifications.length}
            </span>
          </button>
          <button
            onClick={() => setFilterTab("unread")}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              filterTab === "unread"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Unread{" "}
            {unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-3/4 rounded bg-slate-200" />
                    <div className="h-3 w-1/4 rounded bg-slate-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notifications List */}
        {!isLoading && displayedNotifications.length > 0 && (
          <div className="space-y-3">
            {displayedNotifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                currentUid={currentUid}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotificationItem}
              />
            ))}
          </div>
        )}

        {/* Empty States */}
        {!isLoading && displayedNotifications.length === 0 && (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              {filterTab === "unread"
                ? "You're all caught up!"
                : "No notifications yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">
              {filterTab === "unread"
                ? "You don't have any unread notifications."
                : "When students connect with you or accept your requests, you'll see them here."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
