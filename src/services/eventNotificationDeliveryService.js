/**
 * Milestone 23 — Unit 23.3: Resumable Event Notification Delivery Service
 *
 * Implements client-managed, resumable notification fan-out for event cancellations
 * adhering to the M23.1/M23.2 domain contracts:
 * - 8-recipient atomic batches (CHUNK_SIZE = 8)
 * - Deterministic notification IDs (cancel_${eventId}_${cycleId})
 * - Compare-and-set checkpoint versions on eventNotificationDeliveries/{eventId}
 * - Deterministic document-ID ordered query pagination on eventRsvps
 * - Zero-attendee and exact-multiple completion handling
 * - Fail-closed supersession and republish reconciliation
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  documentId,
  writeBatch,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config.js";
import {
  CANCELLATION_DELIVERY_CHUNK_SIZE,
  DELIVERY_LEDGER_STATUSES,
} from "../constants.js";

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      "Firestore is not configured. Add your Vite Firebase environment variables and restart the dev server."
    );
  }
  return db;
}

/**
 * Normalizes Firestore Timestamp, Date, or string into client Date or null.
 *
 * @param {any} val
 * @returns {Date|null}
 */
function normalizeTimestamp(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val.toMillis === "function") return new Date(val.toMillis());
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Returns a DocumentReference for an event's delivery ledger.
 * Root collection: eventNotificationDeliveries/{eventId}
 *
 * @param {string} eventId
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function deliveryLedgerDocRef(eventId) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to resolve delivery ledger document reference.");
  }
  return doc(requireDb(), "eventNotificationDeliveries", eventId.trim());
}

/**
 * Normalizes a raw delivery ledger snapshot or data object into the locked domain contract.
 *
 * @param {string|import("firebase/firestore").DocumentSnapshot|object} idOrDoc
 * @param {object|null} [maybeData]
 * @returns {object|null}
 */
export function normalizeDeliveryLedger(idOrDoc, maybeData) {
  let id = idOrDoc;
  let data = maybeData;

  if (idOrDoc && typeof idOrDoc === "object") {
    if (typeof idOrDoc.data === "function") {
      id = idOrDoc.id;
      data = idOrDoc.data();
    } else if (!maybeData) {
      id = idOrDoc.id;
      data = idOrDoc;
    }
  }

  if (!data) return null;

  return {
    id: id || data.id || "",
    eventId: data.eventId || id || "",
    cycleId: data.cycleId || "",
    campusId: data.campusId || "",
    communityId: data.communityId || "",
    actorId: data.actorId || "",
    actorName: data.actorName || "CampusConnect Student",
    actorAvatar: data.actorAvatar || null,
    status: data.status || DELIVERY_LEDGER_STATUSES.PENDING,
    checkpointVersion: typeof data.checkpointVersion === "number" ? data.checkpointVersion : 0,
    lastProcessedRsvpId: data.lastProcessedRsvpId || null,
    processedCount: typeof data.processedCount === "number" ? data.processedCount : 0,
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
  };
}

/**
 * Reads and returns the delivery ledger document for a given event ID.
 * Returns null if the ledger does not exist.
 *
 * @param {string} eventId
 * @returns {Promise<object|null>}
 */
export async function getDeliveryLedger(eventId) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to read delivery ledger.");
  }

  const ledgerRef = deliveryLedgerDocRef(eventId);
  const snap = await getDoc(ledgerRef);
  if (!snap.exists()) {
    return null;
  }
  return normalizeDeliveryLedger(snap.id, snap.data());
}

/**
 * Subscribes to real-time changes on the delivery ledger document for an event.
 *
 * @param {string} eventId
 * @param {(ledger: object|null) => void} onNext
 * @param {(error: Error) => void} [onError]
 * @returns {() => void} Unsubscribe function
 */
export function subscribeToDeliveryLedger(eventId, onNext, onError) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    return () => {};
  }
  if (!isFirebaseConfigured || !db) {
    return () => {};
  }

  const ledgerRef = deliveryLedgerDocRef(eventId.trim());
  return onSnapshot(
    ledgerRef,
    (snap) => {
      if (!snap.exists()) {
        onNext(null);
      } else {
        onNext(normalizeDeliveryLedger(snap.id, snap.data()));
      }
    },
    (err) => {
      if (typeof onError === "function") {
        onError(err);
      }
    }
  );
}

