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
} from "./fixtures.js";
import {
  fastForwardWaitlistHead,
} from "../../src/server/callableFunctions.js";
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

describe("M24 Acceptance Test Matrix: TC-31 to TC-60", () => {
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

      // Seed apex community
      await db.collection("communities").doc("apex-ai-club").set(
        communityFixture("apex-ai-club", { campusId: APEX_CAMPUS_ID })
      );
      // Alice is admin
      await db.collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.alice}`).set(
        communityMemberFixture("apex-ai-club", TEST_UIDS.alice, {
          role: COMMUNITY_MEMBER_ROLES.ADMIN,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
          campusId: APEX_CAMPUS_ID,
        })
      );
      // Bob is member
      await db.collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.bob}`).set(
        communityMemberFixture("apex-ai-club", TEST_UIDS.bob, {
          role: COMMUNITY_MEMBER_ROLES.MEMBER,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
          campusId: APEX_CAMPUS_ID,
        })
      );
      // St Jude user is leader of st jude community
      await db.collection("communities").doc("st-jude-med").set(
        communityFixture("st-jude-med", { campusId: ST_JUDE_CAMPUS_ID })
      );
      await db.collection("communityMembers").doc(`st-jude-med_st_jude_user`).set(
        communityMemberFixture("st-jude-med", "st_jude_user", {
          role: COMMUNITY_MEMBER_ROLES.ADMIN,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
          campusId: ST_JUDE_CAMPUS_ID,
        })
      );
    });
  });

  afterAll(async () => {
    await closeTestEnvironment();
  });

  // TC-31: Expiry Rollover Success - PW-10 Scheduled
  it("TC-31: Expired candidate slot becomes 'expired', companion member deleted, next candidate promoted (PW-10)", async () => {
    const eventId = "tc31_event";
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
          waitlistCount: 1,
          headSequence: 2,
          nextSequence: 3,
        })
      );
      // Slot 1 offered but expired
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
      // Slot 2 waiting
      await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
        eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 2, {
          status: "waiting",
        })
      );
    });

    const res = await processExpiredOffers({ limit: 25 }, adminDb);
    expect(res.processedCount).toBeGreaterThanOrEqual(1);

    const slot1 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_1`).get()).data();
    expect(slot1.status).toBe("expired");

    const member1 = await adminDb.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get();
    expect(member1.exists).toBe(false);

    const slot2 = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_2`).get()).data();
    expect(slot2.status).toBe("offered");

    const coord = (await adminDb.collection("eventCapacities").doc(eventId).get()).data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(1);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(3);
  });

  // TC-32: Head Fast-Forward Stale Slot, Expired Lease Recovery & Retry Budget Isolation — PW-12
  it("TC-32: Head fast forward stale slots, lease expiration recovery, and clean completion (PW-12)", async () => {
    const eventId = "tc32_event";
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
          waitlistCount: 3,
          headSequence: 1,
          nextSequence: 15,
        })
      );
      // Slots 1-11 are terminal holes
      for (let i = 1; i <= 11; i++) {
        await db.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).set(
          eventWaitlistSlotFixture(eventId, i, `user_${i}`, APEX_CAMPUS_ID, {
            status: i % 2 === 0 ? "withdrawn" : "declined",
          })
        );
      }
      // Slot 12 is waiting
      await db.collection("eventWaitlistSlots").doc(`${eventId}_12`).set(
        eventWaitlistSlotFixture(eventId, 12, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 12, {
          status: "waiting",
        })
      );
    });

    // Fast forward with maxScan = 10
    const ffRes = await fastForwardWaitlistHead({ eventId, maxScan: 10 }, adminDb);
    expect(ffRes.success).toBe(true);
    expect(ffRes.continuationStaged).toBe(true);

    let coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    expect(coordSnap.data().headSequence).toBe(11);

    // Simulate Worker 1 acquiring lease and crashing with expired lease
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).update({
        status: "processing",
        leaseWorkerId: "worker_crash",
        leaseExpiresAt: pastTimestamp,
        retryCount: 0,
      });
    });

    // Worker 2 runs and recovers expired lease
    const contRes = await processWaitlistContinuations({ eventId }, adminDb);
    expect(contRes.success).toBe(true);
    expect(contRes.disposition).toBe("completed");

    coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    expect(coordSnap.data().headSequence).toBe(12);

    const continuationSnap = await adminDb.collection("eventWaitlistContinuations").doc(`continuation_${eventId}`).get();
    expect(continuationSnap.data().status).toBe("completed");
    expect(continuationSnap.data().retryCount).toBe(0);
    expect(continuationSnap.data().leaseWorkerId).toBeNull();
  });

  // TC-33: Candidate Reads Own Slot
  it("TC-33: Candidate Carol successfully fetches their own slot document", async () => {
    const eventId = "tc33_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID)
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol);
    await assertSucceeds(
      carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).get()
    );
  });

  // TC-34: Unrelated Student Denied Slot Read
  it("TC-34: Student Bob attempting to read Carol's slot is rejected (permission-denied)", async () => {
    const eventId = "tc34_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID)
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).get()
    );
  });

  // TC-35: Authorized Leader Reads Slots
  it("TC-35: Community moderator Alice successfully reads and lists slots", async () => {
    const eventId = "tc35_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID)
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      aliceCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).get()
    );
  });

  // TC-36: Cross-Campus Leader Denied Slot Read
  it("TC-36: Moderator from different campus attempting to read slots is rejected", async () => {
    const eventId = "tc36_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          campusId: APEX_CAMPUS_ID,
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID)
      );
    });

    const stJudeCtx = contextFor("st_jude_user", "st_jude_user@stjude.edu", ST_JUDE_CAMPUS_ID);
    await expectPermissionDenied(() =>
      stJudeCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).get()
    );
  });

  // TC-37: Member-Index Read Tenant Parity
  it("TC-37: Reading member index enforces campusId == getUserCampusId()", async () => {
    const eventId = "tc37_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1)
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol, `${TEST_UIDS.carol}@example.test`, APEX_CAMPUS_ID);
    await assertSucceeds(
      carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).get()
    );

    const stJudeCtx = contextFor("st_jude_user", "st_jude_user@stjude.edu", ST_JUDE_CAMPUS_ID);
    await expectPermissionDenied(() =>
      stJudeCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).get()
    );
  });

  // TC-38: Member-Index Direct Deletion Rejected
  it("TC-38: Unrelated student attempting to delete another student's member index is rejected", async () => {
    const eventId = "tc38_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1)
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).delete()
    );
  });

  // TC-39: Unauthorized Campus-Wide Event Create Rejected
  it("TC-39: Authenticated student attempting to create event with communityId == null is rejected", async () => {
    const bobCtx = contextFor(TEST_UIDS.bob);
    const eventId = "tc39_event";

    const eventData = eventFixture(eventId, TEST_UIDS.bob, null, {
      communityId: null,
      capacity: 50,
      registrationType: "capped",
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
    });
    const coordinatorData = eventCapacityFixture(eventId, APEX_CAMPUS_ID);

    const batch = bobCtx.firestore().batch();
    batch.set(bobCtx.firestore().collection("events").doc(eventId), eventData);
    batch.set(bobCtx.firestore().collection("eventCapacities").doc(eventId), coordinatorData);

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-40: Community Moderator Event Create Success
  it("TC-40: Active community moderator creates a community-sponsored event successfully", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const eventId = "tc40_event";

    const eventData = eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
      capacity: 50,
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    delete eventData.registrationType;
    const coordinatorData = eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const batch = aliceCtx.firestore().batch();
    batch.set(aliceCtx.firestore().collection("events").doc(eventId), eventData);
    batch.set(aliceCtx.firestore().collection("eventCapacities").doc(eventId), coordinatorData);

    await assertSucceeds(batch.commit());
  });

  // TC-41: Event List Visibility Enforced
  it("TC-41: Same-campus student who is NOT a community member is denied reading a community_only event", async () => {
    const eventId = "tc41_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          visibility: "community_only",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    // Carol is NOT a member of apex-ai-club in this test setup if we remove her or check non-member
    const nonMemberCtx = contextFor("random_student", "random@example.test", APEX_CAMPUS_ID);
    await expectPermissionDenied(() =>
      nonMemberCtx.firestore().collection("events").doc(eventId).get()
    );
  });

  // TC-42: Event List Campus Public Success
  it("TC-42: Same-campus student successfully reads campus_public events", async () => {
    const eventId = "tc42_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          visibility: "campus_public",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await assertSucceeds(
      bobCtx.firestore().collection("events").doc(eventId).get()
    );
  });

  // TC-43: Pathway A Title Length Bounds
  it("TC-43: Updating title to < 3 or > 100 characters is rejected", async () => {
    const eventId = "tc43_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        title: "AB", // too short
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );

    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        title: "A".repeat(101), // too long
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-44: Pathway A Invalid Category Enum
  it("TC-44: Updating category to non-enum value is rejected", async () => {
    const eventId = "tc44_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        category: "invalid_category",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-45: Pathway A Ongoing Start Time Frozen
  it("TC-45: Attempting to update startAt on an ongoing/past event is rejected", async () => {
    const eventId = "tc45_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          startAt: pastTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        startAt: futureTimestamp,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-46: Pathway A Campus-Wide Visibility Invariant
  it("TC-46: Attempting to change a null-community event's visibility to community_only is rejected", async () => {
    const eventId = "tc46_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, "system", null, {
          communityId: null,
          visibility: "campus_public",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        visibility: "community_only",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-47 to TC-55: Expression & Access Budgets Audits
  it("TC-47: Atomic Capped Event Create Budget (<= 20 access calls)", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const eventId = "tc47_event";
    const batch = aliceCtx.firestore().batch();
    const eventData = eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
      capacity: 25,
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    delete eventData.registrationType;
    batch.set(
      aliceCtx.firestore().collection("events").doc(eventId),
      eventData
    );
    batch.set(
      aliceCtx.firestore().collection("eventCapacities").doc(eventId),
      eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(batch.commit());
  });

  it("TC-48: Initial Ledger Binding Audit succeeds within budget", async () => {
    const eventId = "tc48_event";
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
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 0 })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      aliceCtx.firestore().collection("events").doc(eventId).update({
        description: "Updated description for initial ledger test",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  it("TC-49: Repeat Ledger Binding Audit succeeds within budget", async () => {
    const eventId = "tc49_event";
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
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 0 })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      aliceCtx.firestore().collection("events").doc(eventId).update({
        location: "Hall B Room 102",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  it("TC-50: Republish Ledger Binding Audit succeeds within budget", async () => {
    const eventId = "tc50_event";
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
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 0 })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      aliceCtx.firestore().collection("events").doc(eventId).update({
        title: "Republished Event Title",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  it("TC-51: PW-2 5-Path Distinct Access Audit succeeds within budget", async () => {
    const eventId = "tc51_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 5,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 5,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol);
    const batch = carolCtx.firestore().batch();
    batch.set(
      carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`),
      eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID, {
        status: "waiting",
        joinedAt: serverTimestamp(),
      })
    );
    batch.set(
      carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`),
      eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1, {
        status: "waiting",
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    batch.update(carolCtx.firestore().collection("eventCapacities").doc(eventId), {
      waitlistCount: 1,
      nextSequence: 2,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await assertSucceeds(batch.commit());
  });

  it("TC-52: PW-1 Direct Admission Budget (<= 20 access calls)", async () => {
    const eventId = "tc52_event";
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
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 0 })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    const batch = bobCtx.firestore().batch();
    batch.set(
      bobCtx.firestore().collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`),
      eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, {
        createdAt: serverTimestamp(),
      })
    );
    batch.update(bobCtx.firestore().collection("eventCapacities").doc(eventId), {
      confirmedCount: 1,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await assertSucceeds(batch.commit());
  });

  it("TC-53: PW-5 Non-Head Leave Budget (<= 20 access calls)", async () => {
    const eventId = "tc53_event";
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
          waitlistCount: 2,
          headSequence: 1,
          nextSequence: 3,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
        eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.carol, APEX_CAMPUS_ID)
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 2)
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol);
    const batch = carolCtx.firestore().batch();
    batch.update(carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_2`), {
      status: "withdrawn",
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    batch.delete(carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`));
    batch.update(carolCtx.firestore().collection("eventCapacities").doc(eventId), {
      waitlistCount: 1,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await assertSucceeds(batch.commit());
  });

  it("TC-54: PW-8 Claim Offer Budget verifies access limits under emulator", async () => {
    const eventId = "tc54_event";
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

    const bobCtx = contextFor(TEST_UIDS.bob);
    const snap = await bobCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).get();
    expect(snap.exists).toBe(true);
  });

  it("TC-55: PW-10 Expiry Rollover Budget verifies access limits under emulator", async () => {
    const eventId = "tc55_event";
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
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    const snap = await aliceCtx.firestore().collection("eventCapacities").doc(eventId).get();
    expect(snap.exists).toBe(true);
  });

  // TC-56: Campus-Wide Event Client Update Denied for Matching Creator
  it("TC-56: Student matching createdBy on campus-wide event (communityId == null) denied client update", async () => {
    const eventId = "tc56_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.bob, null, {
          communityId: null,
          createdBy: TEST_UIDS.bob,
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("events").doc(eventId).update({
        title: "Bob Updates Campus-Wide Event",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-57: Campus-Wide Event Client Delete Denied for Matching Creator
  it("TC-57: Student matching createdBy on campus-wide event (communityId == null) denied client deletion", async () => {
    const eventId = "tc57_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.bob, null, {
          communityId: null,
          createdBy: TEST_UIDS.bob,
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("events").doc(eventId).delete()
    );
  });

  // TC-58: Query Semantic Parity: Non-Member Query Without Visibility Filter Denied
  it("TC-58: Non-member querying community events without visibility filter is rejected (permission-denied)", async () => {
    const eventId = "tc58_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          visibility: "community_only",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const nonMemberCtx = contextFor("outsider_student", "outsider@example.test", APEX_CAMPUS_ID);
    await expectPermissionDenied(() =>
      nonMemberCtx.firestore().collection("events").where("communityId", "==", "apex-ai-club").get()
    );
  });

  // TC-59: Query Semantic Parity: Non-Member Public-Only Filtered Query Succeeds
  it("TC-59: Non-member querying community events with where('visibility', '==', 'campus_public') succeeds", async () => {
    const eventId = "tc59_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          visibility: "campus_public",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const nonMemberCtx = contextFor("outsider_student", "outsider@example.test", APEX_CAMPUS_ID);
    await assertSucceeds(
      nonMemberCtx
        .firestore()
        .collection("events")
        .where("communityId", "==", "apex-ai-club")
        .where("visibility", "==", "campus_public")
        .get()
    );
  });

  // TC-60: Query Semantic Parity: Active Member Community-Only Query Succeeds
  it("TC-60: Active community member querying community events with where('visibility', '==', 'community_only') succeeds", async () => {
    const eventId = "tc60_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          visibility: "community_only",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await assertSucceeds(
      bobCtx
        .firestore()
        .collection("events")
        .where("communityId", "==", "apex-ai-club")
        .where("visibility", "==", "community_only")
        .get()
    );
  });
});
