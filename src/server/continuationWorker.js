import { getAdminDb, FieldValue, Timestamp } from "../../scripts/adminClient.mjs";
import { normalizeQueueHead } from "./queueHeadNormalization.js";
import { dispatchContinuationTask } from "./taskDispatcher.js";

/**
 * Helper to resolve normalizationRequired boolean safely
 */
function resolveNormalizationRequired(continuationDoc) {
  if (!continuationDoc) return false;
  return Boolean(continuationDoc.normalizationRequired);
}

/**
 * processWaitlistContinuations (Contract 9)
 * Executes durable continuation jobs for split promotion batches and bounded queue-head normalizations.
 * Enforces bifurcated dispatch, lease recovery, and generation fencing.
 *
 * @param {object} params
 * @param {string} params.eventId - Event document ID
 * @param {string} [params.workerInstanceId] - Optional unique worker ID
 * @param {FirebaseFirestore.Firestore} [db] - Optional Firestore instance
 * @returns {Promise<object>}
 */
export async function processWaitlistContinuations(params = {}, db) {
  const firestore = (db && (db.runTransaction || db.collection))
    ? db
    : (params && (params.runTransaction || params.collection))
    ? params
    : getAdminDb();
  const { eventId } = params || {};
  if (!eventId) {
    const pendingSnap = await firestore
      .collection("eventWaitlistContinuations")
      .where("status", "in", ["pending", "processing"])
      .limit(25)
      .get();
    const results = [];
    for (const docSnap of pendingSnap.docs) {
      const targetEventId = docSnap.data()?.eventId || docSnap.id.replace(/^continuation_/, "");
      try {
        const res = await processWaitlistContinuations({ eventId: targetEventId }, firestore);
        results.push({ eventId: targetEventId, ...res });
      } catch (err) {
        results.push({ eventId: targetEventId, error: err.message });
      }
    }
    return { batchSweeper: true, processedCount: results.length, results };
  }
  const workerInstanceId =
    params.workerId ||
    params.workerInstanceId ||
    `continuation_worker_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let continuationRef = firestore.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`);
  const nowMillis = Date.now();
  const leaseDurationMs = 30000; // 30s

  // Phase 1: Atomic Lease Acquisition & Generation Fencing
  let acquiredGeneration = null;

  try {
    const acquireResult = await firestore.runTransaction(async (transaction) => {
      let snap = await transaction.get(continuationRef);
      if (!snap.exists) {
        const altRef = firestore.collection("eventWaitlistContinuations").doc(eventId);
        const altSnap = await transaction.get(altRef);
        if (altSnap.exists) {
          continuationRef = altRef;
          snap = altSnap;
        }
      }
      if (!snap.exists) return { status: "not_found" };
      const doc = snap.data();

      if (["completed", "failed_integrity", "failed_terminal_retry"].includes(doc.status)) {
        return { status: "terminal", currentStatus: doc.status };
      }

      const leaseExpiresMillis = doc.leaseExpiresAt?.toMillis
        ? doc.leaseExpiresAt.toMillis()
        : doc.leaseExpiresAt?.seconds
        ? doc.leaseExpiresAt.seconds * 1000
        : 0;
      const isLeaseActive = doc.leaseWorkerId !== null && leaseExpiresMillis >= nowMillis;

      if (isLeaseActive) {
        return { status: "lease_locked", disposition: "skipped_locked" };
      }

      if ((doc.retryCount || 0) >= 5) {
        transaction.update(continuationRef, {
          status: "failed_terminal_retry",
          leaseWorkerId: null,
          leaseExpiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { status: "failed_terminal_retry" };
      }

      acquiredGeneration = doc.generation || 0;

      transaction.update(continuationRef, {
        status: "processing",
        leaseWorkerId: workerInstanceId,
        leaseExpiresAt: Timestamp.fromMillis(nowMillis + leaseDurationMs),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { status: "acquired", generation: acquiredGeneration };
    });

    if (acquireResult.status === "lease_locked") {
      return { success: true, disposition: "skipped_locked", status: "lease_locked" };
    }
    if (acquireResult.status === "terminal") {
      return {
        success: acquireResult.currentStatus === "completed",
        disposition: acquireResult.currentStatus,
        status: acquireResult.currentStatus,
      };
    }
    if (acquireResult.status === "not_found") {
      return { success: false, disposition: "not_found", status: "not_found" };
    }
    if (acquireResult.status !== "acquired") {
      return { success: false, ...acquireResult };
    }
  } catch (err) {
    return { success: false, status: "lease_acquisition_failed", error: err.message };
  }

  // Phase 2: Bifurcated Worker Dispatch & In-Transaction Lease Ownership Fencing
  let disposition = null;

  try {
    disposition = await firestore.runTransaction(async (transaction) => {
      const eventRef = firestore.collection("events").doc(eventId);
      const capRef = firestore.collection("eventCapacities").doc(eventId);

      const [continuationSnap, eventSnap, capSnap] = await Promise.all([
        transaction.get(continuationRef),
        transaction.get(eventRef),
        transaction.get(capRef),
      ]);

      if (!continuationSnap.exists || !eventSnap.exists || !capSnap.exists) {
        return { type: "failed_integrity", errorMessage: "Missing companion documents" };
      }

      const liveContinuation = continuationSnap.data();
      const event = eventSnap.data();
      const coordinator = capSnap.data();

      // Mandatory In-Transaction Lease Guard
      const currentNow = Date.now();
      const leaseExpiresMillis = liveContinuation.leaseExpiresAt?.toMillis ? liveContinuation.leaseExpiresAt.toMillis() : (liveContinuation.leaseExpiresAt?.seconds ? liveContinuation.leaseExpiresAt.seconds * 1000 : 0);
      const isOwner = liveContinuation.leaseWorkerId === workerInstanceId;
      const isLeaseActive = leaseExpiresMillis >= currentNow;

      if (!isOwner || !isLeaseActive) {
        return { type: "aborted_lease_revoked" };
      }

      if (event.registrationStatus === "migration_locked") {
        transaction.update(continuationRef, {
          status: "pending",
          leaseWorkerId: null,
          leaseExpiresAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { type: "migration_locked_deferred" };
      }

      const isNewerGeneration = liveContinuation.generation !== acquiredGeneration;
      const liveNormRequired = resolveNormalizationRequired(liveContinuation);

      // Branch A: Head-Normalization Continuation
      if (liveContinuation.continuationType === "head_normalization") {
        const scanStartSeq = liveContinuation.intermediateHeadSequence || coordinator.headSequence;

        if (liveContinuation.intermediateHeadSequence < scanStartSeq) {
          return { type: "aborted_earlier_pointer_stale" };
        }

        if (coordinator.headSequence >= coordinator.nextSequence) {
          const newCoordHead = Math.max(coordinator.headSequence, coordinator.nextSequence);
          transaction.update(capRef, {
            headSequence: newCoordHead,
            waitlistCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(continuationRef, {
            intermediateHeadSequence: newCoordHead,
            normalizationRequired: isNewerGeneration && liveNormRequired,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { type: "completed" };
        }

        const outcome = await normalizeQueueHead(transaction, eventId, coordinator, coordinator.headSequence, 10, firestore);

        if (outcome.outcome === "candidateFound") {
          transaction.update(capRef, {
            headSequence: outcome.candidateSequence,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(continuationRef, {
            intermediateHeadSequence: outcome.candidateSequence,
            normalizationRequired: isNewerGeneration && liveNormRequired,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { type: "completed" };
        }

        if (outcome.outcome === "queueExhausted") {
          transaction.update(capRef, {
            headSequence: coordinator.nextSequence,
            waitlistCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(continuationRef, {
            intermediateHeadSequence: coordinator.nextSequence,
            normalizationRequired: isNewerGeneration && liveNormRequired,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { type: "completed" };
        }

        if (outcome.outcome === "limitReached") {
          transaction.update(capRef, {
            headSequence: outcome.intermediateHeadSequence,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.update(continuationRef, {
            intermediateHeadSequence: outcome.intermediateHeadSequence,
            normalizationRequired: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { type: "requeue", intermediateHeadSequence: outcome.intermediateHeadSequence, normalizationRequired: true };
        }

        return { type: "failed_integrity", errorMessage: `Integrity violation: ${outcome.details}` };
      }

      // Branch B: Promotion Continuation
      const liveVacancies = (event.capacity || 0) - (coordinator.confirmedCount + coordinator.offeredCount);
      const continuationQuota = liveContinuation.vacanciesRemaining || 0;

      const eventStartMillis = event.startAt?.toMillis ? event.startAt.toMillis() : (event.startAt?.seconds ? event.startAt.seconds * 1000 : 0);
      const isKickoffFrozen = eventStartMillis && currentNow >= eventStartMillis;

      if (isKickoffFrozen) {
        transaction.update(continuationRef, {
          status: "completed",
          leaseWorkerId: null,
          leaseExpiresAt: null,
          vacanciesRemaining: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { type: "completed" };
      }

      // If full or no vacancies/quota, check if normalization is still required
      if (liveVacancies <= 0 || continuationQuota <= 0 || coordinator.waitlistCount <= 0 || coordinator.headSequence >= coordinator.nextSequence) {
        if (liveNormRequired) {
          const normOutcome = await normalizeQueueHead(transaction, eventId, coordinator, coordinator.headSequence, 10, firestore);
          if (normOutcome.outcome === "candidateFound") {
            transaction.update(capRef, {
              headSequence: normOutcome.candidateSequence,
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(continuationRef, {
              intermediateHeadSequence: normOutcome.candidateSequence,
              normalizationRequired: false,
              vacanciesRemaining: 0,
              updatedAt: FieldValue.serverTimestamp(),
            });
            return { type: "completed" };
          }
          if (normOutcome.outcome === "limitReached") {
            transaction.update(capRef, {
              headSequence: normOutcome.intermediateHeadSequence,
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(continuationRef, {
              intermediateHeadSequence: normOutcome.intermediateHeadSequence,
              normalizationRequired: true,
              vacanciesRemaining: 0,
              updatedAt: FieldValue.serverTimestamp(),
            });
            return { type: "requeue", intermediateHeadSequence: normOutcome.intermediateHeadSequence, vacanciesRemaining: 0, normalizationRequired: true };
          }
        }

        transaction.update(continuationRef, {
          vacanciesRemaining: 0,
          normalizationRequired: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { type: "completed" };
      }

      // Promote batch
      const targetBatch = Math.min(liveVacancies, continuationQuota, coordinator.waitlistCount, liveContinuation.targetBatch || 5, 5);

      const candidatesToPromote = [];
      let slotReadsCount = 0;
      let currentScanSeq = coordinator.headSequence;
      let queueExhausted = false;
      let limitReached = false;
      let intermediateHeadSeq = currentScanSeq;

      while (candidatesToPromote.length < targetBatch && slotReadsCount < 10) {
        const maxScan = Math.min(10, 10 - slotReadsCount);
        const outcome = await normalizeQueueHead(transaction, eventId, coordinator, currentScanSeq, maxScan, firestore);
        slotReadsCount += outcome.slotReadsConsumed;

        if (outcome.outcome === "candidateFound") {
          candidatesToPromote.push({
            candidateSeq: outcome.candidateSequence,
            userId: outcome.candidateSlot.userId,
            slotData: outcome.candidateSlot,
            memberData: outcome.candidateMember,
          });
          currentScanSeq = outcome.candidateSequence + 1;
        } else if (outcome.outcome === "queueExhausted") {
          queueExhausted = true;
          break;
        } else if (outcome.outcome === "limitReached") {
          limitReached = true;
          intermediateHeadSeq = outcome.intermediateHeadSequence;
          break;
        } else if (outcome.outcome === "integrityError") {
          return { type: "failed_integrity", errorMessage: `Integrity error: ${outcome.details}` };
        }
      }

      const M = candidatesToPromote.length;
      const newHeadSeq = M > 0 ? candidatesToPromote[M - 1].candidateSeq + 1 : intermediateHeadSeq;

      if (M > 0) {
        const offerDurationMs = 24 * 60 * 60 * 1000;
        const offerDeadlineMillis = Math.min(currentNow + offerDurationMs, eventStartMillis || (currentNow + offerDurationMs));
        const offerExpiresAt = Timestamp.fromMillis(offerDeadlineMillis);

        for (const candidate of candidatesToPromote) {
          transaction.update(firestore.collection("eventWaitlistSlots").doc(`${eventId}_${candidate.candidateSeq}`), {
            status: "offered",
            offeredAt: FieldValue.serverTimestamp(),
            offerExpiresAt,
            updatedAt: FieldValue.serverTimestamp(),
          });

          transaction.update(firestore.collection("eventWaitlistMembers").doc(`${eventId}_${candidate.userId}`), {
            status: "offered",
            offeredAt: FieldValue.serverTimestamp(),
            offerExpiresAt,
            updatedAt: FieldValue.serverTimestamp(),
          });

          transaction.set(firestore.collection("eventWaitlistOutbox").doc(`${eventId}_${candidate.candidateSeq}`), {
            id: `outbox_${eventId}_${candidate.candidateSeq}`,
            eventId,
            candidateSequence: candidate.candidateSeq,
            recipientId: candidate.userId,
            type: "event_waitlist_offer",
            status: "pending",
            offerExpiresAt,
            lockedUntil: null,
            deliveredAt: null,
            retryCount: 0,
            errorMessage: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.update(capRef, {
          offeredCount: FieldValue.increment(M),
          waitlistCount: FieldValue.increment(-M),
          headSequence: newHeadSeq,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const postLiveVacancies = liveVacancies - M;
      const postContinuationQuota = continuationQuota - M;
      const postWaitlist = coordinator.waitlistCount - M;
      const hasResidualDemand = (postContinuationQuota <= 0) && (postLiveVacancies > 0) && (postWaitlist > 0) && (newHeadSeq < coordinator.nextSequence);

      const resolvedNormRequired = isNewerGeneration ? liveNormRequired : (limitReached ? true : false);

      if (hasResidualDemand) {
        const freshQuota = Math.min(postLiveVacancies, postWaitlist);
        transaction.update(continuationRef, {
          intermediateHeadSequence: newHeadSeq,
          vacanciesRemaining: freshQuota,
          reason: "residual_demand_chained",
          generation: liveContinuation.generation + 1,
          normalizationRequired: resolvedNormRequired,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          type: "requeue_residual_demand",
          intermediateHeadSequence: newHeadSeq,
          vacanciesRemaining: freshQuota,
          generationAlreadyIncremented: true,
        };
      } else if (postLiveVacancies > 0 && postContinuationQuota > 0 && postWaitlist > 0) {
        transaction.update(continuationRef, {
          intermediateHeadSequence: newHeadSeq,
          vacanciesRemaining: postContinuationQuota,
          normalizationRequired: resolvedNormRequired,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          type: "requeue",
          intermediateHeadSequence: newHeadSeq,
          vacanciesRemaining: postContinuationQuota,
        };
      } else {
        const nextHead = queueExhausted ? coordinator.nextSequence : newHeadSeq;
        if (queueExhausted) {
          transaction.update(capRef, {
            headSequence: nextHead,
            waitlistCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        transaction.update(continuationRef, {
          intermediateHeadSequence: nextHead,
          vacanciesRemaining: 0,
          normalizationRequired: resolvedNormRequired,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { type: "completed" };
      }
    });
  } catch (err) {
    // Phase 4: Fenced Outer Catch Block
    try {
      await firestore.runTransaction(async (transaction) => {
        const snap = await transaction.get(continuationRef);
        if (!snap.exists) return;
        const liveDoc = snap.data();

        const currentNow = Date.now();
        const leaseExpiresMillis = liveDoc.leaseExpiresAt?.toMillis ? liveDoc.leaseExpiresAt.toMillis() : (liveDoc.leaseExpiresAt?.seconds ? liveDoc.leaseExpiresAt.seconds * 1000 : 0);
        const isOwner = liveDoc.leaseWorkerId === workerInstanceId;
        const isLeaseActive = leaseExpiresMillis >= currentNow;
        const isGenCurrent = liveDoc.generation === acquiredGeneration;

        if (!isOwner || !isLeaseActive || !isGenCurrent) return;

        const nextRetry = (liveDoc.retryCount || 0) + 1;
        if (nextRetry >= 5) {
          transaction.update(continuationRef, {
            status: "failed_terminal_retry",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            retryCount: nextRetry,
            errorMessage: `Transient retry limit exceeded: ${err.message}`,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          transaction.update(continuationRef, {
            status: "pending",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            retryCount: nextRetry,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (catchErr) {
      console.warn("[processWaitlistContinuations] Error recovery transaction warning:", catchErr.message);
    }

    return { status: "error", error: err.message };
  }

  // Phase 3: Unified Generation-Fenced Terminal Update
  if (!disposition || disposition.type === "aborted_lease_revoked" || disposition.type === "migration_locked_deferred") {
    return { status: disposition?.type || "aborted" };
  }

  let followOnDispatchNeeded = false;

  try {
    await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(continuationRef);
      if (!snap.exists) return;
      const liveDoc = snap.data();

      const currentNow = Date.now();
      const leaseExpiresMillis = liveDoc.leaseExpiresAt?.toMillis ? liveDoc.leaseExpiresAt.toMillis() : (liveDoc.leaseExpiresAt?.seconds ? liveDoc.leaseExpiresAt.seconds * 1000 : 0);
      const isOwner = liveDoc.leaseWorkerId === workerInstanceId;
      const isLeaseActive = leaseExpiresMillis >= currentNow;

      if (!isOwner || !isLeaseActive) {
        return; // Lease lost or expired
      }

      if (disposition.generationAlreadyIncremented) {
        if (liveDoc.generation === acquiredGeneration + 1) {
          transaction.update(continuationRef, {
            status: "pending",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            retryCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          transaction.update(continuationRef, {
            status: "pending",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            retryCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      } else if (liveDoc.generation === acquiredGeneration) {
        if (disposition.type === "completed") {
          transaction.update(continuationRef, {
            status: "completed",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            vacanciesRemaining: 0,
            normalizationRequired: false,
            retryCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (disposition.type === "requeue") {
          transaction.update(continuationRef, {
            status: "pending",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            retryCount: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (disposition.type === "failed_integrity") {
          transaction.update(continuationRef, {
            status: "failed_integrity",
            leaseWorkerId: null,
            leaseExpiresAt: null,
            errorMessage: disposition.errorMessage,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      } else {
        // Newer work arrived while processing; preserve it and release lease
        followOnDispatchNeeded = true;
        transaction.update(continuationRef, {
          status: "pending",
          leaseWorkerId: null,
          leaseExpiresAt: null,
          retryCount: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (err) {
    console.warn("[processWaitlistContinuations] Phase 3 release warning:", err.message);
  }

  const dispositionType = typeof disposition === "string" ? disposition : (disposition?.type || disposition?.status || "unknown");

  if (["requeue", "requeue_residual_demand"].includes(dispositionType) || followOnDispatchNeeded) {
    await dispatchContinuationTask(eventId);
  }

  return {
    success: !["failed_integrity", "failed_terminal_retry", "lease_acquisition_failed"].includes(dispositionType),
    disposition: dispositionType,
    status: dispositionType,
    details: disposition,
  };
}
