import { getAdminDb } from "../../scripts/adminClient.mjs";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { assertSucceeds } from "@firebase/rules-unit-testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeTestEnvironment,
  resetFirestore,
  testEnvironment,
} from "./testEnv.js";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../src/constants.js";
import {
  TEST_UIDS,
  userFixture,
  campusFixture,
  communityFixture,
  communityMemberFixture,
  eventFixture,
  eventRsvpFixture,
  eventCapacityFixture,
  eventWaitlistSlotFixture,
  eventWaitlistMemberFixture,
  eventWaitlistContinuationFixture,
  eventWaitlistOutboxFixture,
} from "./fixtures.js";
import {
  cancelRsvpWithPromotion,
  claimWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist,
  promoteWaitlistCandidates,
  fastForwardWaitlistHead,
} from "../../src/server/callableFunctions.js";
import { deliverWaitlistOfferNotification } from "../../src/server/outboxWorker.js";
import { processExpiredOffers } from "../../src/server/expirySweeper.js";
import { processWaitlistContinuations } from "../../src/server/continuationWorker.js";

const futureTimestamp = firebase.firestore.Timestamp.fromMillis(1_800_000_000_000);
const farFutureTimestamp = firebase.firestore.Timestamp.fromMillis(1_800_003_600_000);
const pastTimestamp = firebase.firestore.Timestamp.fromMillis(1_600_000_000_000);
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

const contextFor = (uid, email = `${uid}@example.test`, campusId = APEX_CAMPUS_ID) =>
  testEnvironment.authenticatedContext(uid, { email, campusId });

async function expectPermissionDenied(operation) {
  await expect(operation()).rejects.toMatchObject({ code: "permission-denied" });
}

