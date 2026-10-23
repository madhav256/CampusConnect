/**
 * Cloud Tasks Dispatcher for Durable Continuations (ADR-024 Revision 33)
 *
 * Implements primary asynchronous Cloud Task dispatch following successful
 * continuation-producing transactions and continuation-worker requeues.
 *
 * Guarantees:
 * 1. Invoked strictly AFTER the enclosing Firestore transaction has committed.
 * 2. Dispatch failure does not undo committed state, overwrite newer continuation
 *    state, or increment execution retry counts.
 * 3. Un-dispatched or lost tasks are recovered by the 1-minute fallback sweeper.
 */

import { getFunctions } from "firebase-admin/functions";
import { getAdminApp } from "../../scripts/adminClient.mjs";

export const CONTINUATION_TASK_FUNCTION_NAME = "processWaitlistContinuationTask";

let customEnqueuer = null;
const dispatchHistory = [];

/**
 * Dispatches an asynchronous Cloud Task targeting processWaitlistContinuationTask.
 *
 * @param {string} eventId - Target event document ID
 * @param {object} [options]
 * @param {Function} [options.enqueuer] - Optional custom enqueuer override
 * @returns {Promise<{ enqueued: boolean, eventId: string, error?: string }>}
 */
export async function dispatchContinuationTask(eventId, options = {}) {
  if (!eventId || typeof eventId !== "string") {
    console.warn("[taskDispatcher] Cannot dispatch continuation task without valid eventId");
    return { enqueued: false, eventId: null, error: "invalid_event_id" };
  }

  const payload = { eventId };

  try {
    const enqueuer = options.enqueuer || customEnqueuer;
    if (enqueuer) {
      await enqueuer(payload, options);
      dispatchHistory.push({ eventId, timestamp: Date.now(), success: true, custom: true });
      return { enqueued: true, eventId };
    }

    const app = getAdminApp();
    const functionsClient = getFunctions(app);
    const queue = functionsClient.taskQueue(CONTINUATION_TASK_FUNCTION_NAME);

    await queue.enqueue(payload);
    dispatchHistory.push({ eventId, timestamp: Date.now(), success: true, custom: false });
    return { enqueued: true, eventId };
  } catch (err) {
    // Contract: Dispatch failure does NOT roll back committed state and does NOT increment retryCount.
    // The durable continuation remains in Firestore with status: 'pending', leaseWorkerId: null,
    // and will be safely recovered by the 1-minute scheduled fallback sweeper.
    console.warn(
      `[taskDispatcher] Cloud Task enqueue failed for event ${eventId}: ${err.message}. ` +
      `Durable continuation remains committed in Firestore; 1-minute scheduled fallback sweeper will recover it.`
    );
    dispatchHistory.push({ eventId, timestamp: Date.now(), success: false, error: err.message });
    return { enqueued: false, eventId, error: err.message };
  }
}

// ============================================================================
// Test Support Utilities
// ============================================================================

export function setTaskEnqueuer(enqueuerFn) {
  customEnqueuer = enqueuerFn;
  return () => {
    customEnqueuer = null;
  };
}

export function resetTaskEnqueuer() {
  customEnqueuer = null;
}

export function getTaskDispatchHistory() {
  return [...dispatchHistory];
}

export function clearTaskDispatchHistory() {
  dispatchHistory.length = 0;
}
