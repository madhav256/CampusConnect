/**
 * CampusConnect M24.3 Server-Side Cloud Functions and Microservice Workers
 * Registered Firebase Cloud Functions (v2) conforming strictly to ADR-024 / Revision 33
 */

import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getAdminDb } from "../../scripts/adminClient.mjs";

import {
  cancelRsvpWithPromotion as handleCancelRsvpWithPromotion,
  claimWaitlistOffer as handleClaimWaitlistOffer,
  declineWaitlistOffer as handleDeclineWaitlistOffer,
  leaveWaitlist as handleLeaveWaitlist,
  promoteWaitlistCandidates as handlePromoteWaitlistCandidates,
  fastForwardWaitlistHead as handleFastForwardWaitlistHead,
  HttpsError,
} from "./callableFunctions.js";
import { deliverWaitlistOfferNotification as handleDeliverNotification } from "./outboxWorker.js";
import { processExpiredOffers as handleProcessExpiredOffers } from "./expirySweeper.js";
import { processWaitlistContinuations as handleProcessContinuations } from "./continuationWorker.js";
import { normalizeQueueHead } from "./queueHeadNormalization.js";
import { dispatchContinuationTask } from "./taskDispatcher.js";

// ============================================================================
// 1. Registered HTTPS Callable Functions (ADR-024 Rev 33 / PW-4, 5, 7B, 8, 9, 12)
// ============================================================================

/**
 * PW-4: Authenticated confirmed attendee withdraws with promotion.
 */
export const cancelRsvpWithPromotion = onCall(async (request) => {
  return await handleCancelRsvpWithPromotion(request.data, request.auth, getAdminDb());
});

/**
 * PW-8 / PW-8B: Authenticated offered candidate claims seat.
 */
export const claimWaitlistOffer = onCall(async (request) => {
  return await handleClaimWaitlistOffer(request.data, request.auth, getAdminDb());
});

/**
 * PW-9A / PW-9B: Authenticated offered candidate declines seat.
 */
export const declineWaitlistOffer = onCall(async (request) => {
  return await handleDeclineWaitlistOffer(request.data, request.auth, getAdminDb());
});

/**
 * PW-5 Head: Authenticated waiting candidate at head leaves queue.
 */
export const leaveWaitlist = onCall(async (request) => {
  return await handleLeaveWaitlist(request.data, request.auth, getAdminDb());
});

/**
 * PW-7B: Organizer or on-access batch promotion into vacancies.
 */
export const promoteWaitlistCandidates = onCall(async (request) => {
  return await handlePromoteWaitlistCandidates(request.data, request.auth, getAdminDb());
});

/**
 * PW-12: System/Admin recovery helper to fast-forward head pointer past holes.
 */
export const fastForwardWaitlistHead = onCall(async (request) => {
  return await handleFastForwardWaitlistHead(request.data, request.auth, getAdminDb());
});

// ============================================================================
// 2. Registered Scheduled, Cloud Task & Background Trigger Workers
// ============================================================================

/**
 * ADR-024 Rev 33 / Contract 9: Primary Cloud Task queue handler for durable waitlist continuations.
 * Triggered asynchronously by producers and worker requeues immediately after commit.
 */
export const processWaitlistContinuationTask = onTaskDispatched(
  {
    region: "us-central1",
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 10,
    },
    rateLimits: {
      maxConcurrentDispatches: 6,
    },
  },
  async (request) => {
    const data = request.data;
    if (!data || !data.eventId || typeof data.eventId !== "string") {
      throw new HttpsError("invalid-argument", "Missing or invalid eventId in continuation task payload");
    }
    return await handleProcessContinuations(data, getAdminDb());
  }
);

/**
 * PW-10 / Contract 6: 1-minute scheduled sweeper for expired waitlist offers.
 */
export const processExpiredOffers = onSchedule(
  {
    schedule: "every 1 minutes",
    timeoutSeconds: 120,
  },
  async () => {
    return await handleProcessExpiredOffers({}, getAdminDb());
  }
);

/**
 * Contract 9: 1-minute fallback continuation sweeper.
 * Recovers pending work if Cloud Task enqueue fails or task is lost before processing.
 */
export const processWaitlistContinuations = onSchedule(
  {
    schedule: "every 1 minutes",
    timeoutSeconds: 120,
  },
  async () => {
    return await handleProcessContinuations({}, getAdminDb());
  }
);

/**
 * PW-8 / Contract 8: Document-created trigger on outbox records.
 */
export const deliverWaitlistOfferNotification = onDocumentCreated(
  "eventWaitlistOutbox/{outboxId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const data = snap.data();
    return await handleDeliverNotification(
      {
        eventId: data.eventId,
        candidateSequence: data.candidateSequence,
        outboxId: event.params.outboxId,
      },
      getAdminDb()
    );
  }
);

// ============================================================================
// 3. Core Module Re-Exports (For programmatic & unit test access)
// ============================================================================

export {
  normalizeQueueHead,
  HttpsError,
  dispatchContinuationTask,
  handleCancelRsvpWithPromotion,
  handleClaimWaitlistOffer,
  handleDeclineWaitlistOffer,
  handleLeaveWaitlist,
  handlePromoteWaitlistCandidates,
  handleFastForwardWaitlistHead,
  handleDeliverNotification,
  handleProcessExpiredOffers,
  handleProcessContinuations,
};
