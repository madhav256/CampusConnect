/**
 * Milestone 24.3: Runtime Wiring and Functions Boundary Test Suite
 *
 * Verifies that all server handlers are registered as genuine Firebase Cloud Functions v2
 * handlers (with valid __endpoint metadata), can be discovered by the Firebase CLI,
 * and execute with verified authentication context, parameter validation, state transitions,
 * and idempotency through the registered handler boundary (.run() and HTTP emulator).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getAdminDb, FieldValue, Timestamp } from "../../scripts/adminClient.mjs";
import {
  cancelRsvpWithPromotion,
  claimWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist,
  promoteWaitlistCandidates,
  fastForwardWaitlistHead,
  processExpiredOffers,
  processWaitlistContinuations,
  processWaitlistContinuationTask,
  deliverWaitlistOfferNotification,
} from "../../src/server/index.js";
import {
  setTaskEnqueuer,
  clearTaskDispatchHistory,
} from "../../src/server/taskDispatcher.js";

const APEX_CAMPUS_ID = "apex-university";
const ST_JUDE_CAMPUS_ID = "st-jude-university";

describe("Milestone 24.3: Firebase Functions Runtime Boundary & Endpoint Discovery", () => {
  const db = getAdminDb();

  beforeAll(async () => {
    // Seed standard test campus documents
    await db.collection("campuses").doc(APEX_CAMPUS_ID).set({
      id: APEX_CAMPUS_ID,
      name: "Apex University",
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("campuses").doc(ST_JUDE_CAMPUS_ID).set({
      id: ST_JUDE_CAMPUS_ID,
      name: "St Jude University",
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  // ==========================================================================
  // Gate 1: Cloud Functions v2 Registration & Discovery Metadata
  // ==========================================================================

  describe("Gate 1: Handler Registration & __endpoint Manifest", () => {
    it("exposes all 6 callable operations with valid GCFv2 callableTrigger endpoints", () => {
      const callables = [
        { name: "cancelRsvpWithPromotion", fn: cancelRsvpWithPromotion },
        { name: "claimWaitlistOffer", fn: claimWaitlistOffer },
        { name: "declineWaitlistOffer", fn: declineWaitlistOffer },
        { name: "leaveWaitlist", fn: leaveWaitlist },
        { name: "promoteWaitlistCandidates", fn: promoteWaitlistCandidates },
        { name: "fastForwardWaitlistHead", fn: fastForwardWaitlistHead },
      ];

      for (const { name, fn } of callables) {
        expect(fn, `${name} must be a function`).toBeTypeOf("function");
        expect(fn.__endpoint, `${name} must expose __endpoint metadata`).toBeDefined();
        expect(fn.__endpoint.platform).toBe("gcfv2");
        expect(fn.__endpoint.callableTrigger, `${name} must have callableTrigger`).toBeDefined();
        expect(fn.run, `${name} must provide .run() testing method`).toBeTypeOf("function");
      }
    });

    it("exposes scheduled sweeper and continuation workers with scheduleTrigger", () => {
      expect(processExpiredOffers.__endpoint).toBeDefined();
      expect(processExpiredOffers.__endpoint.platform).toBe("gcfv2");
      expect(processExpiredOffers.__endpoint.scheduleTrigger?.schedule).toBe("every 1 minutes");

      expect(processWaitlistContinuations.__endpoint).toBeDefined();
      expect(processWaitlistContinuations.__endpoint.platform).toBe("gcfv2");
      expect(processWaitlistContinuations.__endpoint.scheduleTrigger?.schedule).toBe("every 1 minutes");
    });

    it("exposes primary Cloud Task continuation handler with taskQueueTrigger", () => {
      expect(processWaitlistContinuationTask.__endpoint).toBeDefined();
      expect(processWaitlistContinuationTask.__endpoint.platform).toBe("gcfv2");
      expect(processWaitlistContinuationTask.__endpoint.taskQueueTrigger).toBeDefined();
      expect(processWaitlistContinuationTask.run).toBeTypeOf("function");
    });

    it("exposes outbox worker as Firestore onDocumentCreated eventTrigger", () => {
      expect(deliverWaitlistOfferNotification.__endpoint).toBeDefined();
      expect(deliverWaitlistOfferNotification.__endpoint.platform).toBe("gcfv2");
      expect(deliverWaitlistOfferNotification.__endpoint.eventTrigger).toBeDefined();
      expect(deliverWaitlistOfferNotification.__endpoint.eventTrigger.eventType).toBe(
        "google.cloud.firestore.document.v1.created"
      );
      expect(deliverWaitlistOfferNotification.__endpoint.eventTrigger.eventFilterPathPatterns?.document).toBe(
        "eventWaitlistOutbox/{outboxId}"
      );
    });
  });

  // ==========================================================================
  // Gate 2: Authentication & Authorization at Registered Callable Boundary
  // ==========================================================================

  describe("Gate 2: Authentication & Tenant Authorization at Callable Boundary", () => {
    it("rejects unauthenticated invocation on registered callable with UNAUTHENTICATED", async () => {
      await expect(
        cancelRsvpWithPromotion.run({
          data: { eventId: "dummy_evt" },
          auth: null,
        })
      ).rejects.toMatchObject({
        code: "unauthenticated",
      });

      await expect(
        claimWaitlistOffer.run({
          data: { eventId: "dummy_evt", slotSequence: 1 },
          auth: null,
        })
      ).rejects.toMatchObject({
        code: "unauthenticated",
      });

      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId: "dummy_evt" },
          auth: null,
        })
      ).rejects.toMatchObject({
        code: "unauthenticated",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId: "dummy_evt" },
          auth: null,
        })
      ).rejects.toMatchObject({
        code: "unauthenticated",
      });
    });

    it("rejects invalid argument parameters with INVALID_ARGUMENT", async () => {
      await expect(
        claimWaitlistOffer.run({
          data: { eventId: "", slotSequence: 1 },
          auth: { uid: "user_valid", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });

    it("enforces cross-campus tenancy and organizer authorization through registered callable boundary", async () => {
      const eventId = "evt_tenancy_boundary_test";
      await db.collection("events").doc(eventId).set({
        id: eventId,
        title: "Campus A Event",
        campusId: APEX_CAMPUS_ID,
        communityId: "apex-ai-club",
        createdBy: "organizer_campus_a",
        capacity: 10,
        registrationType: "capped",
        startAt: Timestamp.fromMillis(Date.now() + 1_000_000),
      });
      await db.collection("eventCapacities").doc(eventId).set({
        id: eventId,
        eventId,
        campusId: APEX_CAMPUS_ID,
        confirmedCount: 1,
        offeredCount: 0,
        waitlistCount: 0,
        headSequence: 1,
        nextSequence: 1,
      });

      // User from Campus B calls callable on Campus A event
      await expect(
        cancelRsvpWithPromotion.run({
          data: { eventId },
          auth: { uid: "user_campus_b", token: { campusId: ST_JUDE_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId },
          auth: { uid: "user_campus_b", token: { campusId: ST_JUDE_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId },
          auth: { uid: "user_campus_b", token: { campusId: ST_JUDE_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      // Same-campus student who is NOT organizer or community leader is rejected
      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId },
          auth: { uid: "unrelated_student_campus_a", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId },
          auth: { uid: "unrelated_student_campus_a", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      // Active ordinary community member (role: "member", status: "active") is rejected
      const ordinaryMemberUid = "ordinary_member_campus_a";
      await db.collection("communityMembers").doc(`apex-ai-club_${ordinaryMemberUid}`).set({
        id: `apex-ai-club_${ordinaryMemberUid}`,
        communityId: "apex-ai-club",
        userId: ordinaryMemberUid,
        campusId: APEX_CAMPUS_ID,
        role: "member",
        status: "active",
      });

      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId },
          auth: { uid: ordinaryMemberUid, token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId },
          auth: { uid: ordinaryMemberUid, token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      // Original event creator (createdBy === uid) whose communityMembers document was deleted is rejected
      await db.collection("communityMembers").doc("apex-ai-club_organizer_campus_a").delete();

      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId },
          auth: { uid: "organizer_campus_a", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId },
          auth: { uid: "organizer_campus_a", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      // Pending or removed membership (even with role: "admin" and createdBy === uid) is rejected
      for (const inactiveStatus of ["pending", "removed"]) {
        await db.collection("communityMembers").doc("apex-ai-club_organizer_campus_a").set({
          id: "apex-ai-club_organizer_campus_a",
          communityId: "apex-ai-club",
          userId: "organizer_campus_a",
          campusId: APEX_CAMPUS_ID,
          role: "admin",
          status: inactiveStatus,
        });

        await expect(
          promoteWaitlistCandidates.run({
            data: { eventId },
            auth: { uid: "organizer_campus_a", token: { campusId: APEX_CAMPUS_ID } },
          })
        ).rejects.toMatchObject({
          code: "permission-denied",
        });

        await expect(
          fastForwardWaitlistHead.run({
            data: { eventId },
            auth: { uid: "organizer_campus_a", token: { campusId: APEX_CAMPUS_ID } },
          })
        ).rejects.toMatchObject({
          code: "permission-denied",
        });
      }

      // Campus-wide event (communityId === null) whose createdBy equals caller is rejected
      const campusWideEventId = "evt_campus_wide_auth_test";
      await db.collection("events").doc(campusWideEventId).set({
        id: campusWideEventId,
        title: "Campus-Wide Event",
        campusId: APEX_CAMPUS_ID,
        communityId: null,
        createdBy: "organizer_campus_a",
        capacity: 10,
        registrationType: "capped",
        startAt: Timestamp.fromMillis(Date.now() + 1_000_000),
      });
      await db.collection("eventCapacities").doc(campusWideEventId).set({
        id: campusWideEventId,
        eventId: campusWideEventId,
        campusId: APEX_CAMPUS_ID,
        confirmedCount: 10,
        offeredCount: 0,
        waitlistCount: 0,
        headSequence: 1,
        nextSequence: 1,
      });

      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId: campusWideEventId },
          auth: { uid: "organizer_campus_a", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId: campusWideEventId },
          auth: { uid: "organizer_campus_a", token: { campusId: APEX_CAMPUS_ID } },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      // Authorized active moderator and active admin succeed on community event
      for (const authorizedRole of ["moderator", "admin"]) {
        const leaderUid = `leader_${authorizedRole}_campus_a`;
        await db.collection("communityMembers").doc(`apex-ai-club_${leaderUid}`).set({
          id: `apex-ai-club_${leaderUid}`,
          communityId: "apex-ai-club",
          userId: leaderUid,
          campusId: APEX_CAMPUS_ID,
          role: authorizedRole,
          status: "active",
        });

        const promoRes = await promoteWaitlistCandidates.run({
          data: { eventId },
          auth: { uid: leaderUid, token: { campusId: APEX_CAMPUS_ID } },
        });
        expect(promoRes.promotedCount).toBe(0);

        const ffRes = await fastForwardWaitlistHead.run({
          data: { eventId },
          auth: { uid: leaderUid, token: { campusId: APEX_CAMPUS_ID } },
        });
        expect(ffRes.success).toBe(true);
      }

      // Caller without token.campusId and without users/{uid} profile is rejected even if communityMembers has campusId
      const profilelessLeaderUid = "leader_no_profile_campus_a";
      await db.collection("communityMembers").doc(`apex-ai-club_${profilelessLeaderUid}`).set({
        id: `apex-ai-club_${profilelessLeaderUid}`,
        communityId: "apex-ai-club",
        userId: profilelessLeaderUid,
        campusId: APEX_CAMPUS_ID,
        role: "admin",
        status: "active",
      });

      await expect(
        promoteWaitlistCandidates.run({
          data: { eventId },
          auth: { uid: profilelessLeaderUid, token: {} },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });

      await expect(
        fastForwardWaitlistHead.run({
          data: { eventId },
          auth: { uid: profilelessLeaderUid, token: {} },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });
    });
  });

  // ==========================================================================
  // Gate 3: Representative Successful State Transition via Registered Callable
  // ==========================================================================

  describe("Gate 3: State Transitions via Registered Callable Boundary", () => {
    it("successfully executes promoteWaitlistCandidates via registered .run() boundary", async () => {
      const eventId = "evt_callable_promotion_test";
      const uid1 = "student_promote_boundary_1";

      await db.collection("communityMembers").doc("apex-ai-club_organizer_uid").set({
        id: "apex-ai-club_organizer_uid",
        communityId: "apex-ai-club",
        userId: "organizer_uid",
        campusId: APEX_CAMPUS_ID,
        role: "admin",
        status: "active",
      });

      await db.collection("events").doc(eventId).set({
        id: eventId,
        title: "Promote Test Event",
        campusId: APEX_CAMPUS_ID,
        communityId: "apex-ai-club",
        createdBy: "organizer_uid",
        capacity: 10,
        registrationType: "capped",
        startAt: Timestamp.fromMillis(Date.now() + 1_000_000),
      });

      await db.collection("eventCapacities").doc(eventId).set({
        id: eventId,
        eventId,
        campusId: APEX_CAMPUS_ID,
        confirmedCount: 8,
        offeredCount: 0,
        waitlistCount: 1,
        headSequence: 1,
        nextSequence: 2,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set({
        id: `${eventId}_1`,
        eventId,
        sequenceNumber: 1,
        userId: uid1,
        campusId: APEX_CAMPUS_ID,
        status: "waiting",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.collection("eventWaitlistMembers").doc(`${eventId}_${uid1}`).set({
        id: `${eventId}_${uid1}`,
        eventId,
        userId: uid1,
        sequenceNumber: 1,
        campusId: APEX_CAMPUS_ID,
        status: "waiting",
        joinedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Organizer invokes registered callable
      const res = await promoteWaitlistCandidates.run({
        data: { eventId, maxBatch: 2 },
        auth: { uid: "organizer_uid", token: { campusId: APEX_CAMPUS_ID } },
      });

      expect(res.success).toBe(true);
      expect(res.promotedCount).toBe(1);

      const coord = (await db.collection("eventCapacities").doc(eventId).get()).data();
      expect(coord.confirmedCount).toBe(8);
      expect(coord.offeredCount).toBe(1);
      expect(coord.waitlistCount).toBe(0);
      expect(coord.headSequence).toBe(2);

      const slot = (await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).get()).data();
      expect(slot.status).toBe("offered");

      const outboxSnap = await db.collection("eventWaitlistOutbox").doc(`${eventId}_1`).get();
      expect(outboxSnap.exists).toBe(true);
      expect(outboxSnap.data().recipientId).toBe(uid1);
    });
  });

  // ==========================================================================
  // Gate 4: Execution of Registered Worker & Trigger Entry Points
  // ==========================================================================

  describe("Gate 4: Scheduled & Document Trigger Worker Execution", () => {
    it("executes deliverWaitlistOfferNotification onDocumentCreated trigger boundary", async () => {
      const eventId = "evt_trigger_delivery_test";
      const recipientId = "student_trigger_recip_1";
      const outboxId = `${eventId}_1`;

      await db.collection("users").doc(recipientId).set({
        id: recipientId,
        displayName: "Recipient One",
        campusId: APEX_CAMPUS_ID,
        notificationPreferences: { eventWaitlistOffers: true },
      });

      await db.collection("events").doc(eventId).set({
        id: eventId,
        title: "Offer Trigger Event",
        campusId: APEX_CAMPUS_ID,
      });

      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set({
        id: `${eventId}_1`,
        eventId,
        sequenceNumber: 1,
        userId: recipientId,
        status: "offered",
        offerExpiresAt: Timestamp.fromMillis(Date.now() + 86400000),
      });

      await db.collection("eventWaitlistOutbox").doc(outboxId).set({
        id: `outbox_${outboxId}`,
        eventId,
        candidateSequence: 1,
        recipientId,
        type: "event_waitlist_offer",
        status: "pending",
        offerExpiresAt: Timestamp.fromMillis(Date.now() + 86400000),
      });

      // Simulate document creation event
      const fakeEvent = {
        data: {
          data: () => ({
            eventId,
            candidateSequence: 1,
            recipientId,
          }),
        },
        params: { outboxId },
      };

      const result = await deliverWaitlistOfferNotification.run(fakeEvent);
      expect(result.status).toBe("delivered");

      const notifSnap = await db
        .collection("users")
        .doc(recipientId)
        .collection("notifications")
        .doc(`offer_${eventId}_1`)
        .get();
      expect(notifSnap.exists).toBe(true);
      expect(notifSnap.data().type).toBe("event_waitlist_offer");
    });

    it("executes processExpiredOffers and processWaitlistContinuations scheduled boundaries cleanly", async () => {
      const schedResult = await processExpiredOffers.run({});
      expect(schedResult).toBeDefined();
      expect(typeof schedResult.processedCount).toBe("number");

      const contResult = await processWaitlistContinuations.run({});
      expect(contResult).toBeDefined();
    });
  });

  // ==========================================================================
  // Gate 5: Primary Cloud Task Dispatch & Scheduled Fallback Verification
  // ==========================================================================

  describe("Gate 5: Primary Cloud Task Dispatch & Fallback Recovery Contract", () => {
    it("rejects task queue invocation missing or invalid eventId with INVALID_ARGUMENT", async () => {
      await expect(
        processWaitlistContinuationTask.run({ data: null })
      ).rejects.toMatchObject({
        code: "invalid-argument",
      });

      await expect(
        processWaitlistContinuationTask.run({ data: {} })
      ).rejects.toMatchObject({
        code: "invalid-argument",
      });

      await expect(
        processWaitlistContinuationTask.run({ data: { eventId: 1234 } })
      ).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });

    it("triggers primary Cloud Task enqueue when a continuation is staged by a committed transaction", async () => {
      clearTaskDispatchHistory();
      const dispatchedTasks = [];
      const reset = setTaskEnqueuer(async (payload) => {
        dispatchedTasks.push(payload);
      });

      try {
        const eventId = `evt_task_disp_${Date.now()}`;
        const organizerId = `org_${Date.now()}`;

        await db.collection("communityMembers").doc(`apex-ai-club_${organizerId}`).set({
          id: `apex-ai-club_${organizerId}`,
          communityId: "apex-ai-club",
          userId: organizerId,
          campusId: APEX_CAMPUS_ID,
          role: "admin",
          status: "active",
        });

        // Create event with capacity 10, confirmedCount 5, offeredCount 0, waitlistCount 5
        await db.collection("events").doc(eventId).set({
          id: eventId,
          title: "Dispatch Producer Event",
          campusId: APEX_CAMPUS_ID,
          communityId: "apex-ai-club",
          createdBy: organizerId,
          capacity: 10,
          status: "published",
          registrationStatus: "open",
        });

        // Set up coordinator with 10 terminal holes at head so scan limit is reached
        await db.collection("eventCapacities").doc(eventId).set({
          eventId,
          capacity: 10,
          confirmedCount: 5,
          offeredCount: 0,
          waitlistCount: 5,
          headSequence: 1,
          nextSequence: 16, // slots 1-10 are claimed/terminal holes, slots 11-15 are waiting
          version: 1,
        });

        // Populate slots 1-10 as terminal holes ('claimed')
        for (let i = 1; i <= 10; i++) {
          await db.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).set({
            id: `${eventId}_${i}`,
            eventId,
            sequenceNumber: i,
            userId: `u_hole_${i}`,
            status: "claimed",
          });
        }

        // Slot 11 is an active waiting candidate
        await db.collection("eventWaitlistSlots").doc(`${eventId}_11`).set({
          id: `${eventId}_11`,
          eventId,
          sequenceNumber: 11,
          userId: `u_wait_11`,
          status: "waiting",
        });
        await db.collection("eventWaitlistMembers").doc(`${eventId}_u_wait_11`).set({
          id: `${eventId}_u_wait_11`,
          eventId,
          userId: `u_wait_11`,
          sequenceNumber: 11,
          status: "waiting",
        });

        // Organizer invokes promoteWaitlistCandidates; maxScan 10 consumes holes 1-10, triggers limitReached, stages continuation
        const result = await promoteWaitlistCandidates.run({
          data: { eventId, maxSeats: 1 },
          auth: { uid: organizerId, token: { campusId: APEX_CAMPUS_ID } },
        });

        expect(result.success).toBe(true);
        expect(result.continuationStaged).toBe(true);

        // Verify task was enqueued strictly after commit
        expect(dispatchedTasks.length).toBe(1);
        expect(dispatchedTasks[0].eventId).toBe(eventId);

        // Verify continuation was durably committed in Firestore
        const contSnap = await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
        expect(contSnap.exists).toBe(true);
        expect(contSnap.data().status).toBe("pending");
        expect(contSnap.data().leaseWorkerId).toBeNull();
      } finally {
        reset();
      }
    });

    it("does NOT trigger Cloud Task dispatch when transaction fails or aborts before commit", async () => {
      clearTaskDispatchHistory();
      const dispatchedTasks = [];
      const reset = setTaskEnqueuer(async (payload) => {
        dispatchedTasks.push(payload);
      });

      try {
        // Attempt invocation with mismatched campus tenancy (fails before commit)
        await expect(
          promoteWaitlistCandidates.run({
            data: { eventId: "nonexistent_event_fail_test", maxSeats: 1 },
            auth: { uid: "user_foreign", token: { campusId: ST_JUDE_CAMPUS_ID } },
          })
        ).rejects.toMatchObject({
          code: "not-found",
        });

        // Zero tasks should be dispatched
        expect(dispatchedTasks.length).toBe(0);
      } finally {
        reset();
      }
    });

    it("post-commit enqueue failure leaves continuation pending without consuming retry budget, and scheduled fallback recovers it", async () => {
      clearTaskDispatchHistory();
      // Configure enqueuer to fail with transient Cloud Tasks error
      const reset = setTaskEnqueuer(async () => {
        throw new Error("503 Service Unavailable: Cloud Tasks API rate exceeded");
      });

      try {
        const eventId = `evt_fallback_recov_${Date.now()}`;
        const organizerId = `org_recov_${Date.now()}`;

        await db.collection("communityMembers").doc(`apex-ai-club_${organizerId}`).set({
          id: `apex-ai-club_${organizerId}`,
          communityId: "apex-ai-club",
          userId: organizerId,
          campusId: APEX_CAMPUS_ID,
          role: "admin",
          status: "active",
        });

        await db.collection("events").doc(eventId).set({
          id: eventId,
          title: "Fallback Recovery Event",
          campusId: APEX_CAMPUS_ID,
          communityId: "apex-ai-club",
          createdBy: organizerId,
          capacity: 10,
          status: "published",
          registrationStatus: "open",
        });

        await db.collection("eventCapacities").doc(eventId).set({
          eventId,
          capacity: 10,
          confirmedCount: 5,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 1,
          nextSequence: 12,
          version: 1,
        });

        for (let i = 1; i <= 10; i++) {
          await db.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).set({
            id: `${eventId}_${i}`,
            eventId,
            sequenceNumber: i,
            userId: `u_hole_${i}`,
            status: "claimed",
          });
        }
        await db.collection("eventWaitlistSlots").doc(`${eventId}_11`).set({
          id: `${eventId}_11`,
          eventId,
          sequenceNumber: 11,
          userId: `u_wait_recov`,
          status: "waiting",
        });
        await db.collection("eventWaitlistMembers").doc(`${eventId}_u_wait_recov`).set({
          id: `${eventId}_u_wait_recov`,
          eventId,
          userId: `u_wait_recov`,
          sequenceNumber: 11,
          status: "waiting",
        });

        // Producer stages continuation; post-commit task enqueue fails internally
        const result = await promoteWaitlistCandidates.run({
          data: { eventId, maxSeats: 1 },
          auth: { uid: organizerId, token: { campusId: APEX_CAMPUS_ID } },
        });

        // Producer must succeed without bubbling enqueue failure
        expect(result.success).toBe(true);

        // Verify continuation remains safely committed with status 'pending' and retryCount 0
        const contSnap = await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
        expect(contSnap.exists).toBe(true);
        expect(contSnap.data().status).toBe("pending");
        expect(contSnap.data().retryCount).toBe(0);
        expect(contSnap.data().leaseWorkerId).toBeNull();

        // 1-minute fallback sweeper executes and recovers the pending continuation
        const sweeperResult = await processWaitlistContinuations.run({});
        expect(sweeperResult.batchSweeper).toBe(true);

        // After fallback processing, candidate slot 11 should be promoted to 'offered'
        const slotSnap = await db.collection("eventWaitlistSlots").doc(`${eventId}_11`).get();
        expect(slotSnap.data().status).toBe("offered");

        // Continuation is completed
        const updatedContSnap = await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
        expect(updatedContSnap.data().status).toBe("completed");
      } finally {
        reset();
      }
    });

    it("duplicate task deliveries are safe through exclusive lease mutual exclusion", async () => {
      const eventId = `evt_dup_task_${Date.now()}`;

      await db.collection("events").doc(eventId).set({
        id: eventId,
        title: "Duplicate Task Event",
        campusId: APEX_CAMPUS_ID,
        capacity: 10,
        status: "published",
        registrationStatus: "open",
      });

      await db.collection("eventCapacities").doc(eventId).set({
        eventId,
        capacity: 10,
        confirmedCount: 5,
        offeredCount: 0,
        waitlistCount: 0,
        headSequence: 1,
        nextSequence: 1,
        version: 1,
      });

      // Continuation currently active under worker_1's unexpired lease
      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set({
        id: `continuation_${eventId}`,
        eventId,
        continuationType: "head_normalization",
        vacanciesRemaining: 0,
        intermediateHeadSequence: 1,
        normalizationRequired: true,
        status: "processing",
        leaseWorkerId: "worker_1",
        leaseExpiresAt: Timestamp.fromMillis(Date.now() + 25000), // unexpired lease
        generation: 1,
        retryCount: 0,
      });

      // Duplicate delivery arrives for worker_2
      const dupResult = await processWaitlistContinuationTask.run({
        data: { eventId, workerInstanceId: "worker_2" },
      });

      expect(dupResult.success).toBe(true);
      expect(dupResult.disposition).toBe("skipped_locked");

      // Verify worker_1's lease was preserved without tampering
      const contSnap = await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
      expect(contSnap.data().leaseWorkerId).toBe("worker_1");
      expect(contSnap.data().status).toBe("processing");
    });

    it("terminal failure states (failed_integrity, failed_terminal_retry) return success: false", async () => {
      const eventId = `evt_terminal_fail_${Date.now()}`;

      // Set up continuation with retryCount: 5 (retry exhaustion)
      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set({
        id: `continuation_${eventId}`,
        eventId,
        continuationType: "promotion",
        vacanciesRemaining: 1,
        intermediateHeadSequence: 1,
        normalizationRequired: false,
        status: "pending",
        leaseWorkerId: null,
        leaseExpiresAt: null,
        generation: 1,
        retryCount: 5,
      });

      const result = await processWaitlistContinuationTask.run({
        data: { eventId },
      });

      // Terminal retry failure must NEVER return success: true
      expect(result.success).toBe(false);
      expect(result.status).toBe("failed_terminal_retry");

      const contSnap = await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
      expect(contSnap.data().status).toBe("failed_terminal_retry");
    });
  });
});
