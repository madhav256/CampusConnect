import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUserRelationships } from "../hooks/useUserRelationships";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import {
  acceptConnectionRequest,
  rejectConnectionRequest,
  cancelConnectionRequest,
  removeConnection,
} from "../services/connectionService";
import { fetchUserById } from "../services/userService";
import Avatar from "../components/ui/Avatar";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";


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
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
        Failed to load student info.
      </div>
    );
  }

  if (isLoading) {
    // Skeleton
    return (
      <div className="animate-pulse rounded-2xl border border-border-warm bg-surface p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-stone-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-stone-200" />
            <div className="h-3 w-1/2 rounded bg-stone-200" />
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
    <div className="rounded-2xl border border-border-warm bg-surface p-4 shadow-xs transition hover:border-stone-300">
      <div className="flex items-start gap-3">
        <Avatar name={displayProfile.displayName} photoURL={displayProfile.photoURL} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{displayProfile.displayName}</p>
          <p className="truncate text-sm text-ink-muted">
            {[displayProfile.department, displayProfile.year].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          to={`/users/${otherUid}`}
          className="inline-flex items-center justify-center rounded-xl border border-border-warm bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-stone-300 hover:text-terracotta-700 hover:bg-stone-50"
        >
          View Profile
        </Link>

        {isConnected && (
          <Button
            id={`btn-remove-${otherUid}`}
            variant="danger"
            size="sm"
            disabled={isBusy}
            loading={isBusy}
            loadingText="Removing…"
            onClick={() => act(removeConnection)}
          >
            Remove
          </Button>
        )}

        {isIncoming && (
          <>
            <Button
              id={`btn-accept-${otherUid}`}
              variant="primary"
              size="sm"
              disabled={isBusy}
              loading={isBusy}
              loadingText="Accepting…"
              onClick={() => act(acceptConnectionRequest)}
            >
              Accept
            </Button>
            <Button
              id={`btn-decline-${otherUid}`}
              variant="outline"
              size="sm"
              disabled={isBusy}
              loading={isBusy}
              loadingText="Declining…"
              onClick={() => act(rejectConnectionRequest)}
            >
              Decline
            </Button>
          </>
        )}

        {isOutgoing && (
          <Button
            id={`btn-cancel-${otherUid}`}
            variant="outline"
            size="sm"
            disabled={isBusy}
            loading={isBusy}
            loadingText="Cancelling…"
            onClick={() => act(cancelConnectionRequest)}
          >
            Cancel Request
          </Button>
        )}
      </div>

      {err && (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {err}
        </p>
      )}
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
          ? "border-terracotta-600 text-terracotta-700 font-semibold"
          : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            active ? "bg-terracotta-100 text-terracotta-800" : "bg-stone-100 text-stone-600"
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
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <PageContainer>
        {/* Page title */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Connections</h1>
          <p className="mt-1 text-ink-muted">
            Manage your campus network and pending requests.
          </p>
        </div>

        {/* Error state */}
        {error && (
          <Card className="mb-6 text-center">
            <p className="text-sm text-rose-600">{error}</p>
          </Card>
        )}

        {/* Tab bar */}
        <div className="mb-6 flex gap-6 border-b border-border-warm">
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
                className="animate-pulse rounded-2xl border border-border-warm bg-surface p-4 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-stone-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-stone-200" />
                    <div className="h-3 w-1/2 rounded bg-stone-200" />
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
                icon={Users}
                title="No connections yet"
                description="Visit student profiles on Discover to connect with your campus peers."
                action={
                  <Link
                    to="/discover"
                    className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-terracotta-700"
                  >
                    Discover Students
                  </Link>
                }
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
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Incoming ({incomingRequests.length})
              </h2>
              {incomingRequests.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No incoming requests"
                  description="When students send you a connection request, you'll see them here."
                  compact
                />
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
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Sent ({outgoingRequests.length})
              </h2>
              {outgoingRequests.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No sent requests"
                  description="You have not sent any pending connection requests."
                  compact
                />
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
      </PageContainer>

    </div>
  );
}
