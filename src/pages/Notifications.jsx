import { useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import NotificationItem from "../components/notifications/NotificationItem";
import SecurityTestPanel from "../components/dev/SecurityTestPanel";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";


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
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      {/* Main Content */}
      <PageContainer maxWidth="max-w-3xl">
        {/* Page Title & Actions */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Notifications</h1>
            <p className="mt-1 text-ink-muted">
              Stay updated with your campus connections.
            </p>
          </div>

          {unreadCount > 0 && (
            <Button
              id="btn-mark-all-read"
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
            >
              Mark all as read
            </Button>
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
          <Card className="mb-6 border-rose-200 bg-rose-50 text-center text-rose-700">
            {error}
          </Card>
        )}

        {/* Tab filters */}
        <div className="mb-6 flex gap-6 border-b border-border-warm">
          <button
            onClick={() => setFilterTab("all")}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              filterTab === "all"
                ? "border-terracotta-600 text-terracotta-700"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            All{" "}
            <span className="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
              {notifications.length}
            </span>
          </button>
          <button
            onClick={() => setFilterTab("unread")}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              filterTab === "unread"
                ? "border-terracotta-600 text-terracotta-700"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Unread{" "}
            {unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-terracotta-100 px-2 py-0.5 text-xs font-semibold text-terracotta-800">
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
                className="animate-pulse rounded-2xl border border-border-warm bg-surface p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-stone-200" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-3/4 rounded bg-stone-200" />
                    <div className="h-3 w-1/4 rounded bg-stone-200" />
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
          <EmptyState
            icon={Bell}
            title={
              filterTab === "unread"
                ? "You're all caught up!"
                : "No notifications yet"
            }
            description={
              filterTab === "unread"
                ? "You don't have any unread notifications."
                : "When students connect with you or accept your requests, you'll see them here."
            }
          />
        )}
      </PageContainer>
    </div>
  );
}

