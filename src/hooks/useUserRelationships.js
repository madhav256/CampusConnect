import { useEffect, useState, useMemo } from "react";
import { useAuth } from "./useAuth";
import { subscribeToUserRelationships } from "../services/connectionService";

/**
 * Provides real-time access to all of the current user's connections and
 * pending requests, partitioned from a single Firestore query stream.
 *
 * @returns {{
 *   connections: object[],       // Accepted connections (status === "accepted")
 *   incomingRequests: object[], // Pending requests where currentUser is receiverId
 *   outgoingRequests: object[], // Pending requests where currentUser is senderId
 *   isLoading: boolean,
 *   error: string|null,
 * }}
 */
export function useUserRelationships() {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid;

  const [docs, setDocs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUid) {
      return;
    }

    const unsubscribe = subscribeToUserRelationships(
      currentUid,
      (allDocs) => {
        setDocs(allDocs);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("useUserRelationships error:", err);
        setError("Failed to load your connections.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUid]);

  const connections = useMemo(
    () => docs.filter((d) => d.status === "accepted"),
    [docs]
  );
  const incomingRequests = useMemo(
    () => docs.filter((d) => d.status === "pending" && d.receiverId === currentUid),
    [docs, currentUid]
  );
  const outgoingRequests = useMemo(
    () => docs.filter((d) => d.status === "pending" && d.senderId === currentUid),
    [docs, currentUid]
  );

  return { connections, incomingRequests, outgoingRequests, isLoading, error };
}
