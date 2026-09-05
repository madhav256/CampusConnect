import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import {
  subscribeToConnectionState,
  sendConnectionRequest,
  cancelConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  removeConnection,
} from "../services/connectionService";

/**
 * Derives the current user's perspective on a connection document.
 *
 * @param {object|null} connDoc - The raw Firestore connection document or null
 * @param {string} currentUid
 * @returns {"none"|"outgoing_pending"|"incoming_pending"|"connected"}
 */
function deriveState(connDoc, currentUid) {
  if (!connDoc) return "none";
  if (connDoc.status === "accepted") return "connected";
  if (connDoc.status === "pending") {
    return connDoc.senderId === currentUid ? "outgoing_pending" : "incoming_pending";
  }
  return "none";
}

/**
 * Provides real-time connection state and action handlers for PublicProfile.
 * Subscribes to a single connection document between currentUid and targetUid.
 *
 * States: "none" | "outgoing_pending" | "incoming_pending" | "connected"
 *
 * @param {string} targetUid - The UID of the user being viewed
 * @returns {{
 *   connectionState: string,
 *   isConnLoading: boolean,
 *   isPending: boolean,
 *   connError: string|null,
 *   handleConnect: function,
 *   handleCancel: function,
 *   handleAccept: function,
 *   handleDecline: function,
 *   handleRemove: function,
 * }}
 */
export function useConnectionState(targetUid) {
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid;

  const [connDoc, setConnDoc] = useState(null);
  const [isConnLoading, setIsConnLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [connError, setConnError] = useState(null);

  const isValidPair = Boolean(currentUid && targetUid && currentUid !== targetUid);

  useEffect(() => {
    if (!isValidPair) {
      return;
    }

    const unsubscribe = subscribeToConnectionState(
      currentUid,
      targetUid,
      (doc) => {
        setConnDoc(doc);
        setIsConnLoading(false);
        setConnError(null);
      },
      (err) => {
        console.error("useConnectionState error:", err);
        setConnError("Failed to load connection status.");
        setIsConnLoading(false);
        setConnDoc(null);
      }
    );

    return () => unsubscribe();
  }, [currentUid, targetUid, isValidPair]);

  const connectionState = isConnLoading ? "none" : deriveState(connDoc, currentUid);

  async function runAction(action) {
    if (!currentUid || !targetUid || isPending) return;
    setIsPending(true);
    setConnError(null);
    try {
      await action(currentUid, targetUid);
    } catch (err) {
      setConnError(err.message || "An error occurred.");
    } finally {
      setIsPending(false);
    }
  }

  return {
    connectionState,
    isConnLoading,
    isPending,
    connError,
    handleConnect: () => runAction(sendConnectionRequest),
    handleCancel: () => runAction(cancelConnectionRequest),
    handleAccept: () => runAction(acceptConnectionRequest),
    handleDecline: () => runAction(rejectConnectionRequest),
    handleRemove: () => runAction(removeConnection),
  };
}