/**
 * Reconciles the delivery ledger lifecycle against parent event status.
 *
 * @param {string} eventId
 * @returns {Promise<{ isTerminal: boolean, status: string, reason?: string, ledger: object|null }>}
 */
export async function reconcileDeliveryCycle(eventId) {
  const ledger = await getDeliveryLedger(eventId);
  if (!ledger) {
    return { isTerminal: true, status: "not_found", reason: "Ledger document does not exist.", ledger: null };
  }

  if (ledger.status === DELIVERY_LEDGER_STATUSES.COMPLETED) {
    return { isTerminal: true, status: DELIVERY_LEDGER_STATUSES.COMPLETED, ledger };
  }

  if (ledger.status === DELIVERY_LEDGER_STATUSES.SUPERSEDED) {
    return { isTerminal: true, status: DELIVERY_LEDGER_STATUSES.SUPERSEDED, ledger };
  }

  const firestore = requireDb();
  const eventRef = doc(firestore, "events", eventId);
  const eventSnap = await getDoc(eventRef);

  if (!eventSnap.exists()) {
    return { isTerminal: true, status: "event_deleted", reason: "Parent event was hard-deleted.", ledger };
  }

  const eventData = eventSnap.data();
  if (eventData.status !== "cancelled") {
    return {
      isTerminal: true,
      status: "event_republished",
      reason: `Parent event is currently ${eventData.status}.`,
      ledger,
    };
  }

  return { isTerminal: false, status: ledger.status, ledger };
}

/**
 * Executes or resumes client-managed cancellation notification delivery.
 * Processes attendees in chunks of up to CANCELLATION_DELIVERY_CHUNK_SIZE (8).
 * Atomically commits notifications and advances ledger checkpointVersion per chunk.
 *
 * @param {string} eventId
 * @param {object} [options={}]
 * @param {number} [options.maxBatches=Infinity] Max chunks to process in this run
 * @param {string} [options.eventTitle=null] Preloaded event title for notifications
 * @param {(progress: { processedCount: number, status: string, checkpointVersion: number }) => void} [options.onProgress]
 * @returns {Promise<{
 *   status: string,
 *   processedCount: number,
 *   checkpointVersion: number,
 *   cycleId: string,
 *   batchesCommitted: number,
 *   message?: string
 * }>}
 */
