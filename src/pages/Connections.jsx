import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useUserRelationships } from "../hooks/useUserRelationships";
import { useNotifications } from "../hooks/useNotifications";
import {
  acceptConnectionRequest,
  rejectConnectionRequest,
  cancelConnectionRequest,
  removeConnection,
} from "../services/connectionService";
import { fetchUserById } from "../services/userService";
import Avatar from "../components/ui/Avatar";
import Card from "../components/ui/Card";

// ── Inline connection action button ──────────────────────────────────────────

function ActionButton({ id, onClick, disabled, variant = "primary", children }) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    outline: "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
    danger: "border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:text-red-600",
  };
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

// ── Person card shared by all three tabs ─────────────────────────────────────

function PersonCard({ doc, currentUid, onAction }) {
  const [isBusy, setIsBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Derive the "other" participant's UID from the relationship doc
  const otherUid =
    doc.senderId === currentUid ? doc.receiverId : doc.senderId;

  async function act(fn) {
    if (isBusy) return;
    setIsBusy(true);
    setErr(null);
    try {
      await fn(currentUid, otherUid);
      if (onAction) onAction();
    } catch (e) {
      setErr(e.message || "An error occurred.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <PersonCardInner
      doc={doc}
      currentUid={currentUid}
      otherUid={otherUid}
      isBusy={isBusy}
      err={err}
      act={act}
    />
  );
}

function PersonCardInner({ doc, currentUid, otherUid, isBusy, err, act }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);

  // Fetch the other user's profile once on mount or when otherUid changes
  useEffect(() => {
    let alive = true;
    fetchUserById(otherUid)
      .then((p) => {
        if (alive) {
          setProfile(p);
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setLoadErr(e.message);
          setIsLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [otherUid]);

  if (loadErr) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
        Failed to load student info.
      </div>
    );
  }

  if (isLoading) {
    // Skeleton
    return (
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  const isConnected = doc.status === "accepted";
  const isIncoming = doc.status === "pending" && doc.receiverId === currentUid;
  const isOutgoing = doc.status === "pending" && doc.senderId === currentUid;

  const displayProfile = profile || {
    displayName: "Student (" + (otherUid ? otherUid.slice(0, 6) : "Unknown") + ")",
    department: "",
    year: "",
    photoURL: null,
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200">
      <div className="flex items-start gap-3">
        <Avatar name={displayProfile.displayName} photoURL={displayProfile.photoURL} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{displayProfile.displayName}</p>
          <p className="truncate text-sm text-slate-500">
            {[displayProfile.department, displayProfile.year].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to={`/users/${otherUid}`}
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600"
        >
          View Profile
        </Link>

        {isConnected && (
          <ActionButton
            id={`btn-remove-${otherUid}`}
            variant="danger"
            disabled={isBusy}
            onClick={() => act(removeConnection)}
          >
            {isBusy ? "Removing…" : "Remove"}
          </ActionButton>
        )}

        {isIncoming && (
          <>
            <ActionButton
              id={`btn-accept-${otherUid}`}
              variant="primary"
              disabled={isBusy}
              onClick={() => act(acceptConnectionRequest)}
            >
              {isBusy ? "Accepting…" : "Accept"}
            </ActionButton>
            <ActionButton
              id={`btn-decline-${otherUid}`}
              variant="outline"
              disabled={isBusy}
              onClick={() => act(rejectConnectionRequest)}
            >
              {isBusy ? "Declining…" : "Decline"}
            </ActionButton>
          </>
        )}

        {isOutgoing && (
          <ActionButton
            id={`btn-cancel-${otherUid}`}
            variant="outline"
            disabled={isBusy}
            onClick={() => act(cancelConnectionRequest)}
          >
            {isBusy ? "Cancelling…" : "Cancel Request"}
          </ActionButton>
        )}
      </div>

      {err && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ icon, title, body }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">{body}</p>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function Tab({ id, label, count, active, onClick }) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`relative flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
        active
          ? "border-indigo-600 text-indigo-600"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Connections() {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid;

  const {
    connections,
    incomingRequests,
    outgoingRequests,
    isLoading,
    error,
  } = useUserRelationships();

  const { unreadCount } = useNotifications();

  const [activeTab, setActiveTab] = useState("connections");

  const tabs = [
    { id: "tab-connections", key: "connections", label: "My Connections", count: connections.length },
    {
      id: "tab-requests",
      key: "requests",
      label: "Requests",
      count: incomingRequests.length + outgoingRequests.length,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
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
              className="text-sm font-semibold text-indigo-600"
            >
              Connections
            </Link>
            <Link
              to="/notifications"
              className="relative text-sm font-medium text-slate-600 hover:text-indigo-600"
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

      <main className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950">Connections</h1>
          <p className="mt-1 text-slate-500">
            Manage your campus network and pending requests.
          </p>
        </div>

        {/* Error state */}
        {error && (
          <Card className="mb-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </Card>
        )}

        {/* Tab bar */}
        <div className="mb-6 flex gap-6 border-b border-slate-200">
          {tabs.map((t) => (
            <Tab
              key={t.key}
              id={t.id}
              label={t.label}
              count={t.count}
              active={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
            />
          ))}
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-200" />
                    <div className="h-3 w-1/2 rounded bg-slate-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Connections Tab */}
        {!isLoading && activeTab === "connections" && (
          <>
            {connections.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                }
                title="No connections yet"
                body="Visit student profiles on Discover to send connection requests."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {connections.map((doc) => (
                  <PersonCard key={doc.id} doc={doc} currentUid={currentUid} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Requests Tab */}
        {!isLoading && activeTab === "requests" && (
          <div className="space-y-8">
            {/* Incoming */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                Incoming ({incomingRequests.length})
              </h2>
              {incomingRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No incoming requests.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {incomingRequests.map((doc) => (
                    <PersonCard key={doc.id} doc={doc} currentUid={currentUid} />
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                Sent ({outgoingRequests.length})
              </h2>
              {outgoingRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No sent requests.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {outgoingRequests.map((doc) => (
                    <PersonCard key={doc.id} doc={doc} currentUid={currentUid} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