describe("M24 Acceptance Test Matrix: TC-61 to TC-91", () => {
  const adminDb = getAdminDb();

  beforeEach(async () => {
    await resetFirestore();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Seed campuses
      await db.collection("campuses").doc(APEX_CAMPUS_ID).set(campusFixture(APEX_CAMPUS_ID));
      await db.collection("campuses").doc(ST_JUDE_CAMPUS_ID).set(campusFixture(ST_JUDE_CAMPUS_ID));

      // Seed users
      await db.collection("users").doc(TEST_UIDS.alice).set(
        userFixture(TEST_UIDS.alice, { campusId: APEX_CAMPUS_ID })
      );
      await db.collection("users").doc(TEST_UIDS.bob).set(
        userFixture(TEST_UIDS.bob, { campusId: APEX_CAMPUS_ID })
      );
      await db.collection("users").doc(TEST_UIDS.carol).set(
        userFixture(TEST_UIDS.carol, { campusId: APEX_CAMPUS_ID })
      );
      await db.collection("users").doc("st_jude_user").set(
        userFixture("st_jude_user", { campusId: ST_JUDE_CAMPUS_ID, email: "st_jude_user@stjude.edu" })
      );

      // Seed community
      await db.collection("communities").doc("apex-ai-club").set(
        communityFixture("apex-ai-club", { campusId: APEX_CAMPUS_ID })
      );
      await db.collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.alice}`).set(
        communityMemberFixture("apex-ai-club", TEST_UIDS.alice, {
          role: COMMUNITY_MEMBER_ROLES.ADMIN,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
          campusId: APEX_CAMPUS_ID,
        })
      );
    });
  });

  afterAll(async () => {
    await closeTestEnvironment();
  });

  // TC-61: Cross-Campus Community-Only Event Read Denied
  it("TC-61: User from Campus B denied reading community_only event from Campus A", async () => {
    const eventId = "tc61_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          campusId: APEX_CAMPUS_ID,
          visibility: "community_only",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const stJudeCtx = contextFor("st_jude_user", "st_jude_user@stjude.edu", ST_JUDE_CAMPUS_ID);
    await expectPermissionDenied(() =>
      stJudeCtx.firestore().collection("events").doc(eventId).get()
    );
  });

  // TC-62: Direct Client Creation of Offer Notification Denied
  it("TC-62: Direct client creation of event_waitlist_offer notification is denied", async () => {
    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("users").doc(TEST_UIDS.bob).collection("notifications").doc("offer_1").set({
        type: "event_waitlist_offer",
        title: "Seat Offer",
        body: "You have an offer",
        isRead: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-63: Client Direct Write to Offered Status Denied
  it("TC-63: Direct client update to eventWaitlistSlots setting status: 'offered' is denied", async () => {
    const eventId = "tc63_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).update({
        status: "offered",
      })
    );
  });

  // TC-64: Client Direct Promotional Coordinator Delta Denied
  it("TC-64: Direct client update to eventCapacities attempting promotional increment is denied", async () => {
    const eventId = "tc64_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 9,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 1,
          nextSequence: 2,
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventCapacities").doc(eventId).update({
        offeredCount: 1,
        headSequence: 2,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-65: Direct Client Creation of Waitlist Offer Notification Denied
  it("TC-65: Direct client write attempting to create event_waitlist_offer notification is rejected", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("users").doc(TEST_UIDS.carol).collection("notifications").doc("offer_tc65").set({
        type: "event_waitlist_offer",
        title: "Offer",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-66: Callable Input Validation Rejection
  it("TC-66: Invoking claimWaitlistOffer with invalid arguments is rejected with INVALID_ARGUMENT", async () => {
    await expect(
      claimWaitlistOffer(
        { eventId: "invalid/event#id!", slotSequence: "not_a_number" },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  // TC-67: Callable Unauthenticated Caller Denied
  it("TC-67: Unauthenticated caller attempting to invoke callables is rejected with UNAUTHENTICATED", async () => {
    await expect(
      claimWaitlistOffer({ eventId: "e1", slotSequence: 1 }, null, adminDb)
    ).rejects.toMatchObject({ code: "unauthenticated" });

    await expect(
      cancelRsvpWithPromotion({ eventId: "e1" }, null, adminDb)
    ).rejects.toMatchObject({ code: "unauthenticated" });

    await expect(
      declineWaitlistOffer({ eventId: "e1", slotSequence: 1 }, null, adminDb)
    ).rejects.toMatchObject({ code: "unauthenticated" });

    await expect(
      promoteWaitlistCandidates({ eventId: "e1" }, null, adminDb)
    ).rejects.toMatchObject({ code: "unauthenticated" });

    await expect(
      fastForwardWaitlistHead({ eventId: "e1" }, null, adminDb)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  // TC-68: Callable Caller Ownership Enforced
  it("TC-68: Student attempting to invoke claimWaitlistOffer on another student's slot is rejected", async () => {
    const eventId = "tc68_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 9,
          offeredCount: 1,
          waitlistCount: 0,
          headSequence: 2,
          nextSequence: 2,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: futureTimestamp,
        })
      );
    });

    await expect(
      claimWaitlistOffer(
        { eventId, slotSequence: 1 },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  // TC-69: Callable Cross-Campus Request Denied
  it("TC-69: Student from Campus B attempting callable on Campus A event is rejected", async () => {
    const eventId = "tc69_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          campusId: APEX_CAMPUS_ID,
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 0 })
      );
    });

    await expect(
      leaveWaitlist(
        { eventId },
        { uid: "st_jude_user", email: "st_jude_user@stjude.edu" },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      promoteWaitlistCandidates(
        { eventId },
        { uid: "st_jude_user", email: "st_jude_user@stjude.edu" },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      fastForwardWaitlistHead(
        { eventId },
        { uid: "st_jude_user", email: "st_jude_user@stjude.edu" },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    // Same-campus non-organizer / non-leader student (Bob) is also rejected
    await expect(
      promoteWaitlistCandidates(
        { eventId },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      fastForwardWaitlistHead(
        { eventId },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    // Original creator (Alice) whose communityMembers document is deleted is rejected
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.alice}`).delete();
    });

    await expect(
      promoteWaitlistCandidates(
        { eventId },
        { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      fastForwardWaitlistHead(
        { eventId },
        { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    // Pending or removed membership (even with ADMIN role) is rejected
    for (const inactiveStatus of ["pending", "removed"]) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.alice}`).set(
          communityMemberFixture("apex-ai-club", TEST_UIDS.alice, {
            role: COMMUNITY_MEMBER_ROLES.ADMIN,
            status: inactiveStatus,
            campusId: APEX_CAMPUS_ID,
          })
        );
      });

      await expect(
        promoteWaitlistCandidates(
          { eventId },
          { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
          adminDb
        )
      ).rejects.toMatchObject({ code: "permission-denied" });

      await expect(
        fastForwardWaitlistHead(
          { eventId },
          { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
          adminDb
        )
      ).rejects.toMatchObject({ code: "permission-denied" });
    }

    // Campus-wide event (communityId === null) whose createdBy equals caller (Alice) is rejected
    const campusWideEventId = "tc69_campus_wide_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(campusWideEventId).set(
        eventFixture(campusWideEventId, TEST_UIDS.alice, null, {
          campusId: APEX_CAMPUS_ID,
          communityId: null,
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(campusWideEventId).set(
        eventCapacityFixture(campusWideEventId, APEX_CAMPUS_ID, { confirmedCount: 10 })
      );
    });

    await expect(
      promoteWaitlistCandidates(
        { eventId: campusWideEventId },
        { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      fastForwardWaitlistHead(
        { eventId: campusWideEventId },
        { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  // TC-70: Callable Migration-Lock Enforcement
  it("TC-70: Invoking callables on migration-locked event is rejected with ABORTED", async () => {
    const eventId = "tc70_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          registrationStatus: "migration_locked",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 5 })
      );
    });

    await expect(
      cancelRsvpWithPromotion(
        { eventId },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "aborted" });
  });

  // TC-71: Callable Option 1 Kickoff Cutoff Enforced
  it("TC-71: Invoking callables after event.startAt is rejected with FAILED_PRECONDITION", async () => {
    const eventId = "tc71_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: pastTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 5 })
      );
    });

    await expect(
      cancelRsvpWithPromotion(
        { eventId },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  // TC-72: Stale Continuation Worker Generation & Phase-2 In-Transaction Lease Fencing
  it("TC-72: Stale continuation worker with expired lease or older generation cleanly aborts (TC-72)", async () => {
    const eventId = "tc72_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 8,
          offeredCount: 0,
          waitlistCount: 2,
          headSequence: 1,
          nextSequence: 3,
        })
      );
      // Continuation acquired by Worker 2 under generation 4
      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set(
        eventWaitlistContinuationFixture(eventId, {
          status: "processing",
          leaseWorkerId: "worker_2",
          leaseExpiresAt: futureTimestamp,
          generation: 4,
          vacanciesRemaining: 2,
        })
      );
    });

    // Stale Worker Slow (with workerId 'worker_slow' and generation 3) attempts execution
    const staleResult = await processWaitlistContinuations(
      { eventId, workerId: "worker_slow" },
      adminDb
    );

    // Stale worker could not acquire lease because worker_2 holds it with future expiry
    expect(staleResult.success).toBe(true);
    expect(staleResult.disposition).toBe("skipped_locked");

    const contSnap = await adminDb.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
    expect(contSnap.data().generation).toBe(4);
    expect(contSnap.data().leaseWorkerId).toBe("worker_2");
  });

  // TC-73: Concurrent Continuation Work Arrival, Exclusive Lease Preservation & Mixed-Type Generation Coalescing
  it("TC-73: Mixed continuation type coalescing and generation fencing (Scenarios A, B, C)", async () => {
    const eventId = "tc73_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 8,
          offeredCount: 0,
          waitlistCount: 3,
          headSequence: 1,
          nextSequence: 15,
        })
      );
      // Slots 1-10 are terminal holes
      for (let i = 1; i <= 10; i++) {
        await db.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).set(
          eventWaitlistSlotFixture(eventId, i, `user_${i}`, APEX_CAMPUS_ID, { status: "withdrawn" })
        );
      }
      // Slot 11 and 12 are waiting
      await db.collection("eventWaitlistSlots").doc(`${eventId}_11`).set(
        eventWaitlistSlotFixture(eventId, 11, "u11", APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_u11`).set(
        eventWaitlistMemberFixture(eventId, "u11", APEX_CAMPUS_ID, 11, { status: "waiting" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_12`).set(
        eventWaitlistSlotFixture(eventId, 12, "u12", APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_u12`).set(
        eventWaitlistMemberFixture(eventId, "u12", APEX_CAMPUS_ID, 12, { status: "waiting" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_13`).set(
        eventWaitlistSlotFixture(eventId, 13, "u13", APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_u13`).set(
        eventWaitlistMemberFixture(eventId, "u13", APEX_CAMPUS_ID, 13, { status: "waiting" })
      );

      // Staged continuation with normalizationRequired: true
      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set(
        eventWaitlistContinuationFixture(eventId, {
          continuationType: "promotion",
          vacanciesRemaining: 2,
          targetBatch: 2,
          normalizationRequired: true,
          status: "pending",
          generation: 1,
        })
      );
    });

    await fastForwardWaitlistHead(
      { eventId, maxScan: 10 },
      { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
      adminDb
    );
    const res = await processWaitlistContinuations({ eventId }, adminDb);
    expect(res.success).toBe(true);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    const coord = coordSnap.data();
    expect(coord.confirmedCount).toBe(8);
    expect(coord.offeredCount).toBe(2);
    expect(coord.confirmedCount + coord.offeredCount).toBe(10); // Zero overbooking
    expect(coord.headSequence).toBe(13); // Advanced past slots 11 and 12 to 13
  });

  // TC-74: Bifurcated Continuation Dispatch & Mixed Continuation Type Subsumption
  it("TC-74: Bifurcated dispatch selects Branch A for head_normalization and Branch B for promotion", async () => {
    // Scenario A: Isolated Branch A on full event
    const eventA = "tc74_event_a";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventA).set(
        eventFixture(eventA, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventA).set(
        eventCapacityFixture(eventA, APEX_CAMPUS_ID, {
          confirmedCount: 10,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 1,
          nextSequence: 3,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventA}_1`).set(
        eventWaitlistSlotFixture(eventA, 1, "u1", APEX_CAMPUS_ID, { status: "withdrawn" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventA}_2`).set(
        eventWaitlistSlotFixture(eventA, 2, "u2", APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventA}_u2`).set(
        eventWaitlistMemberFixture(eventA, "u2", APEX_CAMPUS_ID, 2, { status: "waiting" })
      );
      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventA}`).set(
        eventWaitlistContinuationFixture(eventA, {
          continuationType: "head_normalization",
          vacanciesRemaining: 0,
          normalizationRequired: true,
          status: "pending",
        })
      );
    });

    const resA = await processWaitlistContinuations({ eventId: eventA }, adminDb);
    expect(resA.success).toBe(true);
    expect(resA.disposition).toBe("completed");

    const coordA = (await adminDb.collection("eventCapacities").doc(eventA).get()).data();
    expect(coordA.headSequence).toBe(2);
    expect(coordA.offeredCount).toBe(0); // Zero overbooking
  });

  // TC-75: Post-Commit Crash Recovery Across Dual Windows & Residual-Demand Recovery
  it("TC-75: Crash recovery after Phase 2 commit completes residual promotion demand without duplicate writes", async () => {
    const eventId = "tc75_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 7,
          offeredCount: 1, // Candidate 1 already offered
          waitlistCount: 2,
          headSequence: 2,
          nextSequence: 4,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, "u1", APEX_CAMPUS_ID, { status: "offered" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
        eventWaitlistSlotFixture(eventId, 2, "u2", APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_u2`).set(
        eventWaitlistMemberFixture(eventId, "u2", APEX_CAMPUS_ID, 2, { status: "waiting" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_3`).set(
        eventWaitlistSlotFixture(eventId, 3, "u3", APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_u3`).set(
        eventWaitlistMemberFixture(eventId, "u3", APEX_CAMPUS_ID, 3, { status: "waiting" })
      );

      // Continuation left in 'processing' with expired lease by crashed worker
      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set(
        eventWaitlistContinuationFixture(eventId, {
          continuationType: "promotion",
          reason: "residual_demand_chained",
          intermediateHeadSequence: 2,
          vacanciesRemaining: 2,
          status: "processing",
          leaseWorkerId: "crashed_worker",
          leaseExpiresAt: pastTimestamp,
          generation: 2,
        })
      );
    });

    const res = await processWaitlistContinuations({ eventId }, adminDb);
    expect(res.success).toBe(true);

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.confirmedCount).toBe(7);
    expect(coord.offeredCount).toBe(3); // 1 + 2 = 3 offered
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(4);

    const slot1 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_1`).get()).data();
    expect(slot1.status).toBe("offered"); // Never re-promoted or corrupted
    const slot2 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_2`).get()).data();
    expect(slot2.status).toBe("offered");
    const slot3 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_3`).get()).data();
    expect(slot3.status).toBe("offered");
  });

  // TC-76: Queue-Head Normalization Past Non-Head Withdrawal Hole
  it("TC-76: Bounded normalization skips non-head withdrawal hole and offers seat to next waiting candidate", async () => {
    const eventId = "tc76_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 10,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 3, // Points to slot 3 which withdrew
          nextSequence: 5,
        })
      );
      await db.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID)
      );
      // Slot 3 withdrawn
      await db.collection("eventWaitlistSlots").doc(`${eventId}_3`).set(
        eventWaitlistSlotFixture(eventId, 3, "u3", APEX_CAMPUS_ID, { status: "withdrawn" })
      );
      // Slot 4 waiting
      await db.collection("eventWaitlistSlots").doc(`${eventId}_4`).set(
        eventWaitlistSlotFixture(eventId, 4, TEST_UIDS.carol, APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 4, { status: "waiting" })
      );
    });

    const res = await cancelRsvpWithPromotion(
      { eventId },
      { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);
    expect(res.promotedSlotSequence).toBe(4);

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(1);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(5);

    const slot4 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_4`).get()).data();
    expect(slot4.status).toBe("offered");

    const outboxSnap = await adminDb.collection("eventWaitlistOutbox").doc(`${eventId}_4`).get();
    expect(outboxSnap.exists).toBe(true);
  });

  // TC-77: Terminal Hole Normalization, Transient Retry Exhaustion & Fenced Error Recovery
  it("TC-77: Single-scan skips 3 terminal holes; halts with failed_integrity on missing member index", async () => {
    const eventId = "tc77_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 9,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 2,
          nextSequence: 6,
        })
      );
      // Slots 2, 3, 4 are terminal
      await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
        eventWaitlistSlotFixture(eventId, 2, "u2", APEX_CAMPUS_ID, { status: "withdrawn" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_3`).set(
        eventWaitlistSlotFixture(eventId, 3, "u3", APEX_CAMPUS_ID, { status: "declined" })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_4`).set(
        eventWaitlistSlotFixture(eventId, 4, "u4", APEX_CAMPUS_ID, { status: "expired" })
      );
      // Slot 5 is waiting but companion member index is intentionally MISSING
      await db.collection("eventWaitlistSlots").doc(`${eventId}_5`).set(
        eventWaitlistSlotFixture(eventId, 5, "u5", APEX_CAMPUS_ID, { status: "waiting" })
      );

      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set(
        eventWaitlistContinuationFixture(eventId, {
          continuationType: "promotion",
          vacanciesRemaining: 1,
          status: "pending",
        })
      );
    });

    const res = await processWaitlistContinuations({ eventId }, adminDb);
    expect(res.success).toBe(false);
    expect(res.disposition).toBe("failed_integrity");

    const cont = (await adminDb.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get()).data();
    expect(cont.status).toBe("failed_integrity");
    expect(cont.leaseWorkerId).toBeNull();
  });

  // TC-78: Head-Normalization Continuation Across >5 Bounded Chunks — Retry Reset Proof
  it("TC-78: Bounded continuation chunking resets retryCount: 0 and traverses 6 chunks to candidate", async () => {
    const eventId = "tc78_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 10,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 1,
          nextSequence: 25,
        })
      );
      // Slots 1 to 20 are terminal holes
      for (let i = 1; i <= 20; i++) {
        await db.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).set(
          eventWaitlistSlotFixture(eventId, i, `user_${i}`, APEX_CAMPUS_ID, { status: "withdrawn" })
        );
      }
      // Slot 21 is waiting candidate
      await db.collection("eventWaitlistSlots").doc(`${eventId}_21`).set(
        eventWaitlistSlotFixture(eventId, 21, TEST_UIDS.carol, APEX_CAMPUS_ID, { status: "waiting" })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 21, { status: "waiting" })
      );

      await db.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).set(
        eventWaitlistContinuationFixture(eventId, {
          continuationType: "head_normalization",
          vacanciesRemaining: 0,
          normalizationRequired: true,
          status: "pending",
          retryCount: 0,
        })
      );
    });

    // Chunk 1: scans 1-10 -> limit reached at 11, requeued
    const chunk1 = await processWaitlistContinuations({ eventId }, adminDb);
    expect(chunk1.success).toBe(true);
    expect(chunk1.disposition).toBe("requeue");
    let cont = (await adminDb.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get()).data();
    expect(cont.intermediateHeadSequence).toBe(11);
    expect(cont.retryCount).toBe(0);

    // Chunk 2: scans 11-20 -> limit reached at 21, requeued
    const chunk2 = await processWaitlistContinuations({ eventId }, adminDb);
    expect(chunk2.success).toBe(true);
    expect(chunk2.disposition).toBe("requeue");
    cont = (await adminDb.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get()).data();
    expect(cont.intermediateHeadSequence).toBe(21);
    expect(cont.retryCount).toBe(0);

    // Chunk 3: scans starting at 21 -> discovers candidate at 21!
    const chunk3 = await processWaitlistContinuations({ eventId }, adminDb);
    expect(chunk3.success).toBe(true);
    expect(chunk3.disposition).toBe("completed");

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.headSequence).toBe(21);
    expect(coord.waitlistCount).toBe(1);
  });

  // TC-79: Atomic Outbox Document Staging & Deduplication
  it("TC-79: Seat allocation stages outbox record; worker creates notification with deterministic ID", async () => {
    const eventId = "tc79_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("eventWaitlistSlots").doc(`${eventId}_4`).set(
        eventWaitlistSlotFixture(eventId, 4, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: futureTimestamp,
        })
      );
      await db.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_4`).set(
        eventWaitlistOutboxFixture(eventId, 4, TEST_UIDS.bob, {
          status: "pending",
          offerExpiresAt: futureTimestamp,
        })
      );
    });

    const res = await deliverWaitlistOfferNotification({ limit: 10 }, adminDb);
    expect(res.processedCount).toBeGreaterThanOrEqual(1);

    const outboxSnap = await adminDb.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_4`).get();
    expect(outboxSnap.data().status).toBe("delivered");

    const notifSnap = await adminDb.collection("users").doc(TEST_UIDS.bob).collection("notifications").doc(`offer_${eventId}_4`).get();
    expect(notifSnap.exists).toBe(true);
    expect(notifSnap.data().type).toBe("event_waitlist_offer");
  });

  // TC-80: Outbox Worker Delivery with Disabled Preferences
  it("TC-80: Outbox worker marks skipped_preference_disabled when user disabled eventWaitlistOffers", async () => {
    const eventId = "tc80_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("users").doc(TEST_UIDS.carol).set(
        userFixture(TEST_UIDS.carol, { isDiscoverable: false })
      );
    });

    // Verify client can update their own eventWaitlistOffers preference through Security Rules
    const carolCtx = contextFor(TEST_UIDS.carol);
    await assertSucceeds(
      carolCtx.firestore().collection("users").doc(TEST_UIDS.carol).update({
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
          eventRsvps: true,
          eventCancellations: true,
          eventWaitlistOffers: false,
        },
        updatedAt: serverTimestamp(),
      })
    );

    // Non-boolean eventWaitlistOffers is rejected by Security Rules
    await expectPermissionDenied(() =>
      carolCtx.firestore().collection("users").doc(TEST_UIDS.carol).update({
        notificationPreferences: {
          connectionRequests: true,
          connectionAccepted: true,
          eventWaitlistOffers: "not-a-bool",
        },
        updatedAt: serverTimestamp(),
      })
    );

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_1`).set(
        eventWaitlistOutboxFixture(eventId, 1, TEST_UIDS.carol, {
          status: "pending",
        })
      );
    });

    const res = await deliverWaitlistOfferNotification({ limit: 10 }, adminDb);
    expect(res.processedCount).toBeGreaterThanOrEqual(1);

    const outboxSnap = await adminDb.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_1`).get();
    expect(outboxSnap.data().status).toBe("skipped_preference_disabled");

    const notifSnap = await adminDb.collection("users").doc(TEST_UIDS.carol).collection("notifications").doc(`offer_${eventId}_1`).get();
    expect(notifSnap.exists).toBe(false);
  });

  // TC-81: Single Offered Candidate Decline with headSequence == nextSequence — PW-9B
  it("TC-81: Single offered candidate decline with headSequence == nextSequence decrements offeredCount, preserves head", async () => {
    const eventId = "tc81_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 9,
          offeredCount: 1,
          waitlistCount: 0,
          headSequence: 2,
          nextSequence: 2,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: futureTimestamp,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 1, {
          status: "offered",
        })
      );
    });

    const res = await declineWaitlistOffer(
      { eventId, slotSequence: 1 },
      { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(0);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(2);
    expect(coord.nextSequence).toBe(2);
    expect(coord.headSequence <= coord.nextSequence).toBe(true);
  });

  // TC-82: Single Offered Candidate Expiry with headSequence == nextSequence — PW-10
  it("TC-82: Single offered candidate expiry with headSequence == nextSequence preserves pointer monotonicity", async () => {
    const eventId = "tc82_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 9,
          offeredCount: 1,
          waitlistCount: 0,
          headSequence: 2,
          nextSequence: 2,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: pastTimestamp,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 1, {
          status: "offered",
        })
      );
    });

    const res = await processExpiredOffers({ limit: 25 }, adminDb);
    expect(res.processedCount).toBeGreaterThanOrEqual(1);

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(0);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(2);
    expect(coord.nextSequence).toBe(2);
    expect(coord.headSequence <= coord.nextSequence).toBe(true);
  });

  // TC-83: Reconciled Post-Exhaustion Subsequent Business Sequence & Pointer Monotonicity
  it("TC-83: Direct admission and subsequent waitlist join strictly preserve headSequence <= nextSequence", async () => {
    const eventId = "tc83_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      // Initial state post exhaustion: 9 confirmed, 0 offered, 0 waitlist, head = 2, next = 2
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 9,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 2,
          nextSequence: 2,
        })
      );
    });

    // 1. Student A direct admission
    const bobCtx = contextFor(TEST_UIDS.bob);
    const batch1 = bobCtx.firestore().batch();
    batch1.set(
      bobCtx.firestore().collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`),
      eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, {
        createdAt: serverTimestamp(),
      })
    );
    batch1.update(bobCtx.firestore().collection("eventCapacities").doc(eventId), {
      confirmedCount: 10,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await assertSucceeds(batch1.commit());

    let coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.confirmedCount).toBe(10);
    expect(coord.headSequence).toBe(2);
    expect(coord.nextSequence).toBe(2);

    // 2. Student B joins waitlist on full event
    const carolCtx = contextFor(TEST_UIDS.carol);
    const batch2 = carolCtx.firestore().batch();
    batch2.set(
      carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_2`),
      eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.carol, APEX_CAMPUS_ID, {
        status: "waiting",
        joinedAt: serverTimestamp(),
      })
    );
    batch2.set(
      carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`),
      eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 2, {
        status: "waiting",
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    batch2.update(carolCtx.firestore().collection("eventCapacities").doc(eventId), {
      waitlistCount: 1,
      nextSequence: 3,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await assertSucceeds(batch2.commit());

    coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.headSequence).toBe(2);
    expect(coord.nextSequence).toBe(3);
    expect(coord.headSequence <= coord.nextSequence).toBe(true);
  });

  // TC-84: Sweeper Discovery of Expired Offer with sequenceNumber < headSequence
  it("TC-84: Sweeper discovers expired offer with sequenceNumber < headSequence via collectionGroup", async () => {
    const eventId = "tc84_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 8,
          offeredCount: 1,
          waitlistCount: 0,
          headSequence: 5,
          nextSequence: 5,
        })
      );
      // Slot 2 was offered earlier and expired (2 < 5)
      await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
        eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: pastTimestamp,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 2, {
          status: "offered",
        })
      );
    });

    const res = await processExpiredOffers({ limit: 25 }, adminDb);
    expect(res.processedCount).toBeGreaterThanOrEqual(1);

    const slot2 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_2`).get()).data();
    expect(slot2.status).toBe("expired");

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.offeredCount).toBe(0);
    expect(coord.headSequence).toBe(5); // Preserved
  });

  // TC-85: Multiple Expired Offers on Single Event Processed Safely
  it("TC-85: Multiple expired offers on single event processed without collisions", async () => {
    const eventId = "tc85_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 10,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 8,
          offeredCount: 2,
          waitlistCount: 0,
          headSequence: 5,
          nextSequence: 5,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_3`).set(
        eventWaitlistSlotFixture(eventId, 3, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: pastTimestamp,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 3, {
          status: "offered",
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_4`).set(
        eventWaitlistSlotFixture(eventId, 4, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: pastTimestamp,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 4, {
          status: "offered",
        })
      );
    });

    const res = await processExpiredOffers({ limit: 25 }, adminDb);
    expect(res.processedCount).toBe(2);

    const slot3 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_3`).get()).data();
    expect(slot3.status).toBe("expired");
    const slot4 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_4`).get()).data();
    expect(slot4.status).toBe("expired");

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.offeredCount).toBe(0);
  });

  // TC-86: Starvation-Free Sweeper Pagination with >25 Events
  it("TC-86: Sweeper directly filters offerExpiresAt <= now, avoiding starvation by unexpired offers", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Create 5 expired offers
      for (let i = 1; i <= 5; i++) {
        const eid = `tc86_exp_${i}`;
        await db.collection("events").doc(eid).set(
          eventFixture(eid, TEST_UIDS.alice, "apex-ai-club", {
            startAt: futureTimestamp,
            endAt: farFutureTimestamp,
          })
        );
        await db.collection("eventCapacities").doc(eid).set(
          eventCapacityFixture(eid, APEX_CAMPUS_ID, { confirmedCount: 9, offeredCount: 1 })
        );
        await db.collection("eventWaitlistSlots").doc(`${eid}_1`).set(
          eventWaitlistSlotFixture(eid, 1, `u_exp_${i}`, APEX_CAMPUS_ID, {
            status: "offered",
            offerExpiresAt: pastTimestamp,
          })
        );
      }
      // Create 10 unexpired offers
      for (let i = 1; i <= 10; i++) {
        const eid = `tc86_act_${i}`;
        await db.collection("events").doc(eid).set(
          eventFixture(eid, TEST_UIDS.alice, "apex-ai-club", {
            startAt: futureTimestamp,
            endAt: farFutureTimestamp,
          })
        );
        await db.collection("eventCapacities").doc(eid).set(
          eventCapacityFixture(eid, APEX_CAMPUS_ID, { confirmedCount: 9, offeredCount: 1 })
        );
        await db.collection("eventWaitlistSlots").doc(`${eid}_1`).set(
          eventWaitlistSlotFixture(eid, 1, `u_act_${i}`, APEX_CAMPUS_ID, {
            status: "offered",
            offerExpiresAt: futureTimestamp,
          })
        );
      }
    });

    const res = await processExpiredOffers({ limit: 10 }, adminDb);
    expect(res.processedCount).toBe(5); // All 5 expired slots processed immediately
  });

  // TC-87: Outbox Worker Concurrent Claims & Lease Safety
  it("TC-87: Outbox worker concurrent claims prevent duplicate processing via 30s lease", async () => {
    const eventId = "tc87_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_1`).set(
        eventWaitlistOutboxFixture(eventId, 1, TEST_UIDS.bob, {
          status: "processing",
          lockedUntil: futureTimestamp, // Already held by worker 1
        })
      );
    });

    // Worker 2 attempts to claim
    const res = await deliverWaitlistOfferNotification({ limit: 10 }, adminDb);
    expect(res.processedCount).toBe(0); // Zero claims made
  });

  // TC-88: Outbox Retry Preserves Existing isRead: true and createdAt
  it("TC-88: Outbox retry preserves existing isRead: true and original createdAt", async () => {
    const eventId = "tc88_event";
    const originalCreated = firebase.firestore.Timestamp.fromMillis(1_700_000_123_000);
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: futureTimestamp,
        })
      );
      // Pre-existing notification document marked as read by student
      await db.collection("users").doc(TEST_UIDS.bob).collection("notifications").doc(`offer_${eventId}_1`).set({
        type: "event_waitlist_offer",
        title: "Seat Offer",
        isRead: true,
        createdAt: originalCreated,
      });
      // Outbox document pending retry
      await db.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_1`).set(
        eventWaitlistOutboxFixture(eventId, 1, TEST_UIDS.bob, {
          status: "pending",
          offerExpiresAt: futureTimestamp,
          retryCount: 1,
        })
      );
    });

    const res = await deliverWaitlistOfferNotification({ limit: 10 }, adminDb);
    expect(res.processedCount).toBe(1);

    const notif = (await adminDb.collection("users").doc(TEST_UIDS.bob).collection("notifications").doc(`offer_${eventId}_1`).get()).data();
    expect(notif.isRead).toBe(true);
    expect(notif.createdAt.toMillis()).toBe(originalCreated.toMillis());

    const outbox = (await adminDb.collection("eventWaitlistOutbox").doc(`outbox_${eventId}_1`).get()).data();
    expect(outbox.status).toBe("delivered");
  });

  // TC-89: Sweeper Pagination Checkpoint Advances Past Deferred Offers on Kicked-Off/Locked Events
  it("TC-89: Sweeper advances checkpoint cursor past kicked-off/locked events without starvation", async () => {
    const frozenEventId = "tc89_frozen_event";
    const liveEventId = "tc89_live_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Frozen event (already started)
      await db.collection("events").doc(frozenEventId).set(
        eventFixture(frozenEventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: pastTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(frozenEventId).set(
        eventCapacityFixture(frozenEventId, APEX_CAMPUS_ID, { confirmedCount: 9, offeredCount: 1 })
      );
      await db.collection("eventWaitlistSlots").doc(`${frozenEventId}_1`).set(
        eventWaitlistSlotFixture(frozenEventId, 1, "u_frozen", APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: pastTimestamp,
        })
      );

      // Live upcoming event
      await db.collection("events").doc(liveEventId).set(
        eventFixture(liveEventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(liveEventId).set(
        eventCapacityFixture(liveEventId, APEX_CAMPUS_ID, { confirmedCount: 9, offeredCount: 1 })
      );
      await db.collection("eventWaitlistSlots").doc(`${liveEventId}_1`).set(
        eventWaitlistSlotFixture(liveEventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: pastTimestamp,
        })
      );
    });

    const res = await processExpiredOffers({ limit: 10 }, adminDb);
    expect(res.processedCount).toBeGreaterThanOrEqual(1);

    // Live event offer was processed to expired
    const liveSlot = (await adminDb.collection("eventWaitlistSlots").doc(`${liveEventId}_1`).get()).data();
    expect(liveSlot.status).toBe("expired");

    // Frozen event slot remained unmodified due to kickoff cutoff
    const frozenSlot = (await adminDb.collection("eventWaitlistSlots").doc(`${frozenEventId}_1`).get()).data();
    expect(frozenSlot.status).toBe("offered");
  });

  // TC-90: Sweeper Checkpoint Lease Locking & Competing Sweeper Recovery
  it("TC-90: Competing sweeper safely recovers expired checkpoint lease", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Staged checkpoint with expired lease
      await db.collection("systemWaitlistJobs").doc("expirySweeperCheckpoint").set({
        leaseWorkerId: "crashed_sweeper",
        leaseExpiresAt: pastTimestamp,
        fencingToken: 1,
        cursorOfferExpiresAt: null,
        cursorSlotPath: null,
      });
    });

    const res = await processExpiredOffers({ limit: 25 }, adminDb);
    expect(res.success).toBe(true);

    const checkpoint = (await adminDb.collection("systemWaitlistJobs").doc("expirySweeperCheckpoint").get()).data();
    expect(checkpoint.leaseWorkerId).toBeNull(); // Lease cleanly released upon completion
  });

  // TC-91: Option A Same-Invocation Sweeper Wrap-Around & Earlier Expired Offer Discovery
  it("TC-91: Option A same-invocation wrap-around discovers earlier expired offer within single cycle", async () => {
    const earlyEventId = "tc91_early_event";
    const earlyExpired = firebase.firestore.Timestamp.fromMillis(1_500_000_000_000);
    const midTimestamp = firebase.firestore.Timestamp.fromMillis(1_600_000_000_000);

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Checkpoint cursor placed past earlyExpired at midTimestamp
      await db.collection("systemWaitlistJobs").doc("expirySweeperCheckpoint").set({
        leaseWorkerId: null,
        leaseExpiresAt: null,
        fencingToken: 1,
        cursorOfferExpiresAt: midTimestamp,
        cursorSlotPath: `eventWaitlistSlots/dummy_mid`,
        cycleSequence: 1,
      });

      // An earlier expired slot exists before cursorOfferExpiresAt
      await db.collection("events").doc(earlyEventId).set(
        eventFixture(earlyEventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(earlyEventId).set(
        eventCapacityFixture(earlyEventId, APEX_CAMPUS_ID, { confirmedCount: 9, offeredCount: 1 })
      );
      await db.collection("eventWaitlistSlots").doc(`${earlyEventId}_1`).set(
        eventWaitlistSlotFixture(earlyEventId, 1, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "offered",
          offerExpiresAt: earlyExpired,
        })
      );
    });

    // Run sweeper: cursor returns 0 items between midTimestamp and now; Option A wrap-around triggers and discovers earlyExpired slot
    const res = await processExpiredOffers({ limit: 25 }, adminDb);
    expect(res.success).toBe(true);
    expect(res.processedCount).toBe(1);

    const slot = (await adminDb.collection("eventWaitlistSlots").doc(`${earlyEventId}_1`).get()).data();
    expect(slot.status).toBe("expired");
  });

  // TC-92: Missing Waitlist-Member Document Reads & Reactive Subscription Transitions (Defect B)
  it("TC-92: Signed-in user can read their own missing eventWaitlistMembers doc, cannot read another user's missing doc, and onSnapshot cleanly transitions across join, leave, claim, and decline", async () => {
    const eventId = "tc92_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 2,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 2,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    const carolCtx = contextFor(TEST_UIDS.carol);
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const stJudeCtx = contextFor("st_jude_user", "st_jude_user@stjude.edu", ST_JUDE_CAMPUS_ID);
    const unauthCtx = testEnvironment.unauthenticatedContext();

    // 1. Bob can read his own missing waitlist-member document
    const missingOwnSnap = await assertSucceeds(
      bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get()
    );
    expect(missingOwnSnap.exists).toBe(false);

    // 2. Bob CANNOT read Carol's missing waitlist-member document
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).get()
    );

    // 3. Unauthenticated caller CANNOT read any missing waitlist-member document
    await expectPermissionDenied(() =>
      unauthCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get()
    );

    // 4. Subscribe to Bob's missing waitlist-member document via onSnapshot and verify transitions
    const snapshotStates = [];
    const snapshotErrors = [];
    let resolveNextSnapshot = null;
    const waitForNextSnapshot = () =>
      new Promise((resolve) => {
        resolveNextSnapshot = resolve;
      });

    const initialPromise = waitForNextSnapshot();
    const unsubscribe = bobCtx
      .firestore()
      .collection("eventWaitlistMembers")
      .doc(`${eventId}_${TEST_UIDS.bob}`)
      .onSnapshot(
        (snap) => {
          const state = {
            exists: snap.exists,
            status: snap.exists ? snap.data()?.status : null,
            sequenceNumber: snap.exists ? snap.data()?.sequenceNumber : null,
          };
          snapshotStates.push(state);
          if (resolveNextSnapshot) {
            const r = resolveNextSnapshot;
            resolveNextSnapshot = null;
            r(state);
          }
        },
        (err) => {
          snapshotErrors.push(err);
          if (resolveNextSnapshot) {
            const r = resolveNextSnapshot;
            resolveNextSnapshot = null;
            r({ error: err });
          }
        }
      );

    try {
      // Initial missing state emitted without error
      const s0 = await initialPromise;
      expect(s0).toEqual({ exists: false, status: null, sequenceNumber: null });
      expect(snapshotErrors).toHaveLength(0);

      // Transition 1: Absent -> Present (Bob joins waitlist)
      const joinSnapPromise = waitForNextSnapshot();
      const joinBatch = bobCtx.firestore().batch();
      joinBatch.set(bobCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`), {
        id: `${eventId}_1`,
        eventId,
        campusId: APEX_CAMPUS_ID,
        userId: TEST_UIDS.bob,
        sequenceNumber: 1,
        status: "waiting",
        joinedAt: serverTimestamp(),
      });
      joinBatch.set(
        bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`),
        {
          id: `${eventId}_${TEST_UIDS.bob}`,
          eventId,
          campusId: APEX_CAMPUS_ID,
          userId: TEST_UIDS.bob,
          sequenceNumber: 1,
          status: "waiting",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );
      joinBatch.update(bobCtx.firestore().collection("eventCapacities").doc(eventId), {
        waitlistCount: firebase.firestore.FieldValue.increment(1),
        nextSequence: firebase.firestore.FieldValue.increment(1),
        updatedAt: serverTimestamp(),
      });
      await assertSucceeds(joinBatch.commit());

      const s1 = await joinSnapPromise;
      expect(s1).toEqual({ exists: true, status: "waiting", sequenceNumber: 1 });
      expect(snapshotErrors).toHaveLength(0);

      // Existing membership read checks: owner (Bob) and event leader (Alice) succeed; Carol and St. Jude denied
      await assertSucceeds(
        bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get()
      );
      await assertSucceeds(
        aliceCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get()
      );
      await expectPermissionDenied(() =>
        carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get()
      );
      await expectPermissionDenied(() =>
        stJudeCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get()
      );

      // Transition 2: Present -> Absent on Leave (leaveWaitlist deletes member doc)
      const leaveSnapPromise = waitForNextSnapshot();
      await leaveWaitlist(
        { eventId },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      );
      const s2 = await leaveSnapPromise;
      expect(s2).toEqual({ exists: false, status: null, sequenceNumber: null });
      expect(snapshotErrors).toHaveLength(0);

      // Transition 3: Absent -> Offered -> Absent on Claim (claimWaitlistOffer deletes member doc)
      const offerSnapPromise = waitForNextSnapshot();
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("eventCapacities").doc(eventId).update({
          confirmedCount: 1,
          offeredCount: 1,
          waitlistCount: 0,
          headSequence: 3,
          nextSequence: 3,
        });
        await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
          eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.bob, APEX_CAMPUS_ID, {
            status: "offered",
            offerExpiresAt: futureTimestamp,
          })
        );
        await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
          eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 2, {
            status: "offered",
          })
        );
      });
      const s3 = await offerSnapPromise;
      expect(s3).toEqual({ exists: true, status: "offered", sequenceNumber: 2 });

      const claimSnapPromise = waitForNextSnapshot();
      await claimWaitlistOffer(
        { eventId, slotSequence: 2 },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      );
      const s4 = await claimSnapPromise;
      expect(s4).toEqual({ exists: false, status: null, sequenceNumber: null });
      expect(snapshotErrors).toHaveLength(0);

      // Transition 4: Absent -> Offered -> Absent on Decline (declineWaitlistOffer deletes member doc)
      const secondOfferPromise = waitForNextSnapshot();
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).delete();
        await db.collection("eventCapacities").doc(eventId).update({
          confirmedCount: 1,
          offeredCount: 1,
          waitlistCount: 0,
          headSequence: 4,
          nextSequence: 4,
        });
        await db.collection("eventWaitlistSlots").doc(`${eventId}_3`).set(
          eventWaitlistSlotFixture(eventId, 3, TEST_UIDS.bob, APEX_CAMPUS_ID, {
            status: "offered",
            offerExpiresAt: futureTimestamp,
          })
        );
        await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
          eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 3, {
            status: "offered",
          })
        );
      });
      const s5 = await secondOfferPromise;
      expect(s5).toEqual({ exists: true, status: "offered", sequenceNumber: 3 });

      const declineSnapPromise = waitForNextSnapshot();
      await declineWaitlistOffer(
        { eventId, slotSequence: 3 },
        { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
        adminDb
      );
      const s6 = await declineSnapPromise;
      expect(s6).toEqual({ exists: false, status: null, sequenceNumber: null });
      expect(snapshotErrors).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  // TC-93: Transactional FIFO Waitlist Join Under Rules (Defect C)
  it("TC-93: Client runTransaction waitlist join reads coordinator and member state before writing and allocates monotonic FIFO sequences", async () => {
    const eventId = "tc93_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 2,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 2,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
      );
    });

    const runClientWaitlistJoinTx = async (uid) => {
      const userFs = contextFor(uid).firestore();
      return await userFs.runTransaction(async (tx) => {
        const capRef = userFs.collection("eventCapacities").doc(eventId);
        const memberRef = userFs.collection("eventWaitlistMembers").doc(`${eventId}_${uid}`);
        const rsvpRef = userFs.collection("eventRsvps").doc(`${eventId}_${uid}`);

        const [capSnap, memberSnap, rsvpSnap] = await Promise.all([
          tx.get(capRef),
          tx.get(memberRef),
          tx.get(rsvpRef),
        ]);

        if (memberSnap.exists) {
          throw new Error("Already on waitlist");
        }
        if (rsvpSnap.exists) {
          throw new Error("Already has RSVP");
        }

        const assignedSeq = capSnap.data().nextSequence;
        const slotRef = userFs.collection("eventWaitlistSlots").doc(`${eventId}_${assignedSeq}`);

        tx.set(slotRef, {
          id: `${eventId}_${assignedSeq}`,
          eventId,
          campusId: APEX_CAMPUS_ID,
          userId: uid,
          sequenceNumber: assignedSeq,
          status: "waiting",
          joinedAt: serverTimestamp(),
        });
        tx.set(memberRef, {
          id: `${eventId}_${uid}`,
          eventId,
          campusId: APEX_CAMPUS_ID,
          userId: uid,
          sequenceNumber: assignedSeq,
          status: "waiting",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.update(capRef, {
          waitlistCount: firebase.firestore.FieldValue.increment(1),
          nextSequence: firebase.firestore.FieldValue.increment(1),
          updatedAt: serverTimestamp(),
        });

        return assignedSeq;
      });
    };

    const seqBob = await assertSucceeds(runClientWaitlistJoinTx(TEST_UIDS.bob));
    const seqCarol = await assertSucceeds(runClientWaitlistJoinTx(TEST_UIDS.carol));
    expect(seqBob).toBe(1);
    expect(seqCarol).toBe(2);

    // Duplicate join by Bob is rejected by the transaction read check
    await expect(runClientWaitlistJoinTx(TEST_UIDS.bob)).rejects.toThrow("Already on waitlist");

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.waitlistCount).toBe(2);
    expect(coord.nextSequence).toBe(3);
  });
});