export async function deliverCancellationNotifications(eventId, options = {}) {
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("Event ID is required to deliver cancellation notifications.");
  }

  const trimmedEventId = eventId.trim();
  const firestore = requireDb();
  const ledgerRef = deliveryLedgerDocRef(trimmedEventId);

  // 1. Read initial ledger state
  let currentLedger = await getDeliveryLedger(trimmedEventId);
  if (!currentLedger) {
    throw new Error(`Delivery ledger not found for event: ${trimmedEventId}`);
  }

  if (currentLedger.status === DELIVERY_LEDGER_STATUSES.COMPLETED) {
    return {
      status: DELIVERY_LEDGER_STATUSES.COMPLETED,
      processedCount: currentLedger.processedCount,
      checkpointVersion: currentCheckpointVersionOrDefault(currentLedger),
      cycleId: currentLedger.cycleId,
      batchesCommitted: 0,
      message: "Delivery cycle already completed.",
    };
  }

  if (currentLedger.status === DELIVERY_LEDGER_STATUSES.SUPERSEDED) {
    return {
      status: DELIVERY_LEDGER_STATUSES.SUPERSEDED,
      processedCount: currentLedger.processedCount,
      checkpointVersion: currentCheckpointVersionOrDefault(currentLedger),
      cycleId: currentLedger.cycleId,
      batchesCommitted: 0,
      message: "Delivery cycle has been superseded.",
    };
  }

  // 2. Verify parent event is cancelled
  const eventRef = doc(firestore, "events", trimmedEventId);
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists()) {
    return {
      status: "aborted",
      processedCount: currentLedger.processedCount,
      checkpointVersion: currentCheckpointVersionOrDefault(currentLedger),
      cycleId: currentLedger.cycleId,
      batchesCommitted: 0,
      message: "Parent event document does not exist.",
    };
  }

  const eventData = eventSnap.data();
  if (eventData.status !== "cancelled") {
    return {
      status: "aborted",
      processedCount: currentLedger.processedCount,
      checkpointVersion: currentCheckpointVersionOrDefault(currentLedger),
      cycleId: currentLedger.cycleId,
      batchesCommitted: 0,
      message: `Parent event is ${eventData.status}; cancellation delivery halted.`,
    };
  }

  const eventTitle = options.eventTitle || eventData.title || null;
  const maxBatches = typeof options.maxBatches === "number" && options.maxBatches > 0
    ? options.maxBatches
    : Infinity;

  let cursorDocId = currentLedger.lastProcessedRsvpId || null;
  let currentCheckpointVersion = currentCheckpointVersionOrDefault(currentLedger);
  let currentProcessedCount = currentLedger.processedCount || 0;
  const currentCycleId = currentLedger.cycleId;
  const campusId = currentLedger.campusId;

  let batchesCommitted = 0;
  let consecutiveErrors = 0;
  const MAX_RETRIES_PER_CHUNK = 3;

  while (batchesCommitted < maxBatches) {
    // A. Query next chunk of RSVP recipients ordered deterministically by documentId()
    const rsvpConstraints = [
      where("eventId", "==", trimmedEventId),
      where("campusId", "==", campusId),
      orderBy(documentId()),
    ];

    if (cursorDocId) {
      rsvpConstraints.push(startAfter(cursorDocId));
    }

    rsvpConstraints.push(limit(CANCELLATION_DELIVERY_CHUNK_SIZE));

    const rsvpQuery = query(collection(firestore, "eventRsvps"), ...rsvpConstraints);
    const rsvpSnap = await getDocs(rsvpQuery);
    const docs = rsvpSnap.docs;

    // Case 1: Empty query (Zero attendees initially, or exhausted after full chunk)
    if (docs.length === 0) {
      if (currentLedger.status !== DELIVERY_LEDGER_STATUSES.COMPLETED) {
        const completionBatch = writeBatch(firestore);
        const nextVersion = currentCheckpointVersion + 1;

        completionBatch.update(ledgerRef, {
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          checkpointVersion: nextVersion,
          lastProcessedRsvpId: cursorDocId,
          processedCount: currentProcessedCount,
          updatedAt: serverTimestamp(),
        });

        try {
          await completionBatch.commit();
          currentCheckpointVersion = nextVersion;
          batchesCommitted += 1;
        } catch (err) {
          // Re-read ledger to reconcile possible concurrent worker commit
          const freshLedger = await getDeliveryLedger(trimmedEventId);
          if (freshLedger && freshLedger.status === DELIVERY_LEDGER_STATUSES.COMPLETED) {
            currentCheckpointVersion = freshLedger.checkpointVersion;
            currentProcessedCount = freshLedger.processedCount;
          } else {
            throw err;
          }
        }
      }

      if (typeof options.onProgress === "function") {
        options.onProgress({
          processedCount: currentProcessedCount,
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          checkpointVersion: currentCheckpointVersion,
        });
      }

      return {
        status: DELIVERY_LEDGER_STATUSES.COMPLETED,
        processedCount: currentProcessedCount,
        checkpointVersion: currentCheckpointVersion,
        cycleId: currentCycleId,
        batchesCommitted,
        message: "Delivery completed successfully.",
      };
    }

    // Case 2: Non-empty chunk (1 to 8 recipients)
    const isTerminalChunk = docs.length < CANCELLATION_DELIVERY_CHUNK_SIZE;
    const nextStatus = isTerminalChunk
      ? DELIVERY_LEDGER_STATUSES.COMPLETED
      : DELIVERY_LEDGER_STATUSES.IN_PROGRESS;

    const nextVersion = currentCheckpointVersion + 1;
    const nextCursor = docs[docs.length - 1].id;
    const nextProcessedCount = currentProcessedCount + docs.length;

    const batch = writeBatch(firestore);

    // Write cancellation notifications using deterministic IDs
    for (const d of docs) {
      const rsvpData = d.data();
      const recipientId = rsvpData.userId;
      const notifId = `cancel_${trimmedEventId}_${currentCycleId}`;
      const notifRef = doc(firestore, "users", recipientId, "notifications", notifId);

      const notifPayload = {
        id: notifId,
        recipientId,
        actorId: currentLedger.actorId,
        actorName: currentLedger.actorName,
        actorAvatar: currentLedger.actorAvatar,
        type: "event_cancelled",
        referenceId: trimmedEventId,
        cycleId: currentCycleId,
        isRead: false,
        createdAt: serverTimestamp(),
      };

      if (eventTitle && typeof eventTitle === "string") {
        const trimmedTitle = eventTitle.trim();
        if (trimmedTitle.length > 0) {
          notifPayload.referenceTitle = trimmedTitle.slice(0, 100);
        }
      }

      batch.set(notifRef, notifPayload);
    }

    // Atomically advance the delivery ledger checkpoint
    batch.update(ledgerRef, {
      status: nextStatus,
      checkpointVersion: nextVersion,
      lastProcessedRsvpId: nextCursor,
      processedCount: nextProcessedCount,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();

      // Commit succeeded
      consecutiveErrors = 0;
      batchesCommitted += 1;
      cursorDocId = nextCursor;
      currentCheckpointVersion = nextVersion;
      currentProcessedCount = nextProcessedCount;
      currentLedger.status = nextStatus;

      if (typeof options.onProgress === "function") {
        options.onProgress({
          processedCount: currentProcessedCount,
          status: nextStatus,
          checkpointVersion: currentCheckpointVersion,
        });
      }

      if (isTerminalChunk) {
        return {
          status: DELIVERY_LEDGER_STATUSES.COMPLETED,
          processedCount: currentProcessedCount,
          checkpointVersion: currentCheckpointVersion,
          cycleId: currentCycleId,
          batchesCommitted,
          message: "Delivery completed successfully.",
        };
      }
    } catch (batchErr) {
      // Ambiguous acknowledgement / concurrent commit / withdrawn RSVP error handling
      const freshLedger = await getDeliveryLedger(trimmedEventId);

      if (!freshLedger) {
        throw new Error(`Ledger disappeared during delivery: ${batchErr?.message}`, {
          cause: batchErr,
        });
      }

      // Check if event was republished or ledger superseded
      if (
        freshLedger.status === DELIVERY_LEDGER_STATUSES.SUPERSEDED ||
        freshLedger.cycleId !== currentCycleId
      ) {
        return {
          status: DELIVERY_LEDGER_STATUSES.SUPERSEDED,
          processedCount: freshLedger.processedCount,
          checkpointVersion: freshLedger.checkpointVersion,
          cycleId: freshLedger.cycleId,
          batchesCommitted,
          message: "Delivery cycle superseded.",
        };
      }

      // Check if checkpoint actually advanced on server (lost ACK) or concurrent worker moved ahead
      if (freshLedger.checkpointVersion > currentCheckpointVersion) {
        cursorDocId = freshLedger.lastProcessedRsvpId;
        currentCheckpointVersion = freshLedger.checkpointVersion;
        currentProcessedCount = freshLedger.processedCount;
        currentLedger = freshLedger;
        consecutiveErrors = 0;

        if (freshLedger.status === DELIVERY_LEDGER_STATUSES.COMPLETED) {
          return {
            status: DELIVERY_LEDGER_STATUSES.COMPLETED,
            processedCount: currentProcessedCount,
            checkpointVersion: currentCheckpointVersion,
            cycleId: currentCycleId,
            batchesCommitted,
            message: "Delivery completed by concurrent worker.",
          };
        }
        continue;
      }

      // Checkpoint did not advance. Possible causes:
      // 1. Participant withdrew RSVP between query and commit
      // 2. Transient network error
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_RETRIES_PER_CHUNK) {
        throw new Error(
          `Delivery batch failed after ${MAX_RETRIES_PER_CHUNK} retries: ${batchErr?.message}`,
          { cause: batchErr }
        );
      }
      // Loop repeats: query will re-read from current cursorDocId
    }
  }

  return {
    status: currentLedger.status,
    processedCount: currentProcessedCount,
    checkpointVersion: currentCheckpointVersion,
    cycleId: currentCycleId,
    batchesCommitted,
    message: "Max batches limit reached before completion.",
  };
}

/**
 * Convenience alias to resume delivery for an in-progress or pending cancellation cycle.
 *
 * @param {string} eventId
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function resumeCancellationDelivery(eventId, options = {}) {
  return deliverCancellationNotifications(eventId, options);
}

function currentCheckpointVersionOrDefault(ledger) {
  return typeof ledger?.checkpointVersion === "number" ? ledger.checkpointVersion : 0;
}
