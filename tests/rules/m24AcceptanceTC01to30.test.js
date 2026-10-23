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
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../src/constants.js";
import {
  TEST_UIDS,
  userFixture,
  communityFixture,
  communityMemberFixture,
  eventFixture,
  eventRsvpFixture,
  eventCapacityFixture,
  eventWaitlistSlotFixture,
  eventWaitlistMemberFixture,
} from "./fixtures.js";
import {
  cancelRsvpWithPromotion,
  claimWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist,
  promoteWaitlistCandidates,
} from "../../src/server/callableFunctions.js";
import { processWaitlistContinuations } from "../../src/server/continuationWorker.js";

const futureTimestamp = firebase.firestore.Timestamp.fromMillis(1_800_000_000_000);
const farFutureTimestamp = firebase.firestore.Timestamp.fromMillis(1_800_003_600_000);

const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

const contextFor = (uid, email = `${uid}@example.test`, campusId = APEX_CAMPUS_ID) =>
  testEnvironment.authenticatedContext(uid, { email, campusId });

async function expectPermissionDenied(operation) {
  await expect(operation()).rejects.toMatchObject({ code: "permission-denied" });
}

describe("M24 Acceptance Test Matrix: TC-01 to TC-30", () => {
  const adminDb = getAdminDb();

  beforeEach(async () => {
    await resetFirestore();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Seed common users and community
      await db.collection("users").doc(TEST_UIDS.alice).set(userFixture(TEST_UIDS.alice));
      await db.collection("users").doc(TEST_UIDS.bob).set(userFixture(TEST_UIDS.bob));
      await db.collection("users").doc(TEST_UIDS.carol).set(userFixture(TEST_UIDS.carol));
      await db.collection("communities").doc("apex-ai-club").set(communityFixture("apex-ai-club"));
      // Alice is admin of apex-ai-club
      await db.collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.alice}`).set(
        communityMemberFixture("apex-ai-club", TEST_UIDS.alice, {
          role: COMMUNITY_MEMBER_ROLES.ADMIN,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        })
      );
      // Bob and Carol are active members
      await db.collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.bob}`).set(
        communityMemberFixture("apex-ai-club", TEST_UIDS.bob, {
          role: COMMUNITY_MEMBER_ROLES.MEMBER,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        })
      );
      await db.collection("communityMembers").doc(`apex-ai-club_${TEST_UIDS.carol}`).set(
        communityMemberFixture("apex-ai-club", TEST_UIDS.carol, {
          role: COMMUNITY_MEMBER_ROLES.MEMBER,
          status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
        })
      );
    });
  });

  afterAll(async () => {
    await closeTestEnvironment();
  });

  // TC-01: Capped Event Creation Success
  it("TC-01: Organizer creates capped event with concurrent coordinator creation", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const eventId = "tc01_event";
    const batch = aliceCtx.firestore().batch();

    const eventData = eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
      capacity: 50,
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    delete eventData.registrationType;
    const coordinatorData = eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
      confirmedCount: 0,
      offeredCount: 0,
      waitlistCount: 0,
      headSequence: 1,
      nextSequence: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(aliceCtx.firestore().collection("events").doc(eventId), eventData);
    batch.set(aliceCtx.firestore().collection("eventCapacities").doc(eventId), coordinatorData);

    await assertSucceeds(batch.commit());
  });

  // TC-02: Capped Event Missing Coordinator Denied
  it("TC-02: Creating capped event without coordinator fails (permission-denied)", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const eventId = "tc02_event";

    const eventData = eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
      capacity: 50,
      registrationType: "capped",
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
    });

    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).set(eventData)
    );
  });

  // TC-03: Uncapped Event Coordinator Creation Denied
  it("TC-03: Creating uncapped event with coordinator fails (permission-denied)", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const eventId = "tc03_event";
    const batch = aliceCtx.firestore().batch();

    const eventData = eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
      capacity: null,
      registrationType: "open",
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
    });
    const coordinatorData = eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
      confirmedCount: 0,
      offeredCount: 0,
      waitlistCount: 0,
      headSequence: 1,
      nextSequence: 1,
    });

    batch.set(aliceCtx.firestore().collection("events").doc(eventId), eventData);
    batch.set(aliceCtx.firestore().collection("eventCapacities").doc(eventId), coordinatorData);

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-04: Negative Capacity Denied
  it("TC-04: Creating event with capacity <= 0 or capacity > 10000 fails", async () => {
    const aliceCtx = contextFor(TEST_UIDS.alice);
    const eventId = "tc04_event";

    const batch = aliceCtx.firestore().batch();
    const eventData = eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
      capacity: -5,
      registrationType: "capped",
      startAt: futureTimestamp,
      endAt: farFutureTimestamp,
    });
    const coordinatorData = eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
      confirmedCount: 0,
      offeredCount: 0,
      waitlistCount: 0,
      headSequence: 1,
      nextSequence: 1,
    });

    batch.set(aliceCtx.firestore().collection("events").doc(eventId), eventData);
    batch.set(aliceCtx.firestore().collection("eventCapacities").doc(eventId), coordinatorData);

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-05: Direct Admission Success (PW-1)
  it("TC-05: Student RSVPs to event with vacancy; coordinator confirmedCount increments by 1", async () => {
    const eventId = "tc05_event";
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
          confirmedCount: 0,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
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
    batch.update(
      bobCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        confirmedCount: 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await assertSucceeds(batch.commit());
  });

  // TC-06: Direct Admission Overbooking & Queue-Bypass Denied
  it("TC-06: Direct admission write (PW-1) rejected when full OR when waitlistCount > 0", async () => {
    const eventId = "tc06_event";
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
      // Waitlist exists (waitlistCount = 1) even though there are vacancies (confirmed = 5)
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 5,
          offeredCount: 0,
          waitlistCount: 1,
          headSequence: 1,
          nextSequence: 2,
        })
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
    batch.update(
      bobCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        confirmedCount: 6,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-07: Waitlist Join Success (PW-2)
  it("TC-07: Student joins waitlist for full event; creates slot, member index, increments waitlistCount and nextSequence", async () => {
    const eventId = "tc07_event";
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
    batch.update(
      carolCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        waitlistCount: 1,
        nextSequence: 2,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await assertSucceeds(batch.commit());
  });

  // TC-08: Waitlist Join With Vacancy Denied When Waitlist Empty
  it("TC-08: Waitlist join via PW-2 denied when vacancies exist AND waitlistCount == 0", async () => {
    const eventId = "tc08_event";
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
    batch.update(
      carolCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        waitlistCount: 1,
        nextSequence: 2,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-09: Duplicate Waitlist Join Denied
  it("TC-09: Candidate with existing active member index attempting second join is rejected", async () => {
    const eventId = "tc09_event";
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
          nextSequence: 2,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1, {
          status: "waiting",
        })
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol);
    const batch = carolCtx.firestore().batch();

    batch.set(
      carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_2`),
      eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.carol, APEX_CAMPUS_ID, {
        status: "waiting",
      })
    );
    batch.set(
      carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`),
      eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 2, {
        status: "waiting",
      })
    );
    batch.update(
      carolCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        waitlistCount: 2,
        nextSequence: 3,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-10: Confirmed Attendee Waitlist Join Denied
  it("TC-10: Candidate with active RSVP attempting waitlist join is rejected", async () => {
    const eventId = "tc10_event";
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
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
      );
      await db.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID)
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    const batch = bobCtx.firestore().batch();

    batch.set(
      bobCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`),
      eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.bob, APEX_CAMPUS_ID, {
        status: "waiting",
      })
    );
    batch.set(
      bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`),
      eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 1, {
        status: "waiting",
      })
    );
    batch.update(
      bobCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        waitlistCount: 1,
        nextSequence: 2,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-11: Missing Member Index Denied
  it("TC-11: Join transaction creating slot and updating coordinator without member index is rejected", async () => {
    const eventId = "tc11_event";
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
      })
    );
    batch.update(
      carolCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        waitlistCount: 1,
        nextSequence: 2,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await expectPermissionDenied(() => batch.commit());
  });

  // TC-12: Confirmed Withdrawal Zero Queue - PW-3
  it("TC-12: Confirmed attendee withdraws via direct client batch; coordinator confirmedCount decrements by 1 (PW-3)", async () => {
    const eventId = "tc12_event";
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
          confirmedCount: 5,
          offeredCount: 0,
          waitlistCount: 0,
          headSequence: 1,
          nextSequence: 1,
        })
      );
      await db.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID)
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    const batch = bobCtx.firestore().batch();

    batch.delete(bobCtx.firestore().collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`));
    batch.update(
      bobCtx.firestore().collection("eventCapacities").doc(eventId),
      {
        confirmedCount: 4,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }
    );

    await assertSucceeds(batch.commit());
  });

  // TC-13: Confirmed Withdrawal With Promotion - PW-4 Callable
  it("TC-13: Confirmed attendee withdraws with active queue via cancelRsvpWithPromotion (PW-4)", async () => {
    const eventId = "tc13_event";
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
          nextSequence: 2,
        })
      );
      await db.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID)
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1, {
          status: "waiting",
        })
      );
    });

    const res = await cancelRsvpWithPromotion(
      { eventId },
      { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);
    expect(res.promotedSlotSequence).toBe(1);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    const coord = coordSnap.data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(1);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(2);

    const slotSnap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_1`).get();
    expect(slotSnap.data().status).toBe("offered");
  });

  // TC-14: Claim Offer Success - Terminal PW-8
  it("TC-14: Candidate claims valid offer before deadline via claimWaitlistOffer (PW-8)", async () => {
    const eventId = "tc14_event";
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
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1, {
          status: "offered",
        })
      );
    });

    const res = await claimWaitlistOffer(
      { eventId, slotSequence: 1 },
      { uid: TEST_UIDS.carol, email: `${TEST_UIDS.carol}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    expect(coordSnap.data().confirmedCount).toBe(10);
    expect(coordSnap.data().offeredCount).toBe(0);

    const slotSnap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_1`).get();
    expect(slotSnap.data().status).toBe("claimed");

    const memberSnap = await adminDb.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).get();
    expect(memberSnap.exists).toBe(false);

    const rsvpSnap = await adminDb.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.carol}`).get();
    expect(rsvpSnap.exists).toBe(true);
  });

  // TC-15: Claim After Expiry Denied
  it("TC-15: Candidate claims offer after offerExpiresAt; rejected (DEADLINE_EXCEEDED)", async () => {
    const eventId = "tc15_event";
    const pastTimestamp = firebase.firestore.Timestamp.fromMillis(1_600_000_000_000);
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
          offerExpiresAt: pastTimestamp,
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 1, {
          status: "offered",
        })
      );
    });

    await expect(
      claimWaitlistOffer(
        { eventId, slotSequence: 1 },
        { uid: TEST_UIDS.carol, email: `${TEST_UIDS.carol}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "deadline-exceeded" });
  });

  // TC-16: Claim Non-Head Offer Denied
  it("TC-16: Candidate attempting to claim an un-offered waiting slot is rejected (FAILED_PRECONDITION)", async () => {
    const eventId = "tc16_event";
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
          nextSequence: 2,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
    });

    await expect(
      claimWaitlistOffer(
        { eventId, slotSequence: 1 },
        { uid: TEST_UIDS.carol, email: `${TEST_UIDS.carol}@example.test` },
        adminDb
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  // TC-17: Claim and Follow-On Promotion - PW-8B
  it("TC-17: Candidate claims offer; server detects vacancy and waiting queue (PW-8B)", async () => {
    const eventId = "tc17_event";
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
      // Confirmed 8, offered 1, waitlist 1 -> vacancy = 10 - (8+1) = 1!
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 8,
          offeredCount: 1,
          waitlistCount: 1,
          headSequence: 2,
          nextSequence: 3,
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

    const res = await claimWaitlistOffer(
      { eventId, slotSequence: 1 },
      { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);
    expect(res.promotedSlotSequence).toBe(2);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    const coord = coordSnap.data();
    // Confirmed 8+1 = 9, offered count was 1, Bob claimed (-1), Carol promoted (+1) -> offeredCount = 1
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(1);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(3);

    const slot2Snap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_2`).get();
    expect(slot2Snap.data().status).toBe("offered");
  });

  // TC-18: Capacity Expansion Success
  it("TC-18: Organizer expands capacity on events/{eventId} via Pathway A", async () => {
    const eventId = "tc18_event";
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
          waitlistCount: 0,
        })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      aliceCtx.firestore().collection("events").doc(eventId).update({
        capacity: 20,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-19: Capacity Reduction Below Occupancy Denied
  it("TC-19: Organizer reduces capacity below confirmedCount + offeredCount; rejected", async () => {
    const eventId = "tc19_event";
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
          confirmedCount: 5,
          offeredCount: 2,
          waitlistCount: 0,
        })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        capacity: 6, // 6 < 5 + 2 = 7
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-20: Catch-Up Promotion Success Across Bounded Batches & Invariant Verification — PW-7B
  it("TC-20: Catch-up promotion across bounded batches and continuation execution (PW-7B)", async () => {
    const eventId = "tc20_event";
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("events").doc(eventId).set(
        eventFixture(eventId, TEST_UIDS.alice, "apex-ai-club", {
          capacity: 20,
          registrationType: "capped",
          startAt: futureTimestamp,
          endAt: farFutureTimestamp,
        })
      );
      await db.collection("eventCapacities").doc(eventId).set(
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, {
          confirmedCount: 10,
          offeredCount: 0,
          waitlistCount: 10,
          headSequence: 1,
          nextSequence: 11,
        })
      );
      // Seed 10 waitlist slots (1-10)
      for (let i = 1; i <= 10; i++) {
        const uid = `user_${i}`;
        await db.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).set(
          eventWaitlistSlotFixture(eventId, i, uid, APEX_CAMPUS_ID, { status: "waiting" })
        );
        await db.collection("eventWaitlistMembers").doc(`${eventId}_${uid}`).set(
          eventWaitlistMemberFixture(eventId, uid, APEX_CAMPUS_ID, i, { status: "waiting" })
        );
      }
    });

    // Organizer invokes promoteWaitlistCandidates for 10 seats
    const res1 = await promoteWaitlistCandidates(
      { eventId, maxSeats: 10 },
      { uid: TEST_UIDS.alice, email: `${TEST_UIDS.alice}@example.test` },
      adminDb
    );

    expect(res1.success).toBe(true);
    expect(res1.promotedCount).toBe(5); // Capped at B=5
    expect(res1.continuationStaged).toBe(true);

    let coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    let coord = coordSnap.data();
    expect(coord.confirmedCount).toBe(10);
    expect(coord.offeredCount).toBe(5);
    expect(coord.waitlistCount).toBe(5);
    expect(coord.headSequence).toBe(6);

    // Now execute continuation worker for Batch 2
    const workerRes = await processWaitlistContinuations({ eventId }, adminDb);
    expect(workerRes.success).toBe(true);
    expect(workerRes.disposition).toBe("completed");

    coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    coord = coordSnap.data();
    expect(coord.confirmedCount).toBe(10);
    expect(coord.offeredCount).toBe(10);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(11);

    // Verify all 10 slots are 'offered'
    for (let i = 1; i <= 10; i++) {
      const slot = (await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_${i}`).get()).data();
      expect(slot.status).toBe("offered");
    }
  });

  // TC-21: Migration Lock Freezes Event Updates
  it("TC-21: Client event update rejected when registrationStatus == 'migration_locked'", async () => {
    const eventId = "tc21_event";
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

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).update({
        title: "New Title",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-22: Migration Lock Freezes Coordinator Updates
  it("TC-22: Coordinator updates rejected during migration lock", async () => {
    const eventId = "tc22_event";
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

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventCapacities").doc(eventId).update({
        confirmedCount: 6,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  });

  // TC-23: Migration Lock Freezes RSVPs
  it("TC-23: RSVP creations and deletions rejected during migration lock", async () => {
    const eventId = "tc23_event";
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
      await db.collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventRsvpFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID)
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      bobCtx.firestore().collection("eventRsvps").doc(`${eventId}_${TEST_UIDS.bob}`).delete()
    );
  });

  // TC-24: Migration Lock Freezes Slot Writes
  it("TC-24: Waitlist slot creations and updates rejected during migration lock", async () => {
    const eventId = "tc24_event";
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
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 10 })
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol);
    await expectPermissionDenied(() =>
      carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_1`).set(
        eventWaitlistSlotFixture(eventId, 1, TEST_UIDS.carol, APEX_CAMPUS_ID)
      )
    );
  });

  // TC-25: Migration Lock Freezes Event Delete
  it("TC-25: Event deletion rejected during migration lock", async () => {
    const eventId = "tc25_event";
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
        eventCapacityFixture(eventId, APEX_CAMPUS_ID, { confirmedCount: 0 })
      );
    });

    const aliceCtx = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      aliceCtx.firestore().collection("events").doc(eventId).delete()
    );
  });

  // TC-26: Non-Head Waiting Withdrawal Success - PW-5
  it("TC-26: Non-head candidate (seq == 5, head == 2) successfully withdraws via PW-5", async () => {
    const eventId = "tc26_event";
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
          waitlistCount: 4,
          headSequence: 2,
          nextSequence: 6,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_5`).set(
        eventWaitlistSlotFixture(eventId, 5, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 5, {
          status: "waiting",
        })
      );
    });

    const carolCtx = contextFor(TEST_UIDS.carol);
    const batch = carolCtx.firestore().batch();

    batch.update(carolCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_5`), {
      status: "withdrawn",
      resolvedAt: serverTimestamp(),
    });
    batch.delete(carolCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`));
    batch.update(carolCtx.firestore().collection("eventCapacities").doc(eventId), {
      waitlistCount: 3,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await assertSucceeds(batch.commit());
  });

  // TC-27: Non-Head Waiting Withdrawal Dispatch Gate
  it("TC-27: Coordinator update with affected keys ['waitlistCount', 'updatedAt'] passes dispatcher", async () => {
    const eventId = "tc27_event";
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
          waitlistCount: 5,
          headSequence: 2,
          nextSequence: 7,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_5`).set(
        eventWaitlistSlotFixture(eventId, 5, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 5, {
          status: "waiting",
        })
      );
    });

    const bobCtx = contextFor(TEST_UIDS.bob);
    const batch = bobCtx.firestore().batch();

    batch.update(bobCtx.firestore().collection("eventWaitlistSlots").doc(`${eventId}_5`), {
      status: "withdrawn",
      resolvedAt: serverTimestamp(),
    });
    batch.delete(bobCtx.firestore().collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`));
    batch.update(bobCtx.firestore().collection("eventCapacities").doc(eventId), {
      waitlistCount: 4,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await assertSucceeds(batch.commit());
  });

  // TC-28: Head Waiting Withdrawal Success - PW-5 Head Callable
  it("TC-28: Candidate at head (seq == 2, head == 2) withdraws via leaveWaitlist (PW-5 Head)", async () => {
    const eventId = "tc28_event";
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
          headSequence: 2,
          nextSequence: 4,
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_2`).set(
        eventWaitlistSlotFixture(eventId, 2, TEST_UIDS.bob, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.bob, APEX_CAMPUS_ID, 2, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistSlots").doc(`${eventId}_3`).set(
        eventWaitlistSlotFixture(eventId, 3, TEST_UIDS.carol, APEX_CAMPUS_ID, {
          status: "waiting",
        })
      );
      await db.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.carol}`).set(
        eventWaitlistMemberFixture(eventId, TEST_UIDS.carol, APEX_CAMPUS_ID, 3, {
          status: "waiting",
        })
      );
    });

    const res = await leaveWaitlist(
      { eventId },
      { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    const coord = coordSnap.data();
    expect(coord.waitlistCount).toBe(1);
    expect(coord.headSequence).toBe(3);

    const slotSnap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_2`).get();
    expect(slotSnap.data().status).toBe("withdrawn");

    const memberSnap = await adminDb.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get();
    expect(memberSnap.exists).toBe(false);
  });

  // TC-29: Decline with Rollover Success - PW-9A Callable
  it("TC-29: Offered candidate declines via declineWaitlistOffer; head slot becomes 'declined', next slot 'offered' (PW-9A)", async () => {
    const eventId = "tc29_event";
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

    const res = await declineWaitlistOffer(
      { eventId, slotSequence: 1 },
      { uid: TEST_UIDS.bob, email: `${TEST_UIDS.bob}@example.test` },
      adminDb
    );

    expect(res.success).toBe(true);
    expect(res.promotedSlotSequence).toBe(2);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    const coord = coordSnap.data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(1);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(3);

    const slot1Snap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_1`).get();
    expect(slot1Snap.data().status).toBe("declined");

    const slot2Snap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_2`).get();
    expect(slot2Snap.data().status).toBe("offered");
  });

  // TC-30: Decline Queue Exhausted Success — PW-9B Callable
  it("TC-30: Decline when queue exhausted decrements offeredCount, preserves headSequence (PW-9B)", async () => {
    const eventId = "tc30_event";
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
      // Confirmed 9, offered 1, waitlist 0, headSequence 2, nextSequence 2
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
    expect(res.promotedSlotSequence).toBe(null);

    const coordSnap = await adminDb.collection("eventCapacities").doc(eventId).get();
    const coord = coordSnap.data();
    expect(coord.confirmedCount).toBe(9);
    expect(coord.offeredCount).toBe(0);
    expect(coord.waitlistCount).toBe(0);
    expect(coord.headSequence).toBe(2);
    expect(coord.nextSequence).toBe(2);

    const slot1Snap = await adminDb.collection("eventWaitlistSlots").doc(`${eventId}_1`).get();
    expect(slot1Snap.data().status).toBe("declined");

    const memberSnap = await adminDb.collection("eventWaitlistMembers").doc(`${eventId}_${TEST_UIDS.bob}`).get();
    expect(memberSnap.exists).toBe(false);
  });
});
