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
  EVENT_VISIBILITIES,
} from "../../src/constants.js";
import {
  TEST_IDS,
  TEST_UIDS,
  commentFixture,
  connectionFixture,
  conversationFixture,
  messageFixture,
  notificationFixture,
  postFixture,
  seedBaseData,
  userFixture,
  publicProfileFixture,
  directoryIndexFixture,
  campusFixture,
  communityFixture,
  communityMemberFixture,
  eventFixture,
  eventRsvpFixture,
  eventNotificationDeliveryFixture,
  eventRsvpNotificationFixture,
  eventCancelledNotificationFixture,
} from "./fixtures.js";

const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const timestamp = firebase.firestore.Timestamp.fromMillis(1_700_000_000_000);
const laterTimestamp = firebase.firestore.Timestamp.fromMillis(1_700_000_001_000);

const contextFor = (uid, email = `${uid}@example.test`) =>
  testEnvironment.authenticatedContext(uid, { email });

const unauthenticated = () => testEnvironment.unauthenticatedContext();

async function expectPermissionDenied(operation) {
  await expect(operation()).rejects.toMatchObject({ code: "permission-denied" });
}

function campusRef(context, campusId) {
  return context.firestore().collection("campuses").doc(campusId);
}

function communityRef(context, communityId) {
  return context.firestore().collection("communities").doc(communityId);
}

function communityMemberRef(context, membershipId) {
  return context.firestore().collection("communityMembers").doc(membershipId);
}

function eventRef(context, eventId) {
  return context.firestore().collection("events").doc(eventId);
}

function eventRsvpRef(context, rsvpId) {
  return context.firestore().collection("eventRsvps").doc(rsvpId);
}

function deliveryLedgerRef(context, eventId) {
  return context.firestore().collection("eventNotificationDeliveries").doc(eventId);
}



function userRef(context, uid) {
  return context.firestore().collection("users").doc(uid);
}

function publicProfileRef(context, uid) {
  return context.firestore().collection("publicProfiles").doc(uid);
}

function directoryIndexRef(context, uid) {
  return context.firestore().collection("directoryIndex").doc(uid);
}

function postRef(context, postId) {
  return context.firestore().collection("posts").doc(postId);
}

function commentRef(context, postId, commentId) {
  return postRef(context, postId).collection("comments").doc(commentId);
}

function likeRef(context, postId, uid) {
  return postRef(context, postId).collection("likes").doc(uid);
}

function connectionRef(context, connectionId) {
  return context.firestore().collection("connections").doc(connectionId);
}

function conversationRef(context, conversationId) {
  return context.firestore().collection("conversations").doc(conversationId);
}

function messageRef(context, conversationId, messageId) {
  return conversationRef(context, conversationId).collection("messages").doc(messageId);
}

async function seedConversation(
  uidA = TEST_UIDS.alice,
  uidB = TEST_UIDS.bob,
  overrides = {}
) {
  const conversationId = [uidA, uidB].sort().join("_");
  const conversation = conversationFixture(uidA, uidB, overrides);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("conversations")
      .doc(conversationId)
      .set(conversation);
  });
  return conversation;
}

async function seedMessage(
  conversationId,
  messageId,
  senderId = TEST_UIDS.alice,
  overrides = {}
) {
  const message = messageFixture(conversationId, senderId, { id: messageId, ...overrides });
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .doc(messageId)
      .set(message);
  });
  return message;
}

function notificationRef(context, recipientId, notificationId) {
  return userRef(context, recipientId)
    .collection("notifications")
    .doc(notificationId);
}

function userCreateData(uid, overrides = {}) {
  return {
    uid,
    email: `${uid}@example.test`,
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedPendingConnection(
  senderId = TEST_UIDS.alice,
  receiverId = TEST_UIDS.bob
) {
  const connectionId = [senderId, receiverId].sort().join("_");
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("connections")
      .doc(connectionId)
      .set(connectionFixture(senderId, receiverId));
  });
}

async function seedAcceptedConnection(
  senderId = TEST_UIDS.alice,
  receiverId = TEST_UIDS.bob
) {
  const connectionId = [senderId, receiverId].sort().join("_");
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("connections")
      .doc(connectionId)
      .set(connectionFixture(senderId, receiverId, { status: "accepted" }));
  });
}

async function seedNotification(recipientId, actorId, overrides = {}) {
  const notification = notificationFixture(recipientId, actorId, overrides);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("users")
      .doc(recipientId)
      .collection("notifications")
      .doc(notification.id)
      .set(notification);
  });
  return notification;
}

async function commitCommentCreate(
  context,
  postId,
  commentId,
  authorId,
  commentOverrides = {},
  parentOverrides = {}
) {
  const db = context.firestore();
  const comment = commentFixture(authorId, {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...commentOverrides,
  });
  const batch = db.batch();

  batch.set(commentRef(context, postId, commentId), comment);
  batch.update(postRef(context, postId), {
    commentsCount: firebase.firestore.FieldValue.increment(1),
    updatedAt: serverTimestamp(),
    ...parentOverrides,
  });

  return batch.commit();
}

async function commitCommentDelete(context, postId, commentId, parentOverrides = {}) {
  const db = context.firestore();
  const batch = db.batch();

  batch.delete(commentRef(context, postId, commentId));
  batch.update(postRef(context, postId), {
    commentsCount: firebase.firestore.FieldValue.increment(-1),
    updatedAt: serverTimestamp(),
    ...parentOverrides,
  });

  return batch.commit();
}

beforeEach(async () => {
  await resetFirestore();
  await seedBaseData(testEnvironment);
});

afterAll(async () => {
  await closeTestEnvironment();
});

describe("users rules", () => {
  it("reject unauthenticated reads", async () => {
    await expectPermissionDenied(() =>
      userRef(unauthenticated(), TEST_UIDS.alice).get()
    );
  });

  it("allow owner to read their own private profile", async () => {
    await assertSucceeds(userRef(contextFor(TEST_UIDS.alice), TEST_UIDS.alice).get());
  });

  it("reject cross-user reads from private users collection", async () => {
    await expectPermissionDenied(() =>
      userRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).get()
    );
  });

  it("allow a valid owner discoverable user creation via atomic batch", async () => {
    const context = contextFor("new-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(userRef(context, "new-user"), userCreateData("new-user"));
    batch.set(publicProfileRef(context, "new-user"), publicProfileFixture("new-user"));
    batch.set(directoryIndexRef(context, "new-user"), {
      ...directoryIndexFixture("new-user"),
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("allow a valid owner non-discoverable user creation via atomic batch", async () => {
    const context = contextFor("non-disc-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(userRef(context, "non-disc-user"), userCreateData("non-disc-user", { isDiscoverable: false }));
    batch.set(publicProfileRef(context, "non-disc-user"), publicProfileFixture("non-disc-user"));
    await assertSucceeds(batch.commit());
  });

  it("reject broken/non-atomic user creation without publicProfiles", async () => {
    const context = contextFor("single-user");
    await expectPermissionDenied(() =>
      userRef(context, "single-user").set(userCreateData("single-user"))
    );
  });

  it("reject discoverable user creation missing directoryIndex", async () => {
    const context = contextFor("incomplete-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(userRef(context, "incomplete-user"), userCreateData("incomplete-user", { isDiscoverable: true }));
    batch.set(publicProfileRef(context, "incomplete-user"), publicProfileFixture("incomplete-user"));
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject non-discoverable user creation with directoryIndex", async () => {
    const context = contextFor("non-disc-with-index");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(userRef(context, "non-disc-with-index"), userCreateData("non-disc-with-index", { isDiscoverable: false }));
    batch.set(publicProfileRef(context, "non-disc-with-index"), publicProfileFixture("non-disc-with-index"));
    batch.set(directoryIndexRef(context, "non-disc-with-index"), {
      ...directoryIndexFixture("non-disc-with-index"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject a profile created under the wrong document ID", async () => {
    const context = contextFor("new-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(userRef(context, "different-document"), userCreateData("new-user"));
    batch.set(publicProfileRef(context, "new-user"), publicProfileFixture("new-user"));
    batch.set(directoryIndexRef(context, "new-user"), {
      ...directoryIndexFixture("new-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject a profile with a mismatched embedded UID", async () => {
    const context = contextFor("mismatched-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "mismatched-user"),
      userCreateData("mismatched-user", { uid: "different-uid" })
    );
    batch.set(publicProfileRef(context, "mismatched-user"), publicProfileFixture("mismatched-user"));
    batch.set(directoryIndexRef(context, "mismatched-user"), {
      ...directoryIndexFixture("mismatched-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject an extra field on profile creation", async () => {
    const context = contextFor("extra-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "extra-user"),
      userCreateData("extra-user", { role: "admin" })
    );
    batch.set(publicProfileRef(context, "extra-user"), publicProfileFixture("extra-user"));
    batch.set(directoryIndexRef(context, "extra-user"), {
      ...directoryIndexFixture("extra-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject a profile missing a required field", async () => {
    const context = contextFor("missing-user");
    const data = userCreateData("missing-user");
    delete data.isDiscoverable;
    const db = context.firestore();
    const batch = db.batch();
    batch.set(userRef(context, "missing-user"), data);
    batch.set(publicProfileRef(context, "missing-user"), publicProfileFixture("missing-user"));
    batch.set(directoryIndexRef(context, "missing-user"), {
      ...directoryIndexFixture("missing-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject legacy public fields in user create", async () => {
    const context = contextFor("legacy-create-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "legacy-create-user"),
      userCreateData("legacy-create-user", { bio: "Forbidden bio in private user doc" })
    );
    batch.set(publicProfileRef(context, "legacy-create-user"), publicProfileFixture("legacy-create-user"));
    batch.set(directoryIndexRef(context, "legacy-create-user"), {
      ...directoryIndexFixture("legacy-create-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject invalid profile primitive types", async () => {
    const context = contextFor("invalid-type-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "invalid-type-user"),
      userCreateData("invalid-type-user", { isDiscoverable: "true" })
    );
    batch.set(publicProfileRef(context, "invalid-type-user"), publicProfileFixture("invalid-type-user"));
    batch.set(directoryIndexRef(context, "invalid-type-user"), {
      ...directoryIndexFixture("invalid-type-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject invalid nested preference shapes", async () => {
    const context = contextFor("invalid-preferences-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "invalid-preferences-user"),
      userCreateData("invalid-preferences-user", {
        notificationPreferences: { sms: true },
      })
    );
    batch.set(publicProfileRef(context, "invalid-preferences-user"), publicProfileFixture("invalid-preferences-user"));
    batch.set(directoryIndexRef(context, "invalid-preferences-user"), {
      ...directoryIndexFixture("invalid-preferences-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject client-supplied profile timestamps", async () => {
    const context = contextFor("invalid-time-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "invalid-time-user"),
      userCreateData("invalid-time-user", { createdAt: timestamp })
    );
    batch.set(publicProfileRef(context, "invalid-time-user"), publicProfileFixture("invalid-time-user"));
    batch.set(directoryIndexRef(context, "invalid-time-user"), {
      ...directoryIndexFixture("invalid-time-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject a profile email that does not match Auth", async () => {
    const context = contextFor("email-user", "email-user@example.test");
    const db = context.firestore();
    const batch = db.batch();
    batch.set(
      userRef(context, "email-user"),
      userCreateData("email-user", { email: "spoofed@example.test" })
    );
    batch.set(publicProfileRef(context, "email-user"), publicProfileFixture("email-user"));
    batch.set(directoryIndexRef(context, "email-user"), {
      ...directoryIndexFixture("email-user"),
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });

  it("reject legacy public-field mutation under Strict Rules", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({
        bio: "Updated test bio",
        skills: ["Testing", "Rules"],
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject mixed private and legacy field update under Strict Rules", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({
        isDiscoverable: false,
        displayName: "Hacked Name",
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow updatedAt-only update on users", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      userRef(context, TEST_UIDS.alice).update({
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject unauthorized field injection (e.g. isDemo) on user update under Strict Rules", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({
        isDemo: true,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow legitimate settings updates on users", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      userRef(context, TEST_UIDS.alice).update({
        notificationPreferences: { connectionRequests: false },
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject cross-user updates and identity tampering", async () => {
    const context = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.bob).update({ isDiscoverable: false })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ uid: "spoofed" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ email: "spoofed@example.test" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ createdAt: laterTimestamp })
    );
  });

  it("reject invalid settings update types and field injection", async () => {
    const context = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ role: "admin" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({
        notificationPreferences: { connectionAccepted: "yes" },
      })
    );
  });

  it("reject user deletion", async () => {
    await expectPermissionDenied(() =>
      userRef(contextFor(TEST_UIDS.alice), TEST_UIDS.alice).delete()
    );
  });
});

describe("publicProfiles rules", () => {
  it("allow authenticated read of any public profile", async () => {
    await assertSucceeds(publicProfileRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).get());
  });

  it("reject unauthenticated read of public profiles", async () => {
    await expectPermissionDenied(() =>
      publicProfileRef(unauthenticated(), TEST_UIDS.bob).get()
    );
  });

  it("reject public profile update by non-owner", async () => {
    await expectPermissionDenied(() =>
      publicProfileRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).update({
        bio: "Hacked bio",
      })
    );
  });

  it("reject discoverable profile update without matching directoryIndex update", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      publicProfileRef(context, TEST_UIDS.alice).update({
        department: "Information Technology",
      })
    );
  });

  it("allow discoverable profile update with matching directoryIndex update", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const batch = db.batch();
    batch.update(publicProfileRef(context, TEST_UIDS.alice), {
      department: "Information Technology",
    });
    batch.update(directoryIndexRef(context, TEST_UIDS.alice), {
      department: "Information Technology",
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("reject public profile with timestamps or private fields", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const batch = db.batch();
    batch.update(publicProfileRef(context, TEST_UIDS.alice), {
      department: "Information Technology",
      updatedAt: serverTimestamp(),
    });
    batch.update(directoryIndexRef(context, TEST_UIDS.alice), {
      department: "Information Technology",
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });
});

describe("directoryIndex rules", () => {
  it("allow authenticated read of directory index", async () => {
    await assertSucceeds(directoryIndexRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).get());
  });

  it("reject unauthenticated read of directory index", async () => {
    await expectPermissionDenied(() =>
      directoryIndexRef(unauthenticated(), TEST_UIDS.bob).get()
    );
  });

  it("reject directoryIndex write by non-owner", async () => {
    await expectPermissionDenied(() =>
      directoryIndexRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).update({
        department: "IT",
      })
    );
  });

  it("reject forged directoryIndex projection", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const batch = db.batch();
    batch.update(publicProfileRef(context, TEST_UIDS.alice), {
      department: "Mathematics",
    });
    batch.update(directoryIndexRef(context, TEST_UIDS.alice), {
      department: "Physics", // forged!
      updatedAt: serverTimestamp(),
    });
    await expectPermissionDenied(() => batch.commit());
  });
});

describe("discoverability atomic transitions", () => {
  it("allow atomic discoverability toggle from true to false", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const batch = db.batch();
    batch.update(userRef(context, TEST_UIDS.alice), {
      isDiscoverable: false,
      updatedAt: serverTimestamp(),
    });
    batch.delete(directoryIndexRef(context, TEST_UIDS.alice));
    await assertSucceeds(batch.commit());
  });

  it("reject non-atomic discoverability toggle from true to false (missing directoryIndex delete)", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({
        isDiscoverable: false,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow atomic discoverability toggle from false to true", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("toggle-user").set(
        userFixture("toggle-user", { isDiscoverable: false })
      );
      await ctx.firestore().collection("publicProfiles").doc("toggle-user").set(
        publicProfileFixture("toggle-user")
      );
    });

    const context = contextFor("toggle-user");
    const db = context.firestore();
    const batch = db.batch();
    batch.update(userRef(context, "toggle-user"), {
      isDiscoverable: true,
      updatedAt: serverTimestamp(),
    });
    batch.set(directoryIndexRef(context, "toggle-user"), {
      ...directoryIndexFixture("toggle-user"),
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("reject non-atomic discoverability toggle from false to true (missing directoryIndex create)", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("users").doc("toggle-user-2").set(
        userFixture("toggle-user-2", { isDiscoverable: false })
      );
      await ctx.firestore().collection("publicProfiles").doc("toggle-user-2").set(
        publicProfileFixture("toggle-user-2")
      );
    });

    const context = contextFor("toggle-user-2");
    await expectPermissionDenied(() =>
      userRef(context, "toggle-user-2").update({
        isDiscoverable: true,
        updatedAt: serverTimestamp(),
      })
    );
  });
});

describe("posts rules", () => {
  it("reject unauthenticated reads", async () => {
    await expectPermissionDenied(() =>
      postRef(unauthenticated(), TEST_IDS.alicePost).get()
    );
  });

  it("allow an authenticated user to create a correctly initialized post", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      context.firestore().collection("posts").doc("new-post").set({
        authorId: TEST_UIDS.alice,
        authorName: "Alice Test",
        authorAvatar: null,
        content: "A new post",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject posts with a different author, nonzero counters, or client time", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const basePost = {
      authorId: TEST_UIDS.alice,
      authorName: "Alice Test",
      authorAvatar: null,
      content: "Invalid post",
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("wrong-author").set({
        ...basePost,
        authorId: TEST_UIDS.bob,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("wrong-counter").set({
        ...basePost,
        likesCount: 1,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("wrong-time").set({
        ...postFixture("wrong-time", TEST_UIDS.alice, { createdAt: timestamp }),
      })
    );
  });

  it("allow post creation with a string authorAvatar", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      context.firestore().collection("posts").doc("post-with-avatar").set({
        authorId: TEST_UIDS.alice,
        authorName: "Alice Test",
        authorAvatar: "https://example.test/avatar.png",
        content: "A post with an avatar string.",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow post creation with maximum 2000-character content", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      context.firestore().collection("posts").doc("post-max-content").set({
        authorId: TEST_UIDS.alice,
        authorName: "Alice Test",
        authorAvatar: null,
        content: "A".repeat(2000),
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject post creation with extra or unknown fields", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("post-extra-field").set({
        authorId: TEST_UIDS.alice,
        authorName: "Alice Test",
        authorAvatar: null,
        content: "Extra field post",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        extraField: "not-allowed",
      })
    );
  });

  it("reject post creation missing required fields", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const validPost = {
      authorId: TEST_UIDS.alice,
      authorName: "Alice Test",
      authorAvatar: null,
      content: "Valid payload template",
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const requiredKeys = Object.keys(validPost);
    for (const key of requiredKeys) {
      const payload = { ...validPost };
      delete payload[key];
      await expectPermissionDenied(() =>
        context.firestore().collection("posts").doc(`post-missing-${key}`).set(payload)
      );
    }
  });

  it("reject post creation with invalid authorName, authorAvatar, or content types", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const validPost = {
      authorId: TEST_UIDS.alice,
      authorName: "Alice Test",
      authorAvatar: null,
      content: "Valid payload template",
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("bad-name").set({
        ...validPost,
        authorName: 12345,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("bad-avatar-number").set({
        ...validPost,
        authorAvatar: 42,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("bad-avatar-bool").set({
        ...validPost,
        authorAvatar: false,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("bad-content-number").set({
        ...validPost,
        content: 12345,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("bad-content-array").set({
        ...validPost,
        content: ["hello"],
      })
    );
  });

  it("reject post creation with empty content or content exceeding 2000 characters", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const validPost = {
      authorId: TEST_UIDS.alice,
      authorName: "Alice Test",
      authorAvatar: null,
      content: "Valid payload template",
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("empty-content").set({
        ...validPost,
        content: "",
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("too-long-content").set({
        ...validPost,
        content: "A".repeat(2001),
      })
    );
  });

  it("reject post creation with nonzero commentsCount", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const validPost = {
      authorId: TEST_UIDS.alice,
      authorName: "Alice Test",
      authorAvatar: null,
      content: "Valid payload template",
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("nonzero-comments-1").set({
        ...validPost,
        commentsCount: 1,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("nonzero-comments-neg").set({
        ...validPost,
        commentsCount: -1,
      })
    );
  });

  it("reject post creation with forged or client-controlled timestamps", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const validPost = {
      authorId: TEST_UIDS.alice,
      authorName: "Alice Test",
      authorAvatar: null,
      content: "Valid payload template",
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("forged-created-at").set({
        ...validPost,
        createdAt: timestamp,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("forged-updated-at").set({
        ...validPost,
        updatedAt: timestamp,
      })
    );
    await expectPermissionDenied(() =>
      context.firestore().collection("posts").doc("forged-both-times").set({
        ...validPost,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
  });

  it("allow only the post author to delete", async () => {
    await assertSucceeds(
      postRef(contextFor(TEST_UIDS.alice), TEST_IDS.alicePost).delete()
    );

    await expectPermissionDenied(() =>
      postRef(contextFor(TEST_UIDS.alice), TEST_IDS.bobPost).delete()
    );
  });

  it("allow a valid atomic like transaction", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const like = likeRef(context, TEST_IDS.bobPost, TEST_UIDS.alice);
    const post = postRef(context, TEST_IDS.bobPost);

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(like);
        const postSnapshot = await transaction.get(post);
        transaction.set(like, {
          userId: TEST_UIDS.alice,
          createdAt: serverTimestamp(),
        });
        transaction.update(post, {
          likesCount: postSnapshot.data().likesCount + 1,
          updatedAt: serverTimestamp(),
        });
      })
    );
  });

  it("allow a valid atomic unlike transaction", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("posts").doc(TEST_IDS.bobPost).update({ likesCount: 1 });
      await db
        .collection("posts")
        .doc(TEST_IDS.bobPost)
        .collection("likes")
        .doc(TEST_UIDS.alice)
        .set({ userId: TEST_UIDS.alice, createdAt: timestamp });
    });

    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const like = likeRef(context, TEST_IDS.bobPost, TEST_UIDS.alice);
    const post = postRef(context, TEST_IDS.bobPost);

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(like);
        const postSnapshot = await transaction.get(post);
        transaction.delete(like);
        transaction.update(post, {
          likesCount: postSnapshot.data().likesCount - 1,
          updatedAt: serverTimestamp(),
        });
      })
    );
  });

  it("reject a like transaction with an incorrect counter delta", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const like = likeRef(context, TEST_IDS.bobPost, TEST_UIDS.alice);
    const post = postRef(context, TEST_IDS.bobPost);

    await expectPermissionDenied(() =>
      db.runTransaction(async (transaction) => {
        transaction.set(like, {
          userId: TEST_UIDS.alice,
          createdAt: serverTimestamp(),
        });
        transaction.update(post, {
          likesCount: 2,
          updatedAt: serverTimestamp(),
        });
      })
    );
  });

  it("reject an unlike transaction when the like did not previously exist", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("posts")
        .doc(TEST_IDS.bobPost)
        .update({ likesCount: 1 });
    });

    const context = contextFor(TEST_UIDS.alice);
    const db = context.firestore();
    const like = likeRef(context, TEST_IDS.bobPost, TEST_UIDS.alice);
    const post = postRef(context, TEST_IDS.bobPost);

    await expectPermissionDenied(() =>
      db.runTransaction(async (transaction) => {
        await transaction.get(like);
        await transaction.get(post);
        transaction.delete(like);
        transaction.update(post, {
          likesCount: 0,
          updatedAt: serverTimestamp(),
        });
      })
    );
  });

  it("reject generic author updates to content and protected fields", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const post = postRef(context, TEST_IDS.alicePost);

    await expectPermissionDenied(() => post.update({ content: "Edited" }));
    await expectPermissionDenied(() => post.update({ authorName: "Forged" }));
    await expectPermissionDenied(() => post.update({ authorAvatar: "forged" }));
    await expectPermissionDenied(() => post.update({ createdAt: laterTimestamp }));
    await expectPermissionDenied(() =>
      post.update({ likesCount: 99, updatedAt: serverTimestamp() })
    );
    await expectPermissionDenied(() =>
      post.update({ commentsCount: 99, updatedAt: serverTimestamp() })
    );
    await expectPermissionDenied(() =>
      post.update({ arbitraryField: true })
    );
  });

  it("reject arbitrary comment-counter jumps", async () => {
    await expectPermissionDenied(() =>
      postRef(contextFor(TEST_UIDS.carol), TEST_IDS.alicePost).update({
        commentsCount: 99,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject a comment-counter update with a non-server timestamp", async () => {
    await expectPermissionDenied(() =>
      postRef(contextFor(TEST_UIDS.carol), TEST_IDS.alicePost).update({
        commentsCount: 2,
        updatedAt: laterTimestamp,
      })
    );
  });

  it("KNOWN GAP 13C: parent-only exact comment counter update remains possible", async () => {
    await assertSucceeds(
      postRef(contextFor(TEST_UIDS.carol), TEST_IDS.alicePost).update({
        commentsCount: 2,
        updatedAt: serverTimestamp(),
      })
    );
  });
});

describe("comments rules", () => {
  it("reject unauthenticated reads", async () => {
    await expectPermissionDenied(() =>
      commentRef(unauthenticated(), TEST_IDS.alicePost, TEST_IDS.existingComment).get()
    );
  });

  it("allow a canonical comment create with the parent +1 batch", async () => {
    await assertSucceeds(
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-valid",
        TEST_UIDS.bob
      )
    );
  });

  it("reject a forged author name", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-forged-name",
        TEST_UIDS.bob,
        { authorName: "Forged Name" }
      )
    );
  });

  it("reject a forged author avatar", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-forged-avatar",
        TEST_UIDS.bob,
        { authorAvatar: "https://example.test/forged.png" }
      )
    );
  });

  it("reject an extra comment field", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-extra-field",
        TEST_UIDS.bob,
        { role: "admin" }
      )
    );
  });

  it("reject invalid comment content types", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-invalid-content",
        TEST_UIDS.bob,
        { content: 42 }
      )
    );
  });

  it("reject invalid comment timestamps", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-invalid-time",
        TEST_UIDS.bob,
        { createdAt: timestamp }
      )
    );
  });

  it("reject a comment with the wrong author ID", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-wrong-author",
        TEST_UIDS.bob,
        { authorId: TEST_UIDS.alice }
      )
    );
  });

  it("reject a comment missing a required field", async () => {
    const data = commentFixture(TEST_UIDS.bob, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    delete data.authorAvatar;
    const context = contextFor(TEST_UIDS.bob);
    const db = context.firestore();
    const batch = db.batch();

    batch.set(commentRef(context, TEST_IDS.bobPost, "comment-missing-field"), data);
    batch.update(postRef(context, TEST_IDS.bobPost), {
      commentsCount: firebase.firestore.FieldValue.increment(1),
      updatedAt: serverTimestamp(),
    });

    await expectPermissionDenied(() => batch.commit());
  });

  it("reject standalone comment creation", async () => {
    const context = contextFor(TEST_UIDS.bob);
    await expectPermissionDenied(() =>
      commentRef(context, TEST_IDS.bobPost, "comment-standalone").set({
        ...commentFixture(TEST_UIDS.bob),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow a valid comment deletion with the parent -1 batch", async () => {
    await assertSucceeds(
      commitCommentDelete(
        contextFor(TEST_UIDS.alice),
        TEST_IDS.alicePost,
        TEST_IDS.existingComment
      )
    );
  });

  it("reject standalone comment deletion", async () => {
    await expectPermissionDenied(() =>
      commentRef(
        contextFor(TEST_UIDS.alice),
        TEST_IDS.alicePost,
        TEST_IDS.existingComment
      ).delete()
    );
  });

  it("reject a wrong comment counter delta", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-wrong-delta",
        TEST_UIDS.bob,
        {},
        { commentsCount: firebase.firestore.FieldValue.increment(2) }
      )
    );
  });

  it("reject comment counter underflow", async () => {
    await expectPermissionDenied(() =>
      commitCommentDelete(
        contextFor(TEST_UIDS.alice),
        TEST_IDS.alicePost,
        TEST_IDS.existingComment,
        { commentsCount: firebase.firestore.FieldValue.increment(-2) }
      )
    );
  });

  it("reject a comment batch with a non-server parent updatedAt", async () => {
    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-invalid-parent-time",
        TEST_UIDS.bob,
        {},
        { updatedAt: laterTimestamp }
      )
    );
  });

  it("reject all comment updates", async () => {
    await expectPermissionDenied(() =>
      commentRef(
        contextFor(TEST_UIDS.alice),
        TEST_IDS.alicePost,
        TEST_IDS.existingComment
      ).update({ content: "Edited comment" })
    );
  });

  it("reject a non-author comment deletion", async () => {
    await expectPermissionDenied(() =>
      commitCommentDelete(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.alicePost,
        TEST_IDS.existingComment
      )
    );
  });

  it("reject comment creation when actor is missing publicProfiles authority", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("publicProfiles")
        .doc(TEST_UIDS.bob)
        .delete();
    });

    await expectPermissionDenied(() =>
      commitCommentCreate(
        contextFor(TEST_UIDS.bob),
        TEST_IDS.bobPost,
        "comment-missing-pubprofile",
        TEST_UIDS.bob
      )
    );
  });
});

describe("likes rules", () => {
  it("reject unauthenticated reads", async () => {
    await expectPermissionDenied(() =>
      likeRef(unauthenticated(), TEST_IDS.alicePost, TEST_UIDS.alice).get()
    );
  });

  it("allow a user to create and delete an exact own like", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const ref = likeRef(context, TEST_IDS.alicePost, TEST_UIDS.alice);

    await assertSucceeds(
      ref.set({ userId: TEST_UIDS.alice, createdAt: serverTimestamp() })
    );
    await assertSucceeds(ref.delete());
  });

  it("reject like extra fields", async () => {
    await expectPermissionDenied(() =>
      likeRef(contextFor(TEST_UIDS.alice), TEST_IDS.alicePost, TEST_UIDS.alice).set({
        userId: TEST_UIDS.alice,
        createdAt: serverTimestamp(),
        forgedMetadata: true,
      })
    );
  });

  it("reject a like missing a required field", async () => {
    await expectPermissionDenied(() =>
      likeRef(contextFor(TEST_UIDS.alice), TEST_IDS.alicePost, TEST_UIDS.alice).set({
        userId: TEST_UIDS.alice,
      })
    );
  });

  it("reject a like with an invalid timestamp", async () => {
    await expectPermissionDenied(() =>
      likeRef(contextFor(TEST_UIDS.alice), TEST_IDS.alicePost, TEST_UIDS.alice).set({
        userId: TEST_UIDS.alice,
        createdAt: timestamp,
      })
    );
  });

  it("reject mismatched like identities and paths", async () => {
    const alice = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      likeRef(alice, TEST_IDS.alicePost, TEST_UIDS.alice).set({
        userId: TEST_UIDS.bob,
        createdAt: serverTimestamp(),
      })
    );
    await expectPermissionDenied(() =>
      likeRef(alice, TEST_IDS.alicePost, TEST_UIDS.bob).set({
        userId: TEST_UIDS.bob,
        createdAt: serverTimestamp(),
      })
    );
  });

  it("reject like updates", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("posts")
        .doc(TEST_IDS.alicePost)
        .collection("likes")
        .doc(TEST_UIDS.alice)
        .set({ userId: TEST_UIDS.alice, createdAt: timestamp });
    });

    const context = contextFor(TEST_UIDS.alice);
    const ref = likeRef(context, TEST_IDS.alicePost, TEST_UIDS.alice);
    await expectPermissionDenied(() => ref.update({ userId: "changed" }));
  });

  it("reject a non-owner like deletion", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("posts")
        .doc(TEST_IDS.alicePost)
        .collection("likes")
        .doc(TEST_UIDS.alice)
        .set({ userId: TEST_UIDS.alice, createdAt: timestamp });
    });

    await expectPermissionDenied(() =>
      likeRef(contextFor(TEST_UIDS.bob), TEST_IDS.alicePost, TEST_UIDS.alice).delete()
    );
  });
});

describe("connections rules", () => {
  it("allow participants to read and query their relationships", async () => {
    await seedPendingConnection();
    const alice = contextFor(TEST_UIDS.alice);
    const carol = contextFor(TEST_UIDS.carol);

    await assertSucceeds(connectionRef(alice, "alice_bob").get());
    await expectPermissionDenied(() => connectionRef(carol, "alice_bob").get());
    await assertSucceeds(
      alice.firestore().collection("connections").where("users", "array-contains", "alice").get()
    );
    await expectPermissionDenied(() =>
      carol.firestore().collection("connections").where("users", "array-contains", "alice").get()
    );
  });

  it("allow authenticated missing-document reads for transaction prechecks", async () => {
    await assertSucceeds(connectionRef(contextFor(TEST_UIDS.carol), "carol_alice").get());
  });

  it("allow a valid canonical pending request", async () => {
    const alice = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      connectionRef(alice, "alice_bob").set({
        ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject invalid connection IDs, participants, states, and fields", async () => {
    const alice = contextFor(TEST_UIDS.alice);
    const base = {
      ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.bob),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() => connectionRef(alice, "wrong_id").set(base));
    await expectPermissionDenied(() =>
      connectionRef(alice, "alice_bob").set({
        ...base,
        users: [TEST_UIDS.bob, TEST_UIDS.alice],
      })
    );
    await expectPermissionDenied(() =>
      connectionRef(alice, "alice_bob").set({ ...base, receiverId: TEST_UIDS.alice })
    );
    await expectPermissionDenied(() =>
      connectionRef(alice, "alice_bob").set({ ...base, status: "accepted" })
    );
    await expectPermissionDenied(() =>
      connectionRef(alice, "alice_bob").set({ ...base, extra: true })
    );
  });

  it("allow only the receiver to accept a pending request", async () => {
    await seedPendingConnection();
    const bob = contextFor(TEST_UIDS.bob);
    const alice = contextFor(TEST_UIDS.alice);

    await assertSucceeds(
      connectionRef(bob, "alice_bob").update({
        status: "accepted",
        updatedAt: serverTimestamp(),
      })
    );

    await seedPendingConnection(TEST_UIDS.alice, TEST_UIDS.carol);
    await expectPermissionDenied(() =>
      connectionRef(alice, "alice_carol").update({
        status: "accepted",
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow the correct pending and accepted deletions", async () => {
    await seedPendingConnection();
    await assertSucceeds(connectionRef(contextFor(TEST_UIDS.alice), "alice_bob").delete());

    await seedPendingConnection();
    await assertSucceeds(connectionRef(contextFor(TEST_UIDS.bob), "alice_bob").delete());

    await seedAcceptedConnection();
    await assertSucceeds(connectionRef(contextFor(TEST_UIDS.bob), "alice_bob").delete());

    await seedAcceptedConnection();
    await expectPermissionDenied(() =>
      connectionRef(contextFor(TEST_UIDS.carol), "alice_bob").delete()
    );
  });
});

describe("notifications rules", () => {
  it("allow the recipient to list notifications and reject another user's list", async () => {
    await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const alice = contextFor(TEST_UIDS.alice);

    await assertSucceeds(
      bob.firestore().collection("users").doc("bob").collection("notifications").get()
    );
    await expectPermissionDenied(() =>
      alice.firestore().collection("users").doc("bob").collection("notifications").get()
    );
  });

  it("allow only the recipient to point-read a request notification", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await assertSucceeds(
      notificationRef(contextFor(TEST_UIDS.bob), TEST_UIDS.bob, notification.id).get()
    );
    await expectPermissionDenied(() =>
      notificationRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob, notification.id).get()
    );
  });

  it("reject an actor point-read of an acceptance notification", async () => {
    const notification = await seedNotification(TEST_UIDS.alice, TEST_UIDS.bob, {
      id: "acc_alice_bob",
      type: "connection_accepted",
    });
    await expectPermissionDenied(() =>
      notificationRef(contextFor(TEST_UIDS.bob), TEST_UIDS.alice, notification.id).get()
    );
  });

  it("reject an unrelated user's notification point-read", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      notificationRef(contextFor(TEST_UIDS.carol), TEST_UIDS.bob, notification.id).get()
    );
  });

  it("allow a valid request notification only with its connection transaction", async () => {
    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const notification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        transaction.set(connection, {
          ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.bob),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(notification, {
          ...notificationFixture(TEST_UIDS.bob, TEST_UIDS.alice),
          createdAt: serverTimestamp(),
        });
      })
    );
  });

  it("reject an orphan or forged request notification", async () => {
    const alice = contextFor(TEST_UIDS.alice);
    const orphan = notificationRef(alice, TEST_UIDS.bob, "req_alice_bob_orphan");

    await expectPermissionDenied(() =>
      orphan.set({
        ...notificationFixture(TEST_UIDS.bob, TEST_UIDS.alice, {
          id: "req_alice_bob_orphan",
          referenceId: "alice_bob_orphan",
          createdAt: serverTimestamp(),
        }),
      })
    );

    const db = alice.firestore();
    await expectPermissionDenied(() =>
      db.runTransaction(async (transaction) => {
        transaction.set(db.collection("connections").doc("alice_bob"), {
          ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.bob),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(
          db.collection("users").doc("bob").collection("notifications").doc("req_alice_bob"),
          {
            ...notificationFixture(TEST_UIDS.bob, TEST_UIDS.alice, {
              actorName: "Forged Alice",
              createdAt: serverTimestamp(),
            }),
          }
        );
      })
    );
  });

  it("allow a valid acceptance notification with the accepted transition", async () => {
    await seedPendingConnection();
    await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const incomingNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");
    const notification = db
      .collection("users")
      .doc("alice")
      .collection("notifications")
      .doc("acc_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        await transaction.get(incomingNotification);
        transaction.update(connection, {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
        transaction.delete(incomingNotification);
        transaction.set(notification, {
          ...notificationFixture(TEST_UIDS.alice, TEST_UIDS.bob, {
            id: "acc_alice_bob",
            type: "connection_accepted",
            createdAt: serverTimestamp(),
          }),
        });
      })
    );
  });

  it("allow acceptance to refresh an existing deterministic notification only during the transition", async () => {
    await seedPendingConnection();
    await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await seedNotification(TEST_UIDS.alice, TEST_UIDS.bob, {
      id: "acc_alice_bob",
      type: "connection_accepted",
      isRead: true,
    });

    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const incomingNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");
    const acceptanceNotification = db
      .collection("users")
      .doc("alice")
      .collection("notifications")
      .doc("acc_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        await transaction.get(incomingNotification);
        transaction.update(connection, {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
        transaction.delete(incomingNotification);
        transaction.set(acceptanceNotification, {
          ...notificationFixture(TEST_UIDS.alice, TEST_UIDS.bob, {
            id: "acc_alice_bob",
            type: "connection_accepted",
            createdAt: serverTimestamp(),
          }),
        });
      })
    );

    const alice = contextFor(TEST_UIDS.alice);
    const acceptanceSnapshot = await assertSucceeds(
      notificationRef(alice, TEST_UIDS.alice, "acc_alice_bob").get()
    );
    expect(acceptanceSnapshot.data().isRead).toBe(false);
    await expectPermissionDenied(() =>
      notificationRef(bob, TEST_UIDS.alice, "acc_alice_bob").update({ isRead: true })
    );
  });

  it("allow acceptance to preserve an existing deterministic notification", async () => {
    await seedPendingConnection();
    await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await seedNotification(TEST_UIDS.alice, TEST_UIDS.bob, {
      id: "acc_alice_bob",
      type: "connection_accepted",
    });

    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const incomingNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        await transaction.get(incomingNotification);
        transaction.update(connection, {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
        transaction.delete(incomingNotification);
      })
    );

    const alice = contextFor(TEST_UIDS.alice);
    const acceptanceSnapshot = await assertSucceeds(
      notificationRef(alice, TEST_UIDS.alice, "acc_alice_bob").get()
    );
    expect(acceptanceSnapshot.exists).toBe(true);
  });

  it("allow only the recipient to update isRead", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const alice = contextFor(TEST_UIDS.alice);

    await assertSucceeds(
      notificationRef(bob, TEST_UIDS.bob, notification.id).update({ isRead: true })
    );
    await expectPermissionDenied(() =>
      notificationRef(bob, TEST_UIDS.bob, notification.id).update({ actorName: "Tampered" })
    );
    await expectPermissionDenied(() =>
      notificationRef(alice, TEST_UIDS.bob, notification.id).update({ isRead: true })
    );
  });

  it("allow the recipient to delete a notification", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await assertSucceeds(
      notificationRef(contextFor(TEST_UIDS.bob), TEST_UIDS.bob, notification.id).delete()
    );
  });

  it("allow request cancellation cleanup without an actor notification read", async () => {
    await seedPendingConnection();
    await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const requestNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        transaction.delete(connection);
        transaction.delete(requestNotification);
      })
    );
  });

  it("allow idempotent cancellation cleanup when the notification is absent", async () => {
    await seedPendingConnection();
    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const requestNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        transaction.delete(connection);
        transaction.delete(requestNotification);
      })
    );
  });

  it("reject actor deletion outside a valid pending cancellation", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await expectPermissionDenied(() =>
      notificationRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob, notification.id).delete()
    );
  });

  it("allow recipient cleanup during rejection", async () => {
    await seedPendingConnection();
    await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const requestNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        await transaction.get(requestNotification);
        transaction.delete(connection);
        transaction.delete(requestNotification);
      })
    );
  });

  it("reject notification creation when actor is missing publicProfiles authority", async () => {
    await seedPendingConnection();

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("publicProfiles")
        .doc(TEST_UIDS.alice)
        .delete();
    });

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const notification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");

    await expectPermissionDenied(() =>
      db.runTransaction(async (transaction) => {
        transaction.set(connection, {
          ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.bob),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(notification, {
          ...notificationFixture(TEST_UIDS.bob, TEST_UIDS.alice),
          createdAt: serverTimestamp(),
        });
      })
    );
  });
});

describe("conversations rules", () => {
  it("allow participants to read and query their conversation", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);

    // Point get
    await assertSucceeds(conversationRef(alice, "alice_bob").get());
    await assertSucceeds(conversationRef(bob, "alice_bob").get());

    // List query
    await assertSucceeds(
      alice
        .firestore()
        .collection("conversations")
        .where("participants", "array-contains", TEST_UIDS.alice)
        .get()
    );
  });

  it("reject unauthenticated reads to conversations", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const unauth = unauthenticated();
    await expectPermissionDenied(() => conversationRef(unauth, "alice_bob").get());
  });

  it("reject non-participant reads to conversations", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const carol = contextFor(TEST_UIDS.carol);

    // Point get
    await expectPermissionDenied(() => conversationRef(carol, "alice_bob").get());

    // List query trying to query alice's conversations
    await expectPermissionDenied(() =>
      carol
        .firestore()
        .collection("conversations")
        .where("participants", "array-contains", TEST_UIDS.alice)
        .get()
    );
  });

  it("allow valid first-message conversation creation when connection is accepted", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-first-1",
        content: "First message from Alice!",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const messageData = {
      id: "msg-first-1",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "First message from Alice!",
      createdAt: serverTimestamp(),
    };

    batch.set(conversationRef(alice, "alice_bob"), conversationData);
    batch.set(messageRef(alice, "alice_bob", "msg-first-1"), messageData);

    await assertSucceeds(batch.commit());
  });

  it("reject conversation creation with no message (missing atomic child message)", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-standalone-1",
        content: "Standalone without child message",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Attempting to write conversation document without writing the corresponding message document
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set(conversationData)
    );
  });

  it("reject conversation creation with mismatched message ID", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-declared-id",
        content: "Hello",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Message created with a different ID than lastMessage.id
    const messageData = {
      id: "msg-actual-different-id",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Hello",
      createdAt: serverTimestamp(),
    };

    batch.set(conversationRef(alice, "alice_bob"), conversationData);
    batch.set(messageRef(alice, "alice_bob", "msg-actual-different-id"), messageData);

    await expectPermissionDenied(() => batch.commit());
  });

  it("reject conversation creation with mismatched message content", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-content-mismatch",
        content: "Content in conversation summary",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const messageData = {
      id: "msg-content-mismatch",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Different content in message document",
      createdAt: serverTimestamp(),
    };

    batch.set(conversationRef(alice, "alice_bob"), conversationData);
    batch.set(messageRef(alice, "alice_bob", "msg-content-mismatch"), messageData);

    await expectPermissionDenied(() => batch.commit());
  });

  it("reject conversation creation with mismatched sender", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    // Alice tries to create conversation declaring Bob as sender
    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-sender-mismatch",
        content: "Forged message as Bob",
        senderId: "bob",
        createdAt: serverTimestamp(),
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const messageData = {
      id: "msg-sender-mismatch",
      conversationId: "alice_bob",
      senderId: "bob",
      content: "Forged message as Bob",
      createdAt: serverTimestamp(),
    };

    batch.set(conversationRef(alice, "alice_bob"), conversationData);
    batch.set(messageRef(alice, "alice_bob", "msg-sender-mismatch"), messageData);

    await expectPermissionDenied(() => batch.commit());
  });

  it("reject conversation creation with mismatched timestamp", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-time-mismatch",
        content: "Message with non-server time",
        senderId: "alice",
        createdAt: laterTimestamp,
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const messageData = {
      id: "msg-time-mismatch",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Message with non-server time",
      createdAt: laterTimestamp,
    };

    batch.set(conversationRef(alice, "alice_bob"), conversationData);
    batch.set(messageRef(alice, "alice_bob", "msg-time-mismatch"), messageData);

    await expectPermissionDenied(() => batch.commit());
  });

  it("reject conversation creation when connection does not exist", async () => {
    // No connection seeded
    const alice = contextFor(TEST_UIDS.alice);
    const conversationData = {
      ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
      lastMessage: {
        content: "Hello",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set(conversationData)
    );
  });

  it("reject conversation creation when connection is pending", async () => {
    await seedPendingConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const conversationData = {
      ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
      lastMessage: {
        content: "Hello",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set(conversationData)
    );
  });

  it("reject conversation creation with non-canonical or forged document ID", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const conversationData = {
      ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
      id: "bob_alice", // wrong order
      lastMessage: {
        content: "Hello",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Attempt writing to unsorted ID
    await expectPermissionDenied(() =>
      conversationRef(alice, "bob_alice").set(conversationData)
    );

    // Attempt mismatched doc ID
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationData,
        id: "forged_id",
      })
    );
  });

  it("reject conversation creation with unsorted or invalid participant arrays", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    // Unsorted
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        participants: ["bob", "alice"],
        lastMessage: { content: "Hello", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Only 1 participant
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        participants: ["alice"],
        lastMessage: { content: "Hello", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 3 participants
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        participants: ["alice", "bob", "carol"],
        lastMessage: { content: "Hello", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject conversation creation when actor is not a participant", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const carol = contextFor(TEST_UIDS.carol);

    await expectPermissionDenied(() =>
      conversationRef(carol, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        lastMessage: { content: "Carol injects", senderId: "carol", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject conversation creation with forged initial unread counts", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    // Sender tries to give herself unread count > 0
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        unreadCount: { alice: 1, bob: 0 },
        lastMessage: { content: "Hi", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Sender tries to give recipient unread count != 1 (e.g. 5)
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        unreadCount: { alice: 0, bob: 5 },
        lastMessage: { content: "Hi", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject conversation creation with forged participantProfiles not matching publicProfiles authority", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    // Forged displayName for Bob
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        participantProfiles: {
          alice: { displayName: "Alice Test", photoURL: null },
          bob: { displayName: "Forged Impersonator Name", photoURL: null },
        },
        lastMessage: { content: "Hi", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject conversation creation when a participant is missing publicProfiles authority", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("publicProfiles").doc(TEST_UIDS.bob).delete();
    });

    const alice = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").set({
        ...conversationFixture(TEST_UIDS.alice, TEST_UIDS.bob),
        lastMessage: { content: "Hi", senderId: "alice", createdAt: serverTimestamp() },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject conversation deletion by participant or third party", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const carol = contextFor(TEST_UIDS.carol);

    await expectPermissionDenied(() => conversationRef(alice, "alice_bob").delete());
    await expectPermissionDenied(() => conversationRef(bob, "alice_bob").delete());
    await expectPermissionDenied(() => conversationRef(carol, "alice_bob").delete());
  });

  it("allow valid message-send update transition", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 1 },
    });

    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const batch = db.batch();

    const newMsgData = {
      id: "msg-bob-reply",
      conversationId: "alice_bob",
      senderId: "bob",
      content: "Bob's reply message",
      createdAt: serverTimestamp(),
    };

    batch.update(conversationRef(bob, "alice_bob"), {
      lastMessage: {
        id: "msg-bob-reply",
        content: "Bob's reply message",
        senderId: "bob",
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
      "unreadCount.bob": 0,
      "unreadCount.alice": 1, // alice had 0, now 0 + 1 = 1
    });
    batch.set(messageRef(bob, "alice_bob", "msg-bob-reply"), newMsgData);

    await assertSucceeds(batch.commit());
  });

  it("reject existing-thread metadata update with no message", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 1 },
    });

    const bob = contextFor(TEST_UIDS.bob);

    // Bob tries to update conversation metadata without writing a corresponding message document
    await expectPermissionDenied(() =>
      conversationRef(bob, "alice_bob").update({
        lastMessage: {
          id: "msg-orphan-update",
          content: "Bob's forged message update",
          senderId: "bob",
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        "unreadCount.bob": 0,
        "unreadCount.alice": 1,
      })
    );
  });

  it("reject existing-thread metadata update with mismatched message summary", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 1 },
    });

    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const batch = db.batch();

    batch.update(conversationRef(bob, "alice_bob"), {
      lastMessage: {
        id: "msg-mismatched-summary",
        content: "Summary in conversation says this",
        senderId: "bob",
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
      "unreadCount.bob": 0,
      "unreadCount.alice": 1,
    });
    batch.set(messageRef(bob, "alice_bob", "msg-mismatched-summary"), {
      id: "msg-mismatched-summary",
      conversationId: "alice_bob",
      senderId: "bob",
      content: "Actual message document content is completely different",
      createdAt: serverTimestamp(),
    });

    await expectPermissionDenied(() => batch.commit());
  });

  it("allow valid atomic message and conversation update", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 2 },
    });

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    const msgId = "msg-alice-atomic-update";
    const content = "Alice replies back atomically";

    batch.update(conversationRef(alice, "alice_bob"), {
      lastMessage: {
        id: msgId,
        content,
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
      "unreadCount.alice": 0,
      "unreadCount.bob": 3, // 2 + 1 = 3
    });
    batch.set(messageRef(alice, "alice_bob", msgId), {
      id: msgId,
      conversationId: "alice_bob",
      senderId: "alice",
      content,
      createdAt: serverTimestamp(),
    });

    await assertSucceeds(batch.commit());
  });

  it("reject message-send update attempting to forge sender unread count", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 1 },
    });

    const bob = contextFor(TEST_UIDS.bob);

    // Bob tries to set his own unread count to 2 instead of 0
    await expectPermissionDenied(() =>
      conversationRef(bob, "alice_bob").update({
        lastMessage: {
          content: "Bob's reply",
          senderId: "bob",
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        "unreadCount.bob": 2,
        "unreadCount.alice": 1,
      })
    );
  });

  it("reject message-send update attempting to forge peer unread count", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 1 },
    });

    const bob = contextFor(TEST_UIDS.bob);

    // Bob tries to reset Alice's unread count to 0 while sending
    await expectPermissionDenied(() =>
      conversationRef(bob, "alice_bob").update({
        lastMessage: {
          content: "Bob's reply",
          senderId: "bob",
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        "unreadCount.bob": 0,
        "unreadCount.alice": 0,
      })
    );

    // Bob tries to arbitrarily increment Alice's unread count by 5 instead of 1
    await expectPermissionDenied(() =>
      conversationRef(bob, "alice_bob").update({
        lastMessage: {
          content: "Bob's reply",
          senderId: "bob",
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        "unreadCount.bob": 0,
        "unreadCount.alice": 5,
      })
    );
  });

  it("reject message-send update with forged lastMessage.senderId", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    // Alice tries to update with senderId "bob" (impersonation)
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").update({
        lastMessage: {
          content: "Forged message as Bob",
          senderId: "bob",
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        "unreadCount.alice": 0,
        "unreadCount.bob": 2,
      })
    );
  });

  it("reject message-send update with non-server timestamp", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").update({
        lastMessage: {
          content: "Message with fake time",
          senderId: "alice",
          createdAt: laterTimestamp,
        },
        updatedAt: serverTimestamp(),
        "unreadCount.alice": 0,
        "unreadCount.bob": 2,
      })
    );
  });

  it("reject message-send update when connection is deleted/removed (archive check)", async () => {
    // Seed conversation, but NO connection
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").update({
        lastMessage: {
          content: "Message after disconnect",
          senderId: "alice",
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        "unreadCount.alice": 0,
        "unreadCount.bob": 2,
      })
    );
  });

  it("reject message-send update attempting to modify immutable fields", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    // Attempting to change participants
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").update({
        participants: ["alice", "carol"],
      })
    );

    // Attempting to change createdAt
    await expectPermissionDenied(() =>
      conversationRef(alice, "alice_bob").update({
        createdAt: serverTimestamp(),
      })
    );
  });

  it("allow valid own-unread reset transition (mark-as-read)", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 3 },
    });

    const bob = contextFor(TEST_UIDS.bob);

    await assertSucceeds(
      conversationRef(bob, "alice_bob").update({
        "unreadCount.bob": 0,
      })
    );
  });

  it("reject own-unread reset attempting to alter peer unread count or lastMessage", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 2, bob: 3 },
    });

    const bob = contextFor(TEST_UIDS.bob);

    // Bob attempts to reset Alice's unread count
    await expectPermissionDenied(() =>
      conversationRef(bob, "alice_bob").update({
        "unreadCount.alice": 0,
      })
    );

    // Bob attempts to modify lastMessage during unread reset
    await expectPermissionDenied(() =>
      conversationRef(bob, "alice_bob").update({
        "unreadCount.bob": 0,
        "lastMessage.content": "Tampered content",
      })
    );
  });
});

describe("messages rules", () => {
  it("allow participants to read messages in existing conversation", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedMessage("alice_bob", "msg-1", TEST_UIDS.alice);

    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);

    await assertSucceeds(messageRef(alice, "alice_bob", "msg-1").get());
    await assertSucceeds(messageRef(bob, "alice_bob", "msg-1").get());

    // Collection query
    await assertSucceeds(
      alice
        .firestore()
        .collection("conversations")
        .doc("alice_bob")
        .collection("messages")
        .get()
    );
  });

  it("allow participants to read messages after connection is removed (archive behavior)", async () => {
    // Seed conversation and message, but NO connection
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedMessage("alice_bob", "msg-1", TEST_UIDS.alice);

    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);

    // Existing messages remain readable
    await assertSucceeds(messageRef(alice, "alice_bob", "msg-1").get());
    await assertSucceeds(messageRef(bob, "alice_bob", "msg-1").get());
  });

  it("reject unauthenticated message read", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedMessage("alice_bob", "msg-1", TEST_UIDS.alice);

    const unauth = unauthenticated();
    await expectPermissionDenied(() =>
      messageRef(unauth, "alice_bob", "msg-1").get()
    );
  });

  it("reject non-participant message read", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedMessage("alice_bob", "msg-1", TEST_UIDS.alice);

    const carol = contextFor(TEST_UIDS.carol);
    await expectPermissionDenied(() =>
      messageRef(carol, "alice_bob", "msg-1").get()
    );

    // Non-participant collection query
    await expectPermissionDenied(() =>
      carol
        .firestore()
        .collection("conversations")
        .doc("alice_bob")
        .collection("messages")
        .get()
    );
  });

  it("allow valid message creation when connection is accepted", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob, {
      unreadCount: { alice: 0, bob: 0 },
    });

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    const msgData = {
      id: "msg-alice-2",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Hello Bob from accepted connection!",
      createdAt: serverTimestamp(),
    };

    batch.update(conversationRef(alice, "alice_bob"), {
      lastMessage: {
        id: "msg-alice-2",
        content: "Hello Bob from accepted connection!",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
      "unreadCount.alice": 0,
      "unreadCount.bob": 1,
    });
    batch.set(messageRef(alice, "alice_bob", "msg-alice-2"), msgData);

    await assertSucceeds(batch.commit());
  });

  it("allow atomic first-message transaction creating conversation and first message together", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();

    const conversationData = {
      id: "alice_bob",
      participants: ["alice", "bob"],
      participantProfiles: {
        alice: { displayName: "Alice Test", photoURL: null },
        bob: { displayName: "Bob Test", photoURL: null },
      },
      lastMessage: {
        id: "msg-first",
        content: "First message in thread",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      unreadCount: {
        alice: 0,
        bob: 1,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const messageData = {
      id: "msg-first",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "First message in thread",
      createdAt: serverTimestamp(),
    };

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        transaction.set(conversationRef(alice, "alice_bob"), conversationData);
        transaction.set(messageRef(alice, "alice_bob", "msg-first"), messageData);
      })
    );
  });

  it("reject child message whose data does not match lastMessage in parent conversation", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const batch = db.batch();

    batch.update(conversationRef(alice, "alice_bob"), {
      lastMessage: {
        id: "msg-child-mismatch",
        content: "Summary text in parent",
        senderId: "alice",
        createdAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
      "unreadCount.alice": 0,
      "unreadCount.bob": 2,
    });

    batch.set(messageRef(alice, "alice_bob", "msg-child-mismatch"), {
      id: "msg-child-mismatch",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Different body text in message document",
      createdAt: serverTimestamp(),
    });

    await expectPermissionDenied(() => batch.commit());
  });

  it("reject message creation when connection does not exist or was removed (archive enforcement)", async () => {
    // Seed conversation, but NO connection
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const msgData = {
      id: "msg-new",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Should fail because connection is missing",
      createdAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-new").set(msgData)
    );
  });

  it("reject message creation when connection is pending", async () => {
    await seedPendingConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const msgData = {
      id: "msg-new",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Should fail because connection is pending",
      createdAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-new").set(msgData)
    );
  });

  it("reject message creation by non-participant", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const carol = contextFor(TEST_UIDS.carol);
    const msgData = {
      id: "msg-carol",
      conversationId: "alice_bob",
      senderId: "carol",
      content: "Carol tries to send to alice_bob",
      createdAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      messageRef(carol, "alice_bob", "msg-carol").set(msgData)
    );
  });

  it("reject message creation with forged senderId", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const msgData = {
      id: "msg-forged-sender",
      conversationId: "alice_bob",
      senderId: "bob", // forged senderId
      content: "Alice impersonating Bob",
      createdAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-forged-sender").set(msgData)
    );
  });

  it("reject message creation with mismatched conversationId", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const msgData = {
      id: "msg-mismatched-conv",
      conversationId: "other_conversation",
      senderId: "alice",
      content: "Mismatched conversationId",
      createdAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-mismatched-conv").set(msgData)
    );
  });

  it("reject message creation with mismatched messageId", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);
    const msgData = {
      id: "different-id",
      conversationId: "alice_bob",
      senderId: "alice",
      content: "Mismatched messageId",
      createdAt: serverTimestamp(),
    };

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "target-doc-id").set(msgData)
    );
  });

  it("reject message creation with empty or oversized content", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    // Empty content
    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-empty").set({
        id: "msg-empty",
        conversationId: "alice_bob",
        senderId: "alice",
        content: "",
        createdAt: serverTimestamp(),
      })
    );

    // Oversized content (1001 chars)
    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-oversized").set({
        id: "msg-oversized",
        conversationId: "alice_bob",
        senderId: "alice",
        content: "a".repeat(1001),
        createdAt: serverTimestamp(),
      })
    );
  });

  it("reject message creation with non-server createdAt", async () => {
    await seedAcceptedConnection(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);

    const alice = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-fake-time").set({
        id: "msg-fake-time",
        conversationId: "alice_bob",
        senderId: "alice",
        content: "Fake time message",
        createdAt: laterTimestamp,
      })
    );
  });

  it("reject message updates (immutable)", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedMessage("alice_bob", "msg-1", TEST_UIDS.alice);

    const alice = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-1").update({
        content: "Edited message content",
      })
    );
  });

  it("reject message deletions", async () => {
    await seedConversation(TEST_UIDS.alice, TEST_UIDS.bob);
    await seedMessage("alice_bob", "msg-1", TEST_UIDS.alice);

    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);

    await expectPermissionDenied(() =>
      messageRef(alice, "alice_bob", "msg-1").delete()
    );
    await expectPermissionDenied(() =>
      messageRef(bob, "alice_bob", "msg-1").delete()
    );
  });
});

describe("Milestone 18 — Unit 18.2: Campuses & Multi-Tenancy Rules", () => {
  async function seedUserWithCampus(uid, campusId) {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("users").doc(uid).set(userFixture(uid, { campusId }));
      await db.collection("publicProfiles").doc(uid).set(publicProfileFixture(uid, { campusId }));
      await db.collection("directoryIndex").doc(uid).set(directoryIndexFixture(uid, { campusId }));
    });
  }

  async function seedPostWithCampus(postId, authorId, campusId, overrides = {}) {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("posts").doc(postId).set(postFixture(postId, authorId, { campusId, ...overrides }));
    });
  }

  describe("Campus document access (Goal 1)", () => {
    it("allow authenticated user to read an existing campus document", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await assertSucceeds(campusRef(alice, APEX_CAMPUS_ID).get());
    });

    it("reject unauthenticated user from reading campus documents", async () => {
      await expectPermissionDenied(() =>
        campusRef(unauthenticated(), APEX_CAMPUS_ID).get()
      );
    });

    it("reject client attempts to create a campus document", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        campusRef(alice, "unauthorized-campus").set(campusFixture("unauthorized-campus"))
      );
    });

    it("reject client attempts to update a campus document", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        campusRef(alice, APEX_CAMPUS_ID).update({ name: "Tampered University Name" })
      );
    });

    it("reject client attempts to delete a campus document", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        campusRef(alice, APEX_CAMPUS_ID).delete()
      );
    });
  });

  describe("User creation and campus immutability", () => {
    it("allow user creation with a valid existing campusId", async () => {
      const context = contextFor("student-valid-campus");
      const db = context.firestore();
      const batch = db.batch();

      batch.set(
        userRef(context, "student-valid-campus"),
        userCreateData("student-valid-campus", { campusId: APEX_CAMPUS_ID })
      );
      batch.set(
        publicProfileRef(context, "student-valid-campus"),
        publicProfileFixture("student-valid-campus", { campusId: APEX_CAMPUS_ID })
      );
      batch.set(
        directoryIndexRef(context, "student-valid-campus"),
        {
          ...directoryIndexFixture("student-valid-campus", { campusId: APEX_CAMPUS_ID }),
          updatedAt: serverTimestamp(),
        }
      );

      await assertSucceeds(batch.commit());
    });

    it("reject user creation with a non-existent campusId", async () => {
      const context = contextFor("student-invalid-campus");
      const db = context.firestore();
      const batch = db.batch();

      batch.set(
        userRef(context, "student-invalid-campus"),
        userCreateData("student-invalid-campus", { campusId: "fictional-nonexistent-campus" })
      );
      batch.set(
        publicProfileRef(context, "student-invalid-campus"),
        publicProfileFixture("student-invalid-campus", { campusId: "fictional-nonexistent-campus" })
      );

      await expectPermissionDenied(() => batch.commit());
    });

    it("reject client attempts to update or alter their campusId", async () => {
      await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
      const alice = contextFor(TEST_UIDS.alice);

      await expectPermissionDenied(() =>
        userRef(alice, TEST_UIDS.alice).update({
          campusId: ST_JUDE_CAMPUS_ID,
          updatedAt: serverTimestamp(),
        })
      );
    });
  });

  describe("Cross-campus post isolation (Goal 3)", () => {
    beforeEach(async () => {
      await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
      await seedPostWithCampus("post-apex", TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedPostWithCampus("post-st-jude", TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
    });

    it("allow student to read posts from their own campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      const bob = contextFor(TEST_UIDS.bob);

      await assertSucceeds(postRef(alice, "post-apex").get());
      await assertSucceeds(postRef(bob, "post-st-jude").get());
    });

    it("reject student from reading posts from a different campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      const bob = contextFor(TEST_UIDS.bob);

      await expectPermissionDenied(() => postRef(alice, "post-st-jude").get());
      await expectPermissionDenied(() => postRef(bob, "post-apex").get());
    });

    it("allow student to create a post scoped to their own campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await assertSucceeds(
        postRef(alice, "new-post-apex").set(
          postFixture("new-post-apex", TEST_UIDS.alice, {
            campusId: APEX_CAMPUS_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
    });

    it("reject student attempting to spoof another campus on post creation", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        postRef(alice, "spoofed-post").set(
          postFixture("spoofed-post", TEST_UIDS.alice, {
            campusId: ST_JUDE_CAMPUS_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
    });

    it("reject student without a campus from creating a campus-scoped post", async () => {
      const carol = contextFor(TEST_UIDS.carol);
      await expectPermissionDenied(() =>
        postRef(carol, "carol-post").set(
          postFixture("carol-post", TEST_UIDS.carol, {
            campusId: APEX_CAMPUS_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
    });
  });

  describe("Cross-campus post interactions (Comments & Likes)", () => {
    beforeEach(async () => {
      await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
      await seedPostWithCampus("post-apex-int", TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedPostWithCampus("post-stjude-int", TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
    });

    it("reject student from commenting on a post from another campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        commitCommentCreate(alice, "post-stjude-int", "comment-cross", TEST_UIDS.alice)
      );
    });

    it("allow student to comment on a post from their own campus", async () => {
      const bob = contextFor(TEST_UIDS.bob);
      await assertSucceeds(
        commitCommentCreate(bob, "post-stjude-int", "comment-same", TEST_UIDS.bob)
      );
    });

    it("reject student from liking a post from another campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        likeRef(alice, "post-stjude-int", TEST_UIDS.alice).set({
          userId: TEST_UIDS.alice,
          createdAt: serverTimestamp(),
        })
      );
    });

    it("allow student to like a post from their own campus", async () => {
      const bob = contextFor(TEST_UIDS.bob);
      await assertSucceeds(
        likeRef(bob, "post-stjude-int", TEST_UIDS.bob).set({
          userId: TEST_UIDS.bob,
          createdAt: serverTimestamp(),
        })
      );
    });
  });

  describe("Cross-campus connection requests", () => {
    beforeEach(async () => {
      await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.carol, APEX_CAMPUS_ID);
    });

    it("reject connection request between students of different campuses", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      const connId = [TEST_UIDS.alice, TEST_UIDS.bob].sort().join("_");
      await expectPermissionDenied(() =>
        connectionRef(alice, connId).set({
          ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.bob),
          campusId: APEX_CAMPUS_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });

    it("allow connection request between students of the same campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      const connId = [TEST_UIDS.alice, TEST_UIDS.carol].sort().join("_");
      await assertSucceeds(
        connectionRef(alice, connId).set({
          ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.carol),
          campusId: APEX_CAMPUS_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });

    it("reject connection request with spoofed campusId", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      const connId = [TEST_UIDS.alice, TEST_UIDS.carol].sort().join("_");
      await expectPermissionDenied(() =>
        connectionRef(alice, connId).set({
          ...connectionFixture(TEST_UIDS.alice, TEST_UIDS.carol),
          campusId: ST_JUDE_CAMPUS_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });
  });

  describe("Cross-campus public profile & directoryIndex reads", () => {
    beforeEach(async () => {
      await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
    });

    it("allow reading public profile of student from the same campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await assertSucceeds(publicProfileRef(alice, TEST_UIDS.alice).get());
    });

    it("reject reading public profile of student from another campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        publicProfileRef(alice, TEST_UIDS.bob).get()
      );
    });

    it("reject reading directoryIndex entry of student from another campus", async () => {
      const alice = contextFor(TEST_UIDS.alice);
      await expectPermissionDenied(() =>
        directoryIndexRef(alice, TEST_UIDS.bob).get()
      );
    });
  });

  describe("Milestone 19 — Unit 19.2: Community & Membership Rules", () => {
    async function seedCommunity(communityId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communities")
          .doc(communityId)
          .set(communityFixture(communityId, { campusId, ...overrides }));
      });
    }

    async function seedCommunityMember(
      membershipId,
      communityId,
      userId,
      campusId,
      role = COMMUNITY_MEMBER_ROLES.MEMBER,
      status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
      overrides = {}
    ) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communityMembers")
          .doc(membershipId)
          .set(
            communityMemberFixture(communityId, userId, {
              id: membershipId,
              campusId,
              role,
              status,
              ...overrides,
            })
          );
      });
    }

    describe("Communities Collection Rules", () => {
      beforeEach(async () => {
        await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
        await seedUserWithCampus(TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
        await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
        await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);
      });

      it("same-campus authenticated read succeeds", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        await assertSucceeds(communityRef(alice, "apex-ai-club").get());
      });

      it("cross-campus read fails", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        await expectPermissionDenied(() =>
          communityRef(alice, "st-jude-medical-society").get()
        );
      });

      it("unauthenticated read fails", async () => {
        await expectPermissionDenied(() =>
          communityRef(unauthenticated(), "apex-ai-club").get()
        );
      });

      it("unauthorized write fails", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        await expectPermissionDenied(() =>
          communityRef(alice, "apex-new-club").set(
            communityFixture("apex-new-club", { campusId: APEX_CAMPUS_ID })
          )
        );
      });
    });

    describe("Community Members Collection Rules", () => {
      beforeEach(async () => {
        await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
        await seedUserWithCampus(TEST_UIDS.bob, ST_JUDE_CAMPUS_ID);
        await seedUserWithCampus(TEST_UIDS.carol, APEX_CAMPUS_ID);
        await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
        await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);
      });

      it("valid membership creation succeeds", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        await assertSucceeds(
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "apex-ai-club",
            userId: TEST_UIDS.alice,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("cross-campus membership rejected", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `st-jude-medical-society_${TEST_UIDS.alice}`;
        // Alice from Apex tries to join St. Jude community with St. Jude campusId
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "st-jude-medical-society",
            userId: TEST_UIDS.alice,
            campusId: ST_JUDE_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );

        // Alice from Apex tries to join St. Jude community with Apex campusId
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "st-jude-medical-society",
            userId: TEST_UIDS.alice,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("invalid community rejected", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `non-existent-club_${TEST_UIDS.alice}`;
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "non-existent-club",
            userId: TEST_UIDS.alice,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("invalid user rejected", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        // Alice tries to create membership for Carol
        const membershipId = `apex-ai-club_${TEST_UIDS.carol}`;
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "apex-ai-club",
            userId: TEST_UIDS.carol,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );

        // Unauthenticated user rejected
        await expectPermissionDenied(() =>
          communityMemberRef(
            unauthenticated(),
            `apex-ai-club_${TEST_UIDS.alice}`
          ).set({
            id: `apex-ai-club_${TEST_UIDS.alice}`,
            communityId: "apex-ai-club",
            userId: TEST_UIDS.alice,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("privilege escalation rejected on creation", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        // Alice tries to make herself admin on create
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "apex-ai-club",
            userId: TEST_UIDS.alice,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.ADMIN,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );

        // Alice tries to make herself moderator on create
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).set({
            id: membershipId,
            communityId: "apex-ai-club",
            userId: TEST_UIDS.alice,
            campusId: APEX_CAMPUS_ID,
            role: COMMUNITY_MEMBER_ROLES.MODERATOR,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("privilege escalation rejected on update by member", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        await seedCommunityMember(
          membershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER
        );

        // Alice tries to update her role from member to admin
        await expectPermissionDenied(() =>
          communityMemberRef(alice, membershipId).update({
            role: COMMUNITY_MEMBER_ROLES.ADMIN,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("arbitrary modification of another user's membership rejected", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const carolMembershipId = `apex-ai-club_${TEST_UIDS.carol}`;
        await seedCommunityMember(
          carolMembershipId,
          "apex-ai-club",
          TEST_UIDS.carol,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER
        );

        // Alice (not admin, not owner) tries to modify Carol's status
        await expectPermissionDenied(() =>
          communityMemberRef(alice, carolMembershipId).update({
            status: COMMUNITY_MEMBER_STATUSES.REMOVED,
            updatedAt: serverTimestamp(),
          })
        );

        // Alice tries to delete Carol's membership
        await expectPermissionDenied(() =>
          communityMemberRef(alice, carolMembershipId).delete()
        );
      });

      it("allows member to delete their own membership", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        await seedCommunityMember(
          membershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER,
          COMMUNITY_MEMBER_STATUSES.ACTIVE
        );

        await assertSucceeds(
          communityMemberRef(alice, membershipId).delete()
        );

        // Verify document is absent after successful deletion
        let snapshot;
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          snapshot = await context.firestore().collection("communityMembers").doc(membershipId).get();
        });
        expect(snapshot.exists).toBe(false);
      });

      it("allows community admin to update another user's role and status", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const aliceMembershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        const carolMembershipId = `apex-ai-club_${TEST_UIDS.carol}`;

        // Alice is active admin of apex-ai-club
        await seedCommunityMember(
          aliceMembershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.ADMIN
        );
        // Carol is active member of apex-ai-club
        await seedCommunityMember(
          carolMembershipId,
          "apex-ai-club",
          TEST_UIDS.carol,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER
        );

        // Alice promotes Carol to moderator
        await assertSucceeds(
          communityMemberRef(alice, carolMembershipId).update({
            role: COMMUNITY_MEMBER_ROLES.MODERATOR,
            updatedAt: serverTimestamp(),
          })
        );
      });

      describe("H3: Community Membership Integrity & Anti-Self-Reactivation", () => {
        const alice = contextFor(TEST_UIDS.alice);
        const aliceMembershipId = `apex-ai-club_${TEST_UIDS.alice}`;

        it("allows active member to voluntarily leave by updating status to removed", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.ACTIVE
          );

          await assertSucceeds(
            communityMemberRef(alice, aliceMembershipId).update({
              status: COMMUNITY_MEMBER_STATUSES.REMOVED,
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("denies owner from updating status to active when currently removed", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.REMOVED
          );

          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).update({
              status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("denies owner from updating status to active when currently pending", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.PENDING
          );

          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).update({
              status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("denies owner from altering protected fields while attempting update", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.ACTIVE
          );

          // Attempting to change role along with status to removed
          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).update({
              role: COMMUNITY_MEMBER_ROLES.MODERATOR,
              status: COMMUNITY_MEMBER_STATUSES.REMOVED,
              updatedAt: serverTimestamp(),
            })
          );

          // Attempting to change campusId
          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).update({
              campusId: ST_JUDE_CAMPUS_ID,
              status: COMMUNITY_MEMBER_STATUSES.REMOVED,
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("denies owner from deleting their own removed membership", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.REMOVED
          );

          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).delete()
          );
        });

        it("denies owner from deleting their own pending membership", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.PENDING
          );

          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).delete()
          );
        });

        it("denies owner from recreating or overwriting an existing non-active document as active", async () => {
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.REMOVED
          );

          // Attempting to overwrite the existing removed document via set()
          await expectPermissionDenied(() =>
            communityMemberRef(alice, aliceMembershipId).set({
              id: aliceMembershipId,
              communityId: "apex-ai-club",
              userId: TEST_UIDS.alice,
              campusId: APEX_CAMPUS_ID,
              role: COMMUNITY_MEMBER_ROLES.MEMBER,
              status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
              joinedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("allows legitimate fresh join when no membership document exists", async () => {
          const carol = contextFor(TEST_UIDS.carol);
          const carolMembershipId = `apex-ai-club_${TEST_UIDS.carol}`;

          await assertSucceeds(
            communityMemberRef(carol, carolMembershipId).set({
              id: carolMembershipId,
              communityId: "apex-ai-club",
              userId: TEST_UIDS.carol,
              campusId: APEX_CAMPUS_ID,
              role: COMMUNITY_MEMBER_ROLES.MEMBER,
              status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
              joinedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("allows community administrator to reinstate a removed member", async () => {
          const carol = contextFor(TEST_UIDS.carol);
          const carolMembershipId = `apex-ai-club_${TEST_UIDS.carol}`;

          // Carol is active admin
          await seedCommunityMember(
            carolMembershipId,
            "apex-ai-club",
            TEST_UIDS.carol,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.ADMIN,
            COMMUNITY_MEMBER_STATUSES.ACTIVE
          );
          // Alice is removed member
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.REMOVED
          );

          // Admin reinstates Alice: removed -> active
          await assertSucceeds(
            communityMemberRef(carol, aliceMembershipId).update({
              status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("allows community administrator to approve a pending member", async () => {
          const carol = contextFor(TEST_UIDS.carol);
          const carolMembershipId = `apex-ai-club_${TEST_UIDS.carol}`;

          // Carol is active admin
          await seedCommunityMember(
            carolMembershipId,
            "apex-ai-club",
            TEST_UIDS.carol,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.ADMIN,
            COMMUNITY_MEMBER_STATUSES.ACTIVE
          );
          // Alice is pending member
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.PENDING
          );

          // Admin approves Alice: pending -> active
          await assertSucceeds(
            communityMemberRef(carol, aliceMembershipId).update({
              status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
              updatedAt: serverTimestamp(),
            })
          );
        });

        it("allows community administrator to delete a removed or pending membership", async () => {
          const carol = contextFor(TEST_UIDS.carol);
          const carolMembershipId = `apex-ai-club_${TEST_UIDS.carol}`;
          const bobMembershipId = `apex-ai-club_${TEST_UIDS.bob}`;

          // Carol is active admin
          await seedCommunityMember(
            carolMembershipId,
            "apex-ai-club",
            TEST_UIDS.carol,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.ADMIN,
            COMMUNITY_MEMBER_STATUSES.ACTIVE
          );

          // 1. Admin deletes removed member (Alice)
          await seedCommunityMember(
            aliceMembershipId,
            "apex-ai-club",
            TEST_UIDS.alice,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.REMOVED
          );
          await assertSucceeds(
            communityMemberRef(carol, aliceMembershipId).delete()
          );
          let removedSnapshot;
          await testEnvironment.withSecurityRulesDisabled(async (context) => {
            removedSnapshot = await context.firestore().collection("communityMembers").doc(aliceMembershipId).get();
          });
          expect(removedSnapshot.exists).toBe(false);

          // 2. Admin deletes pending member (Bob)
          await seedCommunityMember(
            bobMembershipId,
            "apex-ai-club",
            TEST_UIDS.bob,
            APEX_CAMPUS_ID,
            COMMUNITY_MEMBER_ROLES.MEMBER,
            COMMUNITY_MEMBER_STATUSES.PENDING
          );
          await assertSucceeds(
            communityMemberRef(carol, bobMembershipId).delete()
          );
          let pendingSnapshot;
          await testEnvironment.withSecurityRulesDisabled(async (context) => {
            pendingSnapshot = await context.firestore().collection("communityMembers").doc(bobMembershipId).get();
          });
          expect(pendingSnapshot.exists).toBe(false);
        });
      });

      it("same-campus community member read succeeds, cross-campus read fails", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const bob = contextFor(TEST_UIDS.bob);
        const aliceMembershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        const bobMembershipId = `st-jude-medical-society_${TEST_UIDS.bob}`;

        await seedCommunityMember(
          aliceMembershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID
        );
        await seedCommunityMember(
          bobMembershipId,
          "st-jude-medical-society",
          TEST_UIDS.bob,
          ST_JUDE_CAMPUS_ID
        );

        // Alice reads Apex membership -> succeeds
        await assertSucceeds(communityMemberRef(alice, aliceMembershipId).get());

        // Alice reads St. Jude membership -> fails
        await expectPermissionDenied(() =>
          communityMemberRef(alice, bobMembershipId).get()
        );

        // Bob reads St. Jude membership -> succeeds
        await assertSucceeds(communityMemberRef(bob, bobMembershipId).get());
      });
    });
  });

  describe("Milestone 19 — Unit 19.3: Community Content Integration Rules", () => {
    async function seedUserWithCampus(uid, campusId) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("users").doc(uid).set(userFixture(uid, { campusId }));
        await db.collection("publicProfiles").doc(uid).set(publicProfileFixture(uid, { campusId }));
        await db.collection("directoryIndex").doc(uid).set(directoryIndexFixture(uid, { campusId }));
      });
    }

    async function seedCommunity(communityId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communities")
          .doc(communityId)
          .set(communityFixture(communityId, { campusId, ...overrides }));
      });
    }

    async function seedCommunityMember(
      membershipId,
      communityId,
      userId,
      campusId,
      role = COMMUNITY_MEMBER_ROLES.MEMBER,
      status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
      overrides = {}
    ) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communityMembers")
          .doc(membershipId)
          .set(
            communityMemberFixture(communityId, userId, {
              id: membershipId,
              campusId,
              role,
              status,
              ...overrides,
            })
          );
      });
    }

    beforeEach(async () => {
      await seedUserWithCampus(TEST_UIDS.alice, APEX_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.bob, APEX_CAMPUS_ID);
      await seedUserWithCampus(TEST_UIDS.carol, ST_JUDE_CAMPUS_ID);

      await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
      await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);
    });

    describe("Campus posts (Existing behavior preserved)", () => {
      it("same campus post creation succeeds without communityId", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        await assertSucceeds(
          postRef(alice, "campus-post-alice").set(
            postFixture("campus-post-alice", TEST_UIDS.alice, {
              campusId: APEX_CAMPUS_ID,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });

      it("reject post creation targeting a different campus without communityId", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        await expectPermissionDenied(() =>
          postRef(alice, "cross-campus-post-alice").set(
            postFixture("cross-campus-post-alice", TEST_UIDS.alice, {
              campusId: ST_JUDE_CAMPUS_ID,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });
    });

    describe("Community posts", () => {
      it("active community member can create community post", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        await seedCommunityMember(
          membershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER,
          COMMUNITY_MEMBER_STATUSES.ACTIVE
        );

        await assertSucceeds(
          postRef(alice, "community-post-alice").set(
            postFixture("community-post-alice", TEST_UIDS.alice, {
              campusId: APEX_CAMPUS_ID,
              communityId: "apex-ai-club",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });

      it("non-member cannot create community post", async () => {
        const bob = contextFor(TEST_UIDS.bob);
        // Bob is on APEX_CAMPUS_ID, but has NO membership in apex-ai-club

        await expectPermissionDenied(() =>
          postRef(bob, "community-post-bob-nonmember").set(
            postFixture("community-post-bob-nonmember", TEST_UIDS.bob, {
              campusId: APEX_CAMPUS_ID,
              communityId: "apex-ai-club",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });

      it("cross-campus community post is rejected", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        // Alice is on APEX_CAMPUS_ID. Attempting to post to St. Jude's community with Apex campusId
        await expectPermissionDenied(() =>
          postRef(alice, "cross-campus-community-post-1").set(
            postFixture("cross-campus-community-post-1", TEST_UIDS.alice, {
              campusId: APEX_CAMPUS_ID,
              communityId: "st-jude-medical-society",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );

        // Attempting to post to St. Jude's community with St. Jude campusId (cross-campus spoof)
        await expectPermissionDenied(() =>
          postRef(alice, "cross-campus-community-post-2").set(
            postFixture("cross-campus-community-post-2", TEST_UIDS.alice, {
              campusId: ST_JUDE_CAMPUS_ID,
              communityId: "st-jude-medical-society",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });

      it("missing community is rejected", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        await expectPermissionDenied(() =>
          postRef(alice, "missing-community-post").set(
            postFixture("missing-community-post", TEST_UIDS.alice, {
              campusId: APEX_CAMPUS_ID,
              communityId: "nonexistent-community-xyz",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });

      it("removed member cannot create community post", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        await seedCommunityMember(
          membershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER,
          COMMUNITY_MEMBER_STATUSES.REMOVED
        );

        await expectPermissionDenied(() =>
          postRef(alice, "removed-member-post").set(
            postFixture("removed-member-post", TEST_UIDS.alice, {
              campusId: APEX_CAMPUS_ID,
              communityId: "apex-ai-club",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });

      it("pending member cannot create community post", async () => {
        const alice = contextFor(TEST_UIDS.alice);
        const membershipId = `apex-ai-club_${TEST_UIDS.alice}`;
        await seedCommunityMember(
          membershipId,
          "apex-ai-club",
          TEST_UIDS.alice,
          APEX_CAMPUS_ID,
          COMMUNITY_MEMBER_ROLES.MEMBER,
          COMMUNITY_MEMBER_STATUSES.PENDING
        );

        await expectPermissionDenied(() =>
          postRef(alice, "pending-member-post").set(
            postFixture("pending-member-post", TEST_UIDS.alice, {
              campusId: APEX_CAMPUS_ID,
              communityId: "apex-ai-club",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          )
        );
      });
    });
  });

  describe("Milestone 19 — Unit 19.8: Community Moderation & Management Rules", () => {
    async function seedUserWithCampus(uid, campusId) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("users").doc(uid).set(userFixture(uid, { campusId }));
        await db.collection("publicProfiles").doc(uid).set(publicProfileFixture(uid, { campusId }));
        await db.collection("directoryIndex").doc(uid).set(directoryIndexFixture(uid, { campusId }));
      });
    }

    async function seedCommunity(communityId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communities")
          .doc(communityId)
          .set(communityFixture(communityId, { campusId, ...overrides }));
      });
    }

    async function seedCommunityMember(
      membershipId,
      communityId,
      userId,
      campusId,
      role = COMMUNITY_MEMBER_ROLES.MEMBER,
      status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
      overrides = {}
    ) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communityMembers")
          .doc(membershipId)
          .set(
            communityMemberFixture(communityId, userId, {
              id: membershipId,
              campusId,
              role,
              status,
              ...overrides,
            })
          );
      });
    }

    async function seedPost(postId, authorId, campusId, communityId = null) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("posts")
          .doc(postId)
          .set(
            postFixture(postId, authorId, {
              campusId,
              ...(communityId ? { communityId } : {}),
            })
          );
      });
    }

    const aliceUid = TEST_UIDS.alice; // Admin of apex-ai-club
    const bobUid = TEST_UIDS.bob; // Moderator of apex-ai-club
    const carolUid = TEST_UIDS.carol; // Regular member of apex-ai-club
    const davidUid = "test-uid-david"; // Regular member / author
    const eveUid = "test-uid-eve"; // Moderator of st-jude-medical-society

    beforeEach(async () => {
      await seedUserWithCampus(aliceUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(bobUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(carolUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(davidUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(eveUid, ST_JUDE_CAMPUS_ID);

      await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
      await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);

      // Seed memberships
      await seedCommunityMember(
        `apex-ai-club_${aliceUid}`,
        "apex-ai-club",
        aliceUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${bobUid}`,
        "apex-ai-club",
        bobUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MODERATOR,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${carolUid}`,
        "apex-ai-club",
        carolUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${davidUid}`,
        "apex-ai-club",
        davidUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `st-jude-medical-society_${eveUid}`,
        "st-jude-medical-society",
        eveUid,
        ST_JUDE_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MODERATOR,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
    });

    describe("Member role & status management", () => {
      it("member cannot change role", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          communityMemberRef(carol, `apex-ai-club_${carolUid}`).update({
            role: COMMUNITY_MEMBER_ROLES.MODERATOR,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("member cannot change another user's status", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          communityMemberRef(carol, `apex-ai-club_${davidUid}`).update({
            status: COMMUNITY_MEMBER_STATUSES.REMOVED,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("moderator cannot promote self to admin", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          communityMemberRef(bob, `apex-ai-club_${bobUid}`).update({
            role: COMMUNITY_MEMBER_ROLES.ADMIN,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("moderator can perform only permitted actions (e.g. remove regular member)", async () => {
        const bob = contextFor(bobUid);

        // Permitted: Moderator removes a regular member
        await assertSucceeds(
          communityMemberRef(bob, `apex-ai-club_${carolUid}`).update({
            status: COMMUNITY_MEMBER_STATUSES.REMOVED,
            updatedAt: serverTimestamp(),
          })
        );

        // Permitted: Moderator restores regular member
        await assertSucceeds(
          communityMemberRef(bob, `apex-ai-club_${carolUid}`).update({
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            updatedAt: serverTimestamp(),
          })
        );

        // Forbidden: Moderator attempts to change Carol's role
        await expectPermissionDenied(() =>
          communityMemberRef(bob, `apex-ai-club_${carolUid}`).update({
            role: COMMUNITY_MEMBER_ROLES.MODERATOR,
            updatedAt: serverTimestamp(),
          })
        );

        // Forbidden: Moderator attempts to modify an Admin
        await expectPermissionDenied(() =>
          communityMemberRef(bob, `apex-ai-club_${aliceUid}`).update({
            status: COMMUNITY_MEMBER_STATUSES.REMOVED,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("admin can perform permitted role management", async () => {
        const alice = contextFor(aliceUid);

        // Admin promotes regular member to moderator
        await assertSucceeds(
          communityMemberRef(alice, `apex-ai-club_${carolUid}`).update({
            role: COMMUNITY_MEMBER_ROLES.MODERATOR,
            updatedAt: serverTimestamp(),
          })
        );

        // Admin demotes moderator to regular member
        await assertSucceeds(
          communityMemberRef(alice, `apex-ai-club_${bobUid}`).update({
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("cross-campus moderation fails", async () => {
        const eve = contextFor(eveUid); // St. Jude moderator
        // Eve attempts to remove Carol from Apex AI club
        await expectPermissionDenied(() =>
          communityMemberRef(eve, `apex-ai-club_${carolUid}`).update({
            status: COMMUNITY_MEMBER_STATUSES.REMOVED,
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("Post moderation", () => {
      beforeEach(async () => {
        // David creates a post in apex-ai-club
        await seedPost("david-ai-post", davidUid, APEX_CAMPUS_ID, "apex-ai-club");
        // David creates a campus-wide post
        await seedPost("david-campus-post", davidUid, APEX_CAMPUS_ID, null);
        // St. Jude post
        await seedPost("st-jude-post", eveUid, ST_JUDE_CAMPUS_ID, "st-jude-medical-society");
      });

      it("member cannot moderate another user's community post", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          postRef(carol, "david-ai-post").delete()
        );
      });

      it("moderator can moderate community post", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          postRef(bob, "david-ai-post").delete()
        );
      });

      it("admin can moderate community post", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(
          postRef(alice, "david-ai-post").delete()
        );
      });

      it("moderator cannot moderate a different campus community post", async () => {
        const eve = contextFor(eveUid); // St. Jude
        // Eve attempts to delete David's post on Apex
        await expectPermissionDenied(() =>
          postRef(eve, "david-ai-post").delete()
        );

        const bob = contextFor(bobUid); // Apex
        // Bob attempts to delete St. Jude post
        await expectPermissionDenied(() =>
          postRef(bob, "st-jude-post").delete()
        );
      });

      it("community moderator cannot modify campus-wide post behavior", async () => {
        const bob = contextFor(bobUid); // Apex AI moderator
        // Bob attempts to delete David's campus-wide post (not in apex-ai-club)
        await expectPermissionDenied(() =>
          postRef(bob, "david-campus-post").delete()
        );
      });
    });
  });

  describe("Milestone 20 — Unit 20.2: Event Security Authority & Rules", () => {
    async function seedUserWithCampus(uid, campusId) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("users").doc(uid).set(userFixture(uid, { campusId }));
        await db.collection("publicProfiles").doc(uid).set(publicProfileFixture(uid, { campusId }));
        await db.collection("directoryIndex").doc(uid).set(directoryIndexFixture(uid, { campusId }));
      });
    }

    async function seedCommunity(communityId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communities")
          .doc(communityId)
          .set(communityFixture(communityId, { campusId, ...overrides }));
      });
    }

    async function seedCommunityMember(
      membershipId,
      communityId,
      userId,
      campusId,
      role = COMMUNITY_MEMBER_ROLES.MEMBER,
      status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
      overrides = {}
    ) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communityMembers")
          .doc(membershipId)
          .set(
            communityMemberFixture(communityId, userId, {
              id: membershipId,
              campusId,
              role,
              status,
              ...overrides,
            })
          );
      });
    }

    async function seedEvent(eventId, creatorId, campusId, communityId, overrides = {}) {
      const now = Date.now();
      const defaultStartAt = firebase.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
      const defaultEndAt = firebase.firestore.Timestamp.fromMillis(now + 48 * 60 * 60 * 1000);
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("events")
          .doc(eventId)
          .set(
            eventFixture(eventId, creatorId, communityId, {
              campusId,
              startAt: defaultStartAt,
              endAt: defaultEndAt,
              ...overrides,
            })
          );
      });
    }

    const aliceUid = TEST_UIDS.alice; // Admin of apex-ai-club (Apex)
    const bobUid = TEST_UIDS.bob; // Moderator of apex-ai-club (Apex)
    const carolUid = TEST_UIDS.carol; // Regular member of apex-ai-club (Apex)
    const davidUid = "test-uid-david"; // Non-member student (Apex)
    const eveUid = "test-uid-eve"; // Admin of st-jude-medical-society (St. Jude)
    const frankUid = "test-uid-frank"; // Removed member of apex-ai-club (Apex)
    const graceUid = "test-uid-grace"; // Pending member of apex-ai-club (Apex)

    beforeEach(async () => {
      await seedUserWithCampus(aliceUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(bobUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(carolUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(davidUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(eveUid, ST_JUDE_CAMPUS_ID);
      await seedUserWithCampus(frankUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(graceUid, APEX_CAMPUS_ID);

      await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
      await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);

      await seedCommunityMember(
        `apex-ai-club_${aliceUid}`,
        "apex-ai-club",
        aliceUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${bobUid}`,
        "apex-ai-club",
        bobUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MODERATOR,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${carolUid}`,
        "apex-ai-club",
        carolUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${frankUid}`,
        "apex-ai-club",
        frankUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.REMOVED
      );
      await seedCommunityMember(
        `apex-ai-club_${graceUid}`,
        "apex-ai-club",
        graceUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.PENDING
      );
      await seedCommunityMember(
        `st-jude-medical-society_${eveUid}`,
        "st-jude-medical-society",
        eveUid,
        ST_JUDE_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
    });

    describe("Authentication Rules", () => {
      beforeEach(async () => {
        await seedEvent("pub-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
        });
      });

      it("unauthenticated read denied", async () => {
        const unauth = unauthenticated();
        await expectPermissionDenied(() => eventRef(unauth, "pub-event-1").get());
      });

      it("unauthenticated create denied", async () => {
        const unauth = unauthenticated();
        await expectPermissionDenied(() =>
          eventRef(unauth, "new-event").set({
            ...eventFixture("new-event", "anon", "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("unauthenticated update denied", async () => {
        const unauth = unauthenticated();
        await expectPermissionDenied(() =>
          eventRef(unauth, "pub-event-1").update({
            title: "Hacked Title",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("unauthenticated delete denied", async () => {
        const unauth = unauthenticated();
        await expectPermissionDenied(() => eventRef(unauth, "pub-event-1").delete());
      });
    });

    describe("Campus Isolation & Visibility (Read Rules)", () => {
      beforeEach(async () => {
        // Apex campus_public event
        await seedEvent("apex-pub-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "published",
        });
        // Apex community_only event
        await seedEvent("apex-comm-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "community_only",
          status: "published",
        });
        // Apex cancelled event
        await seedEvent("apex-cancelled-pub", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "cancelled",
        });
        await seedEvent("apex-cancelled-comm", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "community_only",
          status: "cancelled",
        });
      });

      it("same-campus campus_public read succeeds", async () => {
        const david = contextFor(davidUid); // Non-member on same campus
        await assertSucceeds(eventRef(david, "apex-pub-event").get());
      });

      it("cross-campus campus_public read denied", async () => {
        const eve = contextFor(eveUid); // St. Jude student
        await expectPermissionDenied(() => eventRef(eve, "apex-pub-event").get());
      });

      it("same-campus community_only member read succeeds", async () => {
        const carol = contextFor(carolUid); // Active member
        await assertSucceeds(eventRef(carol, "apex-comm-event").get());
      });

      it("cross-campus community_only read denied", async () => {
        const eve = contextFor(eveUid); // St. Jude
        await expectPermissionDenied(() => eventRef(eve, "apex-comm-event").get());
      });

      it("same-campus community_only non-member read denied", async () => {
        const david = contextFor(davidUid); // Non-member on same campus
        await expectPermissionDenied(() => eventRef(david, "apex-comm-event").get());
      });

      it("same-campus community_only removed member read denied", async () => {
        const frank = contextFor(frankUid); // Removed member
        await expectPermissionDenied(() => eventRef(frank, "apex-comm-event").get());
      });

      it("same-campus community_only pending member read denied", async () => {
        const grace = contextFor(graceUid); // Pending member
        await expectPermissionDenied(() => eventRef(grace, "apex-comm-event").get());
      });

      it("eligible same-campus reader can still read a cancelled event according to its visibility rules", async () => {
        const david = contextFor(davidUid); // Non-member student on same campus
        // Can read cancelled campus_public event
        await assertSucceeds(eventRef(david, "apex-cancelled-pub").get());
        // Cannot read cancelled community_only event
        await expectPermissionDenied(() => eventRef(david, "apex-cancelled-comm").get());

        const carol = contextFor(carolUid); // Active member
        // Can read cancelled community_only event
        await assertSucceeds(eventRef(carol, "apex-cancelled-comm").get());
      });

      it("get of nonexistent event is denied", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() => eventRef(david, "nonexistent-event-id").get());
      });
    });

    describe("Creator Authority (Create Rules)", () => {
      it("active community moderator can create event", async () => {
        const bob = contextFor(bobUid); // Moderator
        await assertSucceeds(
          eventRef(bob, "bob-created-event").set({
            ...eventFixture("bob-created-event", bobUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("active community admin can create event", async () => {
        const alice = contextFor(aliceUid); // Admin
        await assertSucceeds(
          eventRef(alice, "alice-created-event").set({
            ...eventFixture("alice-created-event", aliceUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("regular community member cannot create event", async () => {
        const carol = contextFor(carolUid); // Regular member
        await expectPermissionDenied(() =>
          eventRef(carol, "carol-created-event").set({
            ...eventFixture("carol-created-event", carolUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("non-member cannot create event", async () => {
        const david = contextFor(davidUid); // Non-member
        await expectPermissionDenied(() =>
          eventRef(david, "david-created-event").set({
            ...eventFixture("david-created-event", davidUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("removed member cannot create event", async () => {
        const frank = contextFor(frankUid); // Removed member
        await expectPermissionDenied(() =>
          eventRef(frank, "frank-created-event").set({
            ...eventFixture("frank-created-event", frankUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("pending member cannot create event", async () => {
        const grace = contextFor(graceUid); // Pending member
        await expectPermissionDenied(() =>
          eventRef(grace, "grace-created-event").set({
            ...eventFixture("grace-created-event", graceUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("moderator cannot create event for community on a different campus", async () => {
        const bob = contextFor(bobUid); // Apex moderator
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-cross-campus").set({
            ...eventFixture("bob-cross-campus", bobUid, "st-jude-medical-society", {
              campusId: APEX_CAMPUS_ID,
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("creator cannot create event referencing nonexistent community", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-nonexistent-comm").set({
            ...eventFixture("bob-nonexistent-comm", bobUid, "nonexistent-community-xyz"),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("create fails if event campusId does not match user's campus", async () => {
        const bob = contextFor(bobUid); // Apex student
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-wrong-campus").set({
            ...eventFixture("bob-wrong-campus", bobUid, "apex-ai-club", {
              campusId: ST_JUDE_CAMPUS_ID,
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("Schema Enforcement (Create Rules)", () => {
      it("missing required field is rejected", async () => {
        const bob = contextFor(bobUid);
        const invalidPayload = eventFixture("bob-missing-loc", bobUid, "apex-ai-club");
        delete invalidPayload.location;

        await expectPermissionDenied(() =>
          eventRef(bob, "bob-missing-loc").set({
            ...invalidPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("unexpected extra field is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-extra-field").set({
            ...eventFixture("bob-extra-field", bobUid, "apex-ai-club"),
            extraField: "not allowed",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("incorrect id is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "actual-doc-id").set({
            ...eventFixture("actual-doc-id", bobUid, "apex-ai-club", {
              id: "mismatched-doc-id",
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("incorrect createdBy is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-fake-author").set({
            ...eventFixture("bob-fake-author", bobUid, "apex-ai-club", {
              createdBy: aliceUid,
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("invalid category is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-bad-cat").set({
            ...eventFixture("bob-bad-cat", bobUid, "apex-ai-club", {
              category: "unsupported-category",
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("initial status other than published is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-cancelled-initial").set({
            ...eventFixture("bob-cancelled-initial", bobUid, "apex-ai-club", {
              status: "cancelled",
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("invalid visibility is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-bad-vis").set({
            ...eventFixture("bob-bad-vis", bobUid, "apex-ai-club", {
              visibility: "invite_only",
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("non-timestamp startAt is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-bad-start").set({
            ...eventFixture("bob-bad-start", bobUid, "apex-ai-club", {
              startAt: "2026-10-15T09:00:00Z",
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("non-timestamp endAt is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-bad-end").set({
            ...eventFixture("bob-bad-end", bobUid, "apex-ai-club", {
              endAt: 1700000000000,
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("endAt before startAt is rejected", async () => {
        const bob = contextFor(bobUid);
        const earlyTimestamp = firebase.firestore.Timestamp.fromMillis(1_699_000_000_000);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-inverted-dates").set({
            ...eventFixture("bob-inverted-dates", bobUid, "apex-ai-club", {
              startAt: timestamp,
              endAt: earlyTimestamp,
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("incorrect createdAt is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-bad-created-at").set({
            ...eventFixture("bob-bad-created-at", bobUid, "apex-ai-club"),
            createdAt: timestamp,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("incorrect updatedAt is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "bob-bad-updated-at").set({
            ...eventFixture("bob-bad-updated-at", bobUid, "apex-ai-club"),
            createdAt: serverTimestamp(),
            updatedAt: timestamp,
          })
        );
      });
    });

    describe("Immutability Contract (Update Rules)", () => {
      beforeEach(async () => {
        await seedEvent("immutable-event-1", bobUid, APEX_CAMPUS_ID, "apex-ai-club");
      });

      it("update is denied when attempting to change id", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "immutable-event-1").update({
            id: "changed-id",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update is denied when attempting to change campusId", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "immutable-event-1").update({
            campusId: ST_JUDE_CAMPUS_ID,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update is denied when attempting to change communityId", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "immutable-event-1").update({
            communityId: "st-jude-medical-society",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update is denied when attempting to change createdBy", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "immutable-event-1").update({
            createdBy: aliceUid,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update is denied when attempting to change createdAt", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "immutable-event-1").update({
            createdAt: laterTimestamp,
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("Update Authority & Cancellation", () => {
      beforeEach(async () => {
        await seedEvent("alice-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club");
        await seedEvent("bob-event-1", bobUid, APEX_CAMPUS_ID, "apex-ai-club");
      });

      it("creator can update mutable event details", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(
          eventRef(alice, "alice-event-1").update({
            title: "Updated Alice Event Title",
            description: "Updated description text.",
            location: "Updated Hall B",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("active community moderator can update mutable event details", async () => {
        const bob = contextFor(bobUid); // Moderator of apex-ai-club
        await assertSucceeds(
          eventRef(bob, "alice-event-1").update({
            title: "Moderator Updated Title",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("active community admin can update mutable event details", async () => {
        const alice = contextFor(aliceUid); // Admin of apex-ai-club
        await assertSucceeds(
          eventRef(alice, "bob-event-1").update({
            title: "Admin Updated Title",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ordinary member cannot update event", async () => {
        const carol = contextFor(carolUid); // Regular member
        await expectPermissionDenied(() =>
          eventRef(carol, "alice-event-1").update({
            title: "Carol Hack Attempt",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("unrelated student cannot update event", async () => {
        const david = contextFor(davidUid); // Non-member student
        await expectPermissionDenied(() =>
          eventRef(david, "alice-event-1").update({
            title: "David Hack Attempt",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("creator can cancel event", async () => {
        const alice = contextFor(aliceUid);
        const db = alice.firestore();
        const batch = db.batch();
        batch.update(eventRef(alice, "alice-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(alice, "alice-event-1"), {
          ...eventNotificationDeliveryFixture("alice-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club"),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
      });

      it("active community moderator can cancel event", async () => {
        const bob = contextFor(bobUid); // Moderator
        const db = bob.firestore();
        const batch = db.batch();
        batch.update(eventRef(bob, "alice-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "alice-event-1"), {
          ...eventNotificationDeliveryFixture("alice-event-1", bobUid, APEX_CAMPUS_ID, "apex-ai-club"),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
      });

      it("active community admin can cancel event", async () => {
        const alice = contextFor(aliceUid); // Admin
        const db = alice.firestore();
        const batch = db.batch();
        batch.update(eventRef(alice, "bob-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(alice, "bob-event-1"), {
          ...eventNotificationDeliveryFixture("bob-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club"),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
      });

      it("ordinary member cannot cancel event", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          eventRef(carol, "alice-event-1").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("Hard Delete Authority", () => {
      beforeEach(async () => {
        await seedEvent("delete-target-alice", aliceUid, APEX_CAMPUS_ID, "apex-ai-club");
        await seedEvent("delete-target-bob", bobUid, APEX_CAMPUS_ID, "apex-ai-club");
      });

      it("creator without admin role cannot delete event", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() => eventRef(bob, "delete-target-bob").delete());
      });

      it("active community admin can delete event", async () => {
        const alice = contextFor(aliceUid); // Admin
        await assertSucceeds(eventRef(alice, "delete-target-bob").delete());
      });

      it("community moderator who is not creator cannot hard-delete event", async () => {
        const bob = contextFor(bobUid); // Moderator
        await expectPermissionDenied(() => eventRef(bob, "delete-target-alice").delete());
      });

      it("ordinary member cannot delete event", async () => {
        const carol = contextFor(carolUid); // Member
        await expectPermissionDenied(() => eventRef(carol, "delete-target-alice").delete());
      });

      it("cross-campus admin cannot delete event", async () => {
        const eve = contextFor(eveUid); // St. Jude admin
        await expectPermissionDenied(() => eventRef(eve, "delete-target-alice").delete());
      });
    });

    describe("Query & Visibility Rules Compatibility (Community Member vs Non-Member)", () => {
      beforeEach(async () => {
        // Seed 1 campus_public event and 1 community_only event for apex-ai-club
        await seedEvent("query-event-public", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: EVENT_VISIBILITIES.CAMPUS_PUBLIC,
          title: "Public Event",
        });
        await seedEvent("query-event-private", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: EVENT_VISIBILITIES.COMMUNITY_ONLY,
          title: "Members Only Event",
        });
      });

      it("non-member query constrained to visibility == campus_public succeeds", async () => {
        const david = contextFor(davidUid); // Same-campus student, non-member
        const q = david
          .firestore()
          .collection("events")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .where("communityId", "==", "apex-ai-club")
          .where("visibility", "==", "campus_public");

        const snap = await assertSucceeds(q.get());
        expect(snap.docs.length).toBe(1);
        expect(snap.docs[0].id).toBe("query-event-public");
      });

      it("non-member broad community query without visibility constraint is denied by security rules", async () => {
        const david = contextFor(davidUid); // Non-member
        const q = david
          .firestore()
          .collection("events")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .where("communityId", "==", "apex-ai-club");

        await expectPermissionDenied(() => q.get());
      });

      it("active member query with visibility in ['campus_public', 'community_only'] or separate queries succeeds", async () => {
        const carol = contextFor(carolUid); // Active member
        const qCommunityOnly = carol
          .firestore()
          .collection("events")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .where("communityId", "==", "apex-ai-club")
          .where("visibility", "==", "community_only");

        const snapCommOnly = await assertSucceeds(qCommunityOnly.get());
        expect(snapCommOnly.docs.length).toBe(1);
        expect(snapCommOnly.docs[0].id).toBe("query-event-private");

        const qPublic = carol
          .firestore()
          .collection("events")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .where("communityId", "==", "apex-ai-club")
          .where("visibility", "==", "campus_public");

        const snapPublic = await assertSucceeds(qPublic.get());
        expect(snapPublic.docs.length).toBe(1);
        expect(snapPublic.docs[0].id).toBe("query-event-public");
      });

      it("non-member query for community_only visibility is denied", async () => {
        const david = contextFor(davidUid); // Non-member
        const q = david
          .firestore()
          .collection("events")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .where("communityId", "==", "apex-ai-club")
          .where("visibility", "==", "community_only");

        await expectPermissionDenied(() => q.get());
      });
    });
  });

  describe("Milestone 21 — Unit 21.2: RSVP Security Authority & Firestore Rules", () => {
    async function seedUserWithCampus(uid, campusId) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("users").doc(uid).set(userFixture(uid, { campusId }));
        await db.collection("publicProfiles").doc(uid).set(publicProfileFixture(uid, { campusId }));
        await db.collection("directoryIndex").doc(uid).set(directoryIndexFixture(uid, { campusId }));
      });
    }

    async function seedCommunity(communityId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communities")
          .doc(communityId)
          .set(communityFixture(communityId, { campusId, ...overrides }));
      });
    }

    async function seedCommunityMember(
      membershipId,
      communityId,
      userId,
      campusId,
      role = COMMUNITY_MEMBER_ROLES.MEMBER,
      status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
      overrides = {}
    ) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communityMembers")
          .doc(membershipId)
          .set(
            communityMemberFixture(communityId, userId, {
              id: membershipId,
              campusId,
              role,
              status,
              ...overrides,
            })
          );
      });
    }

    async function seedEvent(eventId, creatorId, campusId, communityId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("events")
          .doc(eventId)
          .set(
            eventFixture(eventId, creatorId, communityId, {
              campusId,
              ...overrides,
            })
          );
      });
    }

    async function seedEventRsvp(rsvpId, eventId, userId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("eventRsvps")
          .doc(rsvpId)
          .set(
            eventRsvpFixture(eventId, userId, campusId, {
              id: rsvpId,
              ...overrides,
            })
          );
      });
    }

    const aliceUid = TEST_UIDS.alice; // Apex student, admin of apex-ai-club
    const bobUid = TEST_UIDS.bob; // Apex student, moderator of apex-ai-club
    const carolUid = TEST_UIDS.carol; // Apex student, active member of apex-ai-club
    const davidUid = "test-uid-david"; // Apex student, non-member of apex-ai-club
    const frankUid = "test-uid-frank"; // Apex student, removed member of apex-ai-club
    const graceUid = "test-uid-grace"; // Apex student, pending member of apex-ai-club
    const eveUid = "test-uid-eve"; // St. Jude student (cross-campus)
    const harryUid = "test-uid-harry"; // Student without campus

    // Relative temporal anchors
    const nowMs = Date.now();
    const upcomingStart = firebase.firestore.Timestamp.fromMillis(nowMs + 24 * 60 * 60 * 1000);
    const upcomingEnd = firebase.firestore.Timestamp.fromMillis(nowMs + 26 * 60 * 60 * 1000);
    const ongoingStart = firebase.firestore.Timestamp.fromMillis(nowMs - 60 * 60 * 1000);
    const ongoingEnd = firebase.firestore.Timestamp.fromMillis(nowMs + 60 * 60 * 1000);
    const pastStart = firebase.firestore.Timestamp.fromMillis(nowMs - 48 * 60 * 60 * 1000);
    const pastEnd = firebase.firestore.Timestamp.fromMillis(nowMs - 46 * 60 * 60 * 1000);

    beforeEach(async () => {
      await seedUserWithCampus(aliceUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(bobUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(carolUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(davidUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(frankUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(graceUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(eveUid, ST_JUDE_CAMPUS_ID);

      // Seed user without campus
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("users").doc(harryUid).set(userFixture(harryUid, { campusId: null }));
        await db.collection("publicProfiles").doc(harryUid).set(publicProfileFixture(harryUid, { campusId: null }));
      });

      await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
      await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);

      await seedCommunityMember(
        `apex-ai-club_${aliceUid}`,
        "apex-ai-club",
        aliceUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${bobUid}`,
        "apex-ai-club",
        bobUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MODERATOR,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${carolUid}`,
        "apex-ai-club",
        carolUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${frankUid}`,
        "apex-ai-club",
        frankUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.REMOVED
      );
      await seedCommunityMember(
        `apex-ai-club_${graceUid}`,
        "apex-ai-club",
        graceUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.PENDING
      );
      await seedCommunityMember(
        `st-jude-medical-society_${eveUid}`,
        "st-jude-medical-society",
        eveUid,
        ST_JUDE_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );

      // Seed default events
      await seedEvent("pub-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
        visibility: "campus_public",
        startAt: upcomingStart,
        endAt: upcomingEnd,
      });
      await seedEvent("comm-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
        visibility: "community_only",
        startAt: upcomingStart,
        endAt: upcomingEnd,
      });
    });

    describe("Authentication Rules", () => {
      beforeEach(async () => {
        await seedEventRsvp(`pub-event-1_${aliceUid}`, "pub-event-1", aliceUid, APEX_CAMPUS_ID);
      });

      it("unauthenticated get of an existing RSVP is denied", async () => {
        await expectPermissionDenied(() => eventRsvpRef(unauthenticated(), `pub-event-1_${aliceUid}`).get());
      });

      it("unauthenticated get of an absent RSVP is denied", async () => {
        await expectPermissionDenied(() => eventRsvpRef(unauthenticated(), `pub-event-1_absent-user`).get());
      });

      it("unauthenticated list/query is denied", async () => {
        const q = unauthenticated()
          .firestore()
          .collection("eventRsvps")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .where("eventId", "==", "pub-event-1");
        await expectPermissionDenied(() => q.get());
      });

      it("unauthenticated create is denied", async () => {
        await expectPermissionDenied(() =>
          eventRsvpRef(unauthenticated(), `pub-event-1_anon`).set({
            id: `pub-event-1_anon`,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: "anon",
            createdAt: serverTimestamp(),
          })
        );
      });

      it("unauthenticated update is denied", async () => {
        await expectPermissionDenied(() =>
          eventRsvpRef(unauthenticated(), `pub-event-1_${aliceUid}`).update({
            createdAt: serverTimestamp(),
          })
        );
      });

      it("unauthenticated delete is denied", async () => {
        await expectPermissionDenied(() => eventRsvpRef(unauthenticated(), `pub-event-1_${aliceUid}`).delete());
      });
    });

    describe("Read Authorization (Point Reads - Get)", () => {
      beforeEach(async () => {
        await seedEventRsvp(`pub-event-1_${aliceUid}`, "pub-event-1", aliceUid, APEX_CAMPUS_ID);
        await seedEventRsvp(`comm-event-1_${carolUid}`, "comm-event-1", carolUid, APEX_CAMPUS_ID);
      });

      it("owner get of an existing RSVP allowed", async () => {
        const alice = contextFor(aliceUid);
        const snap = await assertSucceeds(eventRsvpRef(alice, `pub-event-1_${aliceUid}`).get());
        expect(snap.exists).toBe(true);
      });

      it("owner get of their own absent deterministic ID allowed", async () => {
        const alice = contextFor(aliceUid);
        const aliceAbsentSnap = await assertSucceeds(eventRsvpRef(alice, `comm-event-1_${aliceUid}`).get());
        expect(aliceAbsentSnap.exists).toBe(false);
      });

      it("authenticated user whose campus profile is missing can still read their own absent deterministic RSVP ID", async () => {
        const harry = contextFor(harryUid);
        const harryAbsentSnap = await assertSucceeds(eventRsvpRef(harry, `pub-event-1_${harryUid}`).get());
        expect(harryAbsentSnap.exists).toBe(false);
      });

      it("authenticated user with completely absent user document can read their own absent deterministic RSVP ID", async () => {
        const noUserUid = "test-uid-unseeded-user";
        const unseededUser = contextFor(noUserUid);
        const absentRsvpId = `pub-event-1_${noUserUid}`;
        const snap = await assertSucceeds(eventRsvpRef(unseededUser, absentRsvpId).get());
        expect(snap.exists).toBe(false);
      });

      it("get of another user's absent RSVP is denied", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() => eventRsvpRef(david, `comm-event-1_${aliceUid}`).get());
      });

      it("owner can still point-read their own existing RSVP if parent event is deleted", async () => {
        await seedEvent("temp-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        await seedEventRsvp(`temp-event_${aliceUid}`, "temp-event", aliceUid, APEX_CAMPUS_ID);
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("temp-event").delete();
        });

        const alice = contextFor(aliceUid);
        const snap = await assertSucceeds(eventRsvpRef(alice, `temp-event_${aliceUid}`).get());
        expect(snap.exists).toBe(true);
      });

      it("owner can still point-read their own absent RSVP even if parent event does not exist", async () => {
        const alice = contextFor(aliceUid);
        const snap = await assertSucceeds(eventRsvpRef(alice, `nonexistent-event_${aliceUid}`).get());
        expect(snap.exists).toBe(false);
      });

      it("same-campus non-owner can read RSVP for a campus_public event", async () => {
        const david = contextFor(davidUid);
        const snap = await assertSucceeds(eventRsvpRef(david, `pub-event-1_${aliceUid}`).get());
        expect(snap.exists).toBe(true);
      });

      it("active sponsoring-community member can read RSVP for a community_only event", async () => {
        const bob = contextFor(bobUid);
        const snap = await assertSucceeds(eventRsvpRef(bob, `comm-event-1_${carolUid}`).get());
        expect(snap.exists).toBe(true);
      });

      it("non-member cannot read RSVP for a community_only event", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() => eventRsvpRef(david, `comm-event-1_${carolUid}`).get());
      });

      it("removed community member cannot read RSVP for a community_only event", async () => {
        const frank = contextFor(frankUid);
        await expectPermissionDenied(() => eventRsvpRef(frank, `comm-event-1_${carolUid}`).get());
      });

      it("pending community member cannot read RSVP for a community_only event", async () => {
        const grace = contextFor(graceUid);
        await expectPermissionDenied(() => eventRsvpRef(grace, `comm-event-1_${carolUid}`).get());
      });

      it("cross-campus reader cannot read RSVP for a campus_public event", async () => {
        const eve = contextFor(eveUid);
        await expectPermissionDenied(() => eventRsvpRef(eve, `pub-event-1_${aliceUid}`).get());
      });

      it("non-owner cannot read RSVP if parent event has been deleted", async () => {
        await seedEvent("temp-event-2", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        await seedEventRsvp(`temp-event-2_${aliceUid}`, "temp-event-2", aliceUid, APEX_CAMPUS_ID);
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("temp-event-2").delete();
        });

        const david = contextFor(davidUid);
        await expectPermissionDenied(() => eventRsvpRef(david, `temp-event-2_${aliceUid}`).get());
      });
    });

    describe("Query Authorization (List - Q2 and Q3)", () => {
      beforeEach(async () => {
        await seedEventRsvp(`pub-event-1_${aliceUid}`, "pub-event-1", aliceUid, APEX_CAMPUS_ID);
        await seedEventRsvp(`pub-event-1_${bobUid}`, "pub-event-1", bobUid, APEX_CAMPUS_ID);
        await seedEventRsvp(`comm-event-1_${carolUid}`, "comm-event-1", carolUid, APEX_CAMPUS_ID);
      });

      it("Q2 (My RSVPs): owner query with correct userId and campusId succeeds", async () => {
        const alice = contextFor(aliceUid);
        const q = alice
          .firestore()
          .collection("eventRsvps")
          .where("userId", "==", aliceUid)
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(50);
        const snap = await assertSucceeds(q.get());
        expect(snap.docs.length).toBe(1);
        expect(snap.docs[0].id).toBe(`pub-event-1_${aliceUid}`);
      });

      it("Q2 (My RSVPs): owner query with wrong campusId is denied", async () => {
        const alice = contextFor(aliceUid);
        const q = alice
          .firestore()
          .collection("eventRsvps")
          .where("userId", "==", aliceUid)
          .where("campusId", "==", ST_JUDE_CAMPUS_ID)
          .limit(50);
        await expectPermissionDenied(() => q.get());
      });

      it("Q2 (My RSVPs): owner query omitting campusId equality constraint is denied", async () => {
        const alice = contextFor(aliceUid);
        const q = alice
          .firestore()
          .collection("eventRsvps")
          .where("userId", "==", aliceUid)
          .limit(50);
        await expectPermissionDenied(() => q.get());
      });

      it("Q2 (My RSVPs): query attempting to list another user's RSVPs is denied", async () => {
        const david = contextFor(davidUid);
        const q = david
          .firestore()
          .collection("eventRsvps")
          .where("userId", "==", aliceUid)
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(50);
        await expectPermissionDenied(() => q.get());
      });

      it("Q2 (My RSVPs): owner can list their own RSVPs even if a parent event has been deleted", async () => {
        await seedEvent("temp-event-q2", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        await seedEventRsvp(`temp-event-q2_${aliceUid}`, "temp-event-q2", aliceUid, APEX_CAMPUS_ID);
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("temp-event-q2").delete();
        });

        const alice = contextFor(aliceUid);
        const q = alice
          .firestore()
          .collection("eventRsvps")
          .where("userId", "==", aliceUid)
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(50);
        const snap = await assertSucceeds(q.get());
        expect(snap.docs.length).toBeGreaterThanOrEqual(1);
      });

      it("Q3 (Attendees): same-campus reader on campus_public event succeeds", async () => {
        const david = contextFor(davidUid);
        const q = david
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "pub-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        const snap = await assertSucceeds(q.get());
        expect(snap.docs.length).toBe(2);
      });

      it("Q3 (Attendees): active sponsoring-community member on community_only event succeeds", async () => {
        const carol = contextFor(carolUid);
        const q = carol
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "comm-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        const snap = await assertSucceeds(q.get());
        expect(snap.docs.length).toBe(1);
        expect(snap.docs[0].id).toBe(`comm-event-1_${carolUid}`);
      });

      it("Q3 (Attendees): non-member on community_only event is denied", async () => {
        const david = contextFor(davidUid);
        const q = david
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "comm-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        await expectPermissionDenied(() => q.get());
      });

      it("Q3 (Attendees): removed member on community_only event is denied", async () => {
        const frank = contextFor(frankUid);
        const q = frank
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "comm-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        await expectPermissionDenied(() => q.get());
      });

      it("Q3 (Attendees): pending member on community_only event is denied", async () => {
        const grace = contextFor(graceUid);
        const q = grace
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "comm-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        await expectPermissionDenied(() => q.get());
      });

      it("Q3 (Attendees): cross-campus reader is denied", async () => {
        const eve = contextFor(eveUid);
        const q = eve
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "pub-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        await expectPermissionDenied(() => q.get());
      });

      it("Q3 (Attendees): query omitting campusId equality constraint is denied", async () => {
        const david = contextFor(davidUid);
        const q = david
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "pub-event-1")
          .limit(51);
        await expectPermissionDenied(() => q.get());
      });

      it("Q3 (Attendees): non-owner query is denied if parent event has been deleted", async () => {
        await seedEvent("temp-event-q3", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        await seedEventRsvp(`temp-event-q3_${aliceUid}`, "temp-event-q3", aliceUid, APEX_CAMPUS_ID);
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("temp-event-q3").delete();
        });

        const david = contextFor(davidUid);
        const q = david
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "temp-event-q3")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        await expectPermissionDenied(() => q.get());
      });

      it("Q3 (Attendees): authorization dynamically follows parent event visibility change", async () => {
        await seedEvent("dyn-event-1", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        await seedEventRsvp(`dyn-event-1_${aliceUid}`, "dyn-event-1", aliceUid, APEX_CAMPUS_ID);

        const david = contextFor(davidUid);
        const carol = contextFor(carolUid);

        const qDavid = david
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "dyn-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);

        const snap1 = await assertSucceeds(qDavid.get());
        expect(snap1.docs.length).toBe(1);

        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("dyn-event-1").update({
            visibility: "community_only",
          });
        });

        await expectPermissionDenied(() => qDavid.get());

        const qCarol = carol
          .firestore()
          .collection("eventRsvps")
          .where("eventId", "==", "dyn-event-1")
          .where("campusId", "==", APEX_CAMPUS_ID)
          .limit(51);
        const snap2 = await assertSucceeds(qCarol.get());
        expect(snap2.docs.length).toBe(1);
      });

      it("Broad collection query on eventRsvps without eventId or userId is denied", async () => {
        const david = contextFor(davidUid);
        const q = david
          .firestore()
          .collection("eventRsvps")
          .where("campusId", "==", APEX_CAMPUS_ID);
        await expectPermissionDenied(() => q.get());
      });
    });

    describe("RSVP Creation (Create Authority & Schema Enforcement)", () => {
      it("same-campus user creates RSVP for upcoming published campus_public event", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await assertSucceeds(
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("active community member creates RSVP for upcoming published community_only event", async () => {
        const carol = contextFor(carolUid);
        const rsvpId = `comm-event-1_${carolUid}`;
        await assertSucceeds(
          eventRsvpRef(carol, rsvpId).set({
            id: rsvpId,
            eventId: "comm-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: carolUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when parent event does not exist", async () => {
        const alice = contextFor(aliceUid);
        const rsvpId = `nonexistent-event_${aliceUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).set({
            id: rsvpId,
            eventId: "nonexistent-event",
            campusId: APEX_CAMPUS_ID,
            userId: aliceUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when parent event is cancelled", async () => {
        await seedEvent("cancelled-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "cancelled",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        const david = contextFor(davidUid);
        const rsvpId = `cancelled-event_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "cancelled-event",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when parent event is ongoing (request.time >= startAt)", async () => {
        await seedEvent("ongoing-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "published",
          startAt: ongoingStart,
          endAt: ongoingEnd,
        });
        const david = contextFor(davidUid);
        const rsvpId = `ongoing-event_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "ongoing-event",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when parent event has ended (request.time >= endAt)", async () => {
        await seedEvent("ended-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "published",
          startAt: pastStart,
          endAt: pastEnd,
        });
        const david = contextFor(davidUid);
        const rsvpId = `ended-event_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "ended-event",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied for community_only event when user is not a community member", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `comm-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "comm-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied for community_only event when user is removed member", async () => {
        const frank = contextFor(frankUid);
        const rsvpId = `comm-event-1_${frankUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(frank, rsvpId).set({
            id: rsvpId,
            eventId: "comm-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: frankUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied for community_only event when user is pending member", async () => {
        const grace = contextFor(graceUid);
        const rsvpId = `comm-event-1_${graceUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(grace, rsvpId).set({
            id: rsvpId,
            eventId: "comm-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: graceUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when event has invalid/unrecognized visibility", async () => {
        await seedEvent("invalid-vis-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "archived",
          status: "published",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        const david = contextFor(davidUid);
        const rsvpId = `invalid-vis-event_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "invalid-vis-event",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when user campus does not match event campus (cross-campus user)", async () => {
        const eve = contextFor(eveUid);
        const rsvpId = `pub-event-1_${eveUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(eve, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: eveUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when parent event campus does not match RSVP campus (event campus mismatch)", async () => {
        // Seed upcoming published campus_public event on ST_JUDE_CAMPUS_ID
        await seedEvent("st-jude-pub-event", eveUid, ST_JUDE_CAMPUS_ID, "st-jude-medical-society", {
          visibility: "campus_public",
          status: "published",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });

        // David is an Apex student (APEX_CAMPUS_ID) submitting campusId == APEX_CAMPUS_ID
        const david = contextFor(davidUid);
        const rsvpId = `st-jude-pub-event_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "st-jude-pub-event",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when submitted campusId does not match user campus", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: ST_JUDE_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when user has no campus assigned", async () => {
        const harry = contextFor(harryUid);
        const rsvpId = `pub-event-1_${harryUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(harry, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: harryUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when userId does not match request.auth.uid", async () => {
        const alice = contextFor(aliceUid);
        const rsvpId = `pub-event-1_${bobUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: bobUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when id does not match rsvpId (document path mismatch)", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: "mismatched-id",
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when id does not equal eventId_userId", async () => {
        const david = contextFor(davidUid);
        const malformedId = `other_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, malformedId).set({
            id: malformedId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when missing required field (createdAt)", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
          })
        );
      });

      it("create denied when missing required field (eventId)", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("create denied when extra field is present (status)", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: serverTimestamp(),
            status: "going",
          })
        );
      });

      it("create denied when field has invalid type (createdAt as numeric timestamp)", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: Date.now(),
          })
        );
      });

      it("create denied when createdAt does not equal request.time (hardcoded timestamp)", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `pub-event-1_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).set({
            id: rsvpId,
            eventId: "pub-event-1",
            campusId: APEX_CAMPUS_ID,
            userId: davidUid,
            createdAt: timestamp,
          })
        );
      });
    });

    describe("Immutability & Update Prohibitions", () => {
      const rsvpId = `pub-event-1_${aliceUid}`;

      beforeEach(async () => {
        await seedEventRsvp(rsvpId, "pub-event-1", aliceUid, APEX_CAMPUS_ID);
      });

      it("update attempting to modify id is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).update({ id: "new-id" })
        );
      });

      it("update attempting to modify eventId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).update({ eventId: "new-event-id" })
        );
      });

      it("update attempting to modify campusId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).update({ campusId: ST_JUDE_CAMPUS_ID })
        );
      });

      it("update attempting to modify userId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).update({ userId: bobUid })
        );
      });

      it("update attempting to modify createdAt is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).update({ createdAt: serverTimestamp() })
        );
      });

      it("update attempting to add new fields (e.g. status) is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRsvpRef(alice, rsvpId).update({ status: "cancelled" })
        );
      });
    });

    describe("Deletion Authority", () => {
      const rsvpId = `pub-event-1_${aliceUid}`;

      beforeEach(async () => {
        await seedEventRsvp(rsvpId, "pub-event-1", aliceUid, APEX_CAMPUS_ID);
      });

      it("owner can delete their own existing RSVP with a normal matching campus", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(eventRsvpRef(alice, rsvpId).delete());
      });

      it("owner deletion remains allowed if the owner's campus profile is absent", async () => {
        const harryRsvpId = `pub-event-1_${harryUid}`;
        await seedEventRsvp(harryRsvpId, "pub-event-1", harryUid, APEX_CAMPUS_ID);
        const harry = contextFor(harryUid);
        await assertSucceeds(eventRsvpRef(harry, harryRsvpId).delete());
      });

      it("owner deletion remains allowed when the owner user document is completely absent", async () => {
        const noUserUid = "test-uid-unseeded-delete-user";
        const unseededRsvpId = `pub-event-1_${noUserUid}`;
        await seedEventRsvp(unseededRsvpId, "pub-event-1", noUserUid, APEX_CAMPUS_ID);

        const unseededUser = contextFor(noUserUid);
        await assertSucceeds(eventRsvpRef(unseededUser, unseededRsvpId).delete());
      });

      it("owner deletion remains allowed if the owner's campus profile no longer matches the RSVP campus", async () => {
        // Eve is on ST_JUDE_CAMPUS_ID, but holds an RSVP anchored to APEX_CAMPUS_ID
        const eveRsvpId = `pub-event-1_${eveUid}`;
        await seedEventRsvp(eveRsvpId, "pub-event-1", eveUid, APEX_CAMPUS_ID);
        const eve = contextFor(eveUid);
        await assertSucceeds(eventRsvpRef(eve, eveRsvpId).delete());
      });

      it("owner can delete their own RSVP after event is cancelled", async () => {
        await seedEvent("canc-del-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "cancelled",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        const cancRsvpId = `canc-del-event_${aliceUid}`;
        await seedEventRsvp(cancRsvpId, "canc-del-event", aliceUid, APEX_CAMPUS_ID);

        const alice = contextFor(aliceUid);
        await assertSucceeds(eventRsvpRef(alice, cancRsvpId).delete());
      });

      it("owner can delete their own RSVP after event has ended", async () => {
        await seedEvent("ended-del-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          status: "published",
          startAt: pastStart,
          endAt: pastEnd,
        });
        const endedRsvpId = `ended-del-event_${aliceUid}`;
        await seedEventRsvp(endedRsvpId, "ended-del-event", aliceUid, APEX_CAMPUS_ID);

        const alice = contextFor(aliceUid);
        await assertSucceeds(eventRsvpRef(alice, endedRsvpId).delete());
      });

      it("owner can delete their own RSVP after parent event has been deleted", async () => {
        await seedEvent("deleted-parent-event", aliceUid, APEX_CAMPUS_ID, "apex-ai-club", {
          visibility: "campus_public",
          startAt: upcomingStart,
          endAt: upcomingEnd,
        });
        const delRsvpId = `deleted-parent-event_${aliceUid}`;
        await seedEventRsvp(delRsvpId, "deleted-parent-event", aliceUid, APEX_CAMPUS_ID);
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("deleted-parent-event").delete();
        });

        const alice = contextFor(aliceUid);
        await assertSucceeds(eventRsvpRef(alice, delRsvpId).delete());
      });

      it("other student cannot delete RSVP", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() => eventRsvpRef(david, rsvpId).delete());
      });

      it("community moderator cannot delete another user's RSVP", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() => eventRsvpRef(bob, rsvpId).delete());
      });

      it("community admin cannot delete another user's RSVP", async () => {
        await seedEventRsvp(`pub-event-1_${carolUid}`, "pub-event-1", carolUid, APEX_CAMPUS_ID);
        const alice = contextFor(aliceUid); // Admin of apex-ai-club
        await expectPermissionDenied(() => eventRsvpRef(alice, `pub-event-1_${carolUid}`).delete());
      });

      it("cross-campus user cannot delete another user's RSVP", async () => {
        const eve = contextFor(eveUid);
        await expectPermissionDenied(() => eventRsvpRef(eve, rsvpId).delete());
      });
    });
  });

  describe("Milestone 22 — Unit 22.2: Event Lifecycle Security Rules & Verification", () => {
    const aliceUid = TEST_UIDS.alice; // Apex student, admin of apex-ai-club
    const bobUid = TEST_UIDS.bob; // Apex student, moderator of apex-ai-club
    const carolUid = TEST_UIDS.carol; // Apex student, regular member of apex-ai-club
    const davidUid = "m22-uid-david"; // Apex student, non-member
    const eveUid = "m22-uid-eve"; // St. Jude student, admin of st-jude-medical-society (cross-campus)
    const demotedUid = "m22-uid-demoted-creator"; // Event creator demoted to regular member
    const removedUid = "m22-uid-removed-creator"; // Event creator removed from community

    function getTimestamps() {
      const now = Date.now();
      return {
        now,
        upcomingStart: firebase.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000),
        upcomingEnd: firebase.firestore.Timestamp.fromMillis(now + 48 * 60 * 60 * 1000),
        furtherUpcomingStart: firebase.firestore.Timestamp.fromMillis(now + 30 * 60 * 60 * 1000),
        furtherUpcomingEnd: firebase.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
        ongoingStart: firebase.firestore.Timestamp.fromMillis(now - 60 * 60 * 1000),
        ongoingEnd: firebase.firestore.Timestamp.fromMillis(now + 60 * 60 * 1000),
        extendedOngoingEnd: firebase.firestore.Timestamp.fromMillis(now + 3 * 60 * 60 * 1000),
        shortenedOngoingEnd: firebase.firestore.Timestamp.fromMillis(now + 30 * 60 * 1000),
        completedStart: firebase.firestore.Timestamp.fromMillis(now - 48 * 60 * 60 * 1000),
        completedEnd: firebase.firestore.Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
        pastTimestamp: firebase.firestore.Timestamp.fromMillis(now - 10 * 60 * 1000),
      };
    }

    async function seedM22Event(eventId, creatorId, communityId, overrides = {}) {
      const t = getTimestamps();
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const base = eventFixture(eventId, creatorId, communityId || "apex-ai-club", {
          campusId: APEX_CAMPUS_ID,
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
          ...overrides,
        });
        if (communityId === null) {
          base.communityId = null;
        }
        await db.collection("events").doc(eventId).set(base);
      });
    }

    async function seedM22EventRsvp(rsvpId, eventId, userId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("eventRsvps")
          .doc(rsvpId)
          .set(
            eventRsvpFixture(eventId, userId, campusId, {
              id: rsvpId,
              ...overrides,
            })
          );
      });
    }

    async function seedUserWithCampus(uid, campusId) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("users").doc(uid).set(userFixture(uid, { campusId }));
        await db.collection("publicProfiles").doc(uid).set(publicProfileFixture(uid, { campusId }));
        await db.collection("directoryIndex").doc(uid).set(directoryIndexFixture(uid, { campusId }));
      });
    }

    async function seedCommunity(communityId, campusId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communities")
          .doc(communityId)
          .set(communityFixture(communityId, { campusId, ...overrides }));
      });
    }

    async function seedCommunityMember(
      membershipId,
      communityId,
      userId,
      campusId,
      role = COMMUNITY_MEMBER_ROLES.MEMBER,
      status = COMMUNITY_MEMBER_STATUSES.ACTIVE,
      overrides = {}
    ) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db
          .collection("communityMembers")
          .doc(membershipId)
          .set(
            communityMemberFixture(communityId, userId, {
              id: membershipId,
              campusId,
              role,
              status,
              ...overrides,
            })
          );
      });
    }

    beforeEach(async () => {
      await seedUserWithCampus(aliceUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(bobUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(carolUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(davidUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(eveUid, ST_JUDE_CAMPUS_ID);
      await seedUserWithCampus(demotedUid, APEX_CAMPUS_ID);
      await seedUserWithCampus(removedUid, APEX_CAMPUS_ID);

      await seedCommunity("apex-ai-club", APEX_CAMPUS_ID);
      await seedCommunity("st-jude-medical-society", ST_JUDE_CAMPUS_ID);

      await seedCommunityMember(
        `apex-ai-club_${aliceUid}`,
        "apex-ai-club",
        aliceUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${bobUid}`,
        "apex-ai-club",
        bobUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MODERATOR,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${carolUid}`,
        "apex-ai-club",
        carolUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${demotedUid}`,
        "apex-ai-club",
        demotedUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
      await seedCommunityMember(
        `apex-ai-club_${removedUid}`,
        "apex-ai-club",
        removedUid,
        APEX_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.MEMBER,
        COMMUNITY_MEMBER_STATUSES.REMOVED
      );
      await seedCommunityMember(
        `st-jude-medical-society_${eveUid}`,
        "st-jude-medical-society",
        eveUid,
        ST_JUDE_CAMPUS_ID,
        COMMUNITY_MEMBER_ROLES.ADMIN,
        COMMUNITY_MEMBER_STATUSES.ACTIVE
      );
    });

    describe("1. Leadership & Persona Authorization", () => {
      beforeEach(async () => {
        await seedM22Event("lead-event-1", aliceUid, "apex-ai-club");
        await seedM22Event("lead-demoted-1", demotedUid, "apex-ai-club");
        await seedM22Event("lead-removed-1", removedUid, "apex-ai-club");
      });

      it("active community admin can update event details", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(
          eventRef(alice, "lead-event-1").update({
            title: "Admin Updated Title",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("active community moderator can update event details", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          eventRef(bob, "lead-event-1").update({
            title: "Moderator Updated Title",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("creator demoted to regular member cannot update event details", async () => {
        const demoted = contextFor(demotedUid);
        await expectPermissionDenied(() =>
          eventRef(demoted, "lead-demoted-1").update({
            title: "Demoted Creator Hack",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("creator removed from community cannot update event details", async () => {
        const removed = contextFor(removedUid);
        await expectPermissionDenied(() =>
          eventRef(removed, "lead-removed-1").update({
            title: "Removed Creator Hack",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("regular community member cannot update event details", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          eventRef(carol, "lead-event-1").update({
            title: "Carol Hack",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("non-member student cannot update event details", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() =>
          eventRef(david, "lead-event-1").update({
            title: "David Hack",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("cross-campus user cannot update event details", async () => {
        const eve = contextFor(eveUid);
        await expectPermissionDenied(() =>
          eventRef(eve, "lead-event-1").update({
            title: "Eve Hack",
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("2. Hard Deletion Authority", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("del-upcoming-pub", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("del-upcoming-canc", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("del-ongoing-pub", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.ongoingStart,
          endAt: t.ongoingEnd,
        });
        await seedM22Event("del-completed-pub", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.completedStart,
          endAt: t.completedEnd,
        });
        await seedM22Event("del-creator-event", demotedUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("del-invalid-status", aliceUid, "apex-ai-club", {
          status: "completed",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("del-inverted-chrono", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingEnd,
          endAt: t.upcomingStart,
        });
      });

      it("active admin can hard delete upcoming published event", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(eventRef(alice, "del-upcoming-pub").delete());
      });

      it("active admin can hard delete upcoming cancelled event", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(eventRef(alice, "del-upcoming-canc").delete());
      });

      it("active moderator cannot hard delete upcoming event", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() => eventRef(bob, "del-upcoming-pub").delete());
      });

      it("original creator who is not active admin cannot hard delete event", async () => {
        const demoted = contextFor(demotedUid);
        await expectPermissionDenied(() => eventRef(demoted, "del-creator-event").delete());
      });

      it("active admin cannot hard delete ongoing event", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "del-ongoing-pub").delete());
      });

      it("active admin cannot hard delete completed event", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "del-completed-pub").delete());
      });

      it("active admin cannot hard delete event with status other than published or cancelled", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "del-invalid-status").delete());
      });

      it("active admin cannot hard delete event with inverted stored chronology", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "del-inverted-chrono").delete());
      });
    });

    describe("3. Fail-Closed Immutability Contract", () => {
      beforeEach(async () => {
        await seedM22Event("immut-event-1", aliceUid, "apex-ai-club", {
          visibility: "campus_public",
        });
      });

      it("update attempting to change visibility is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "immut-event-1").update({
            visibility: "community_only",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update attempting to change communityId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "immut-event-1").update({
            communityId: "st-jude-medical-society",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update attempting to change createdBy is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "immut-event-1").update({
            createdBy: bobUid,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update attempting to change id is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "immut-event-1").update({
            id: "different-event-id",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update attempting to change campusId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "immut-event-1").update({
            campusId: ST_JUDE_CAMPUS_ID,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("update attempting to change createdAt is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "immut-event-1").update({
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("4. Pathway A: Published Detail Edits", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("pa-upcoming-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("pa-ongoing-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.ongoingStart,
          endAt: t.ongoingEnd,
        });
        await seedM22Event("pa-completed-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.completedStart,
          endAt: t.completedEnd,
        });
        await seedM22Event("pa-cancelled-1", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
      });

      it("upcoming: moderator can update allowlisted fields", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          eventRef(bob, "pa-upcoming-1").update({
            title: "Pathway A Updated Title",
            description: "Updated description for upcoming event.",
            location: "Room 101 Innovation Lab",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("upcoming: moderator can update startAt to future timestamp", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await assertSucceeds(
          eventRef(bob, "pa-upcoming-1").update({
            startAt: t.furtherUpcomingStart,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("upcoming: update startAt to past timestamp is denied", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-upcoming-1").update({
            startAt: t.pastTimestamp,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("upcoming: update endAt before startAt is denied", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-upcoming-1").update({
            endAt: t.pastTimestamp,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("upcoming: update containing unallowlisted field is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-upcoming-1").update({
            title: "New Title",
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: moderator can update location and description", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          eventRef(bob, "pa-ongoing-1").update({
            location: "Moved to Auditorium B",
            description: "Updated ongoing event instructions.",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: moderator can extend endAt into the future", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await assertSucceeds(
          eventRef(bob, "pa-ongoing-1").update({
            endAt: t.extendedOngoingEnd,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: shortening endAt is denied", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            endAt: t.shortenedOngoingEnd,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: moving endAt to past is denied", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            endAt: t.pastTimestamp,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: changing locked field title is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            title: "Changed Ongoing Title",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: changing locked field slug is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            slug: "changed-ongoing-slug",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: changing locked field category is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            category: "cultural",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: changing locked field organizerName is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            organizerName: "New Organizer Name",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: changing locked field startAt is denied", async () => {
        const bob = contextFor(bobUid);
        const t = getTimestamps();
        await expectPermissionDenied(() =>
          eventRef(bob, "pa-ongoing-1").update({
            startAt: t.furtherUpcomingStart,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("completed: detail edit is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pa-completed-1").update({
            title: "Completed Event Edit Attempt",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("cancelled: detail edit via Pathway A is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pa-cancelled-1").update({
            title: "Cancelled Event Edit Attempt",
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("5. Pathway B: Dedicated Cancellation", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("pb-upcoming-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("pb-ongoing-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.ongoingStart,
          endAt: t.ongoingEnd,
        });
        await seedM22Event("pb-completed-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.completedStart,
          endAt: t.completedEnd,
        });
        await seedM22Event("pb-cancelled-1", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
      });

      it("upcoming: moderator can cancel event changing only status and updatedAt with atomic ledger", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();
        batch.update(eventRef(bob, "pb-upcoming-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "pb-upcoming-1"), {
          ...eventNotificationDeliveryFixture("pb-upcoming-1", bobUid, APEX_CAMPUS_ID, "apex-ai-club"),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
      });

      it("upcoming: cancelling event without atomic ledger creation is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "pb-upcoming-1").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing: moderator can cancel event changing only status and updatedAt with atomic ledger", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();
        batch.update(eventRef(bob, "pb-ongoing-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "pb-ongoing-1"), {
          ...eventNotificationDeliveryFixture("pb-ongoing-1", bobUid, APEX_CAMPUS_ID, "apex-ai-club"),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
      });


      it("completed: cancelling completed event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pb-completed-1").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("already cancelled: cancelling already cancelled event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pb-cancelled-1").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("cancelling event while simultaneously modifying title is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pb-upcoming-1").update({
            status: "cancelled",
            title: "Simultaneously Tampered Title",
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("6. Pathway C: Dedicated Republishing", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("pc-upcoming-canc", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("pc-ongoing-canc", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.ongoingStart,
          endAt: t.ongoingEnd,
        });
        await seedM22Event("pc-completed-canc", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.completedStart,
          endAt: t.completedEnd,
        });
        await seedM22Event("pc-published-1", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
      });

      it("upcoming cancelled: moderator can republish event changing only status and updatedAt", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          eventRef(bob, "pc-upcoming-canc").update({
            status: "published",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ongoing cancelled: republishing ongoing cancelled event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pc-ongoing-canc").update({
            status: "published",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("completed cancelled: republishing completed cancelled event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pc-completed-canc").update({
            status: "published",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("already published: republishing published event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pc-published-1").update({
            status: "published",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("republishing event while simultaneously modifying title is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "pc-upcoming-canc").update({
            status: "published",
            title: "Simultaneously Tampered Title",
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("7. Fail-Closed Stored Chronology", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("chrono-inverted-pub", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingEnd,
          endAt: t.upcomingStart,
        });
        await seedM22Event("chrono-inverted-canc", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.upcomingEnd,
          endAt: t.upcomingStart,
        });
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();
          const base = eventFixture("chrono-bad-types", aliceUid, "apex-ai-club", {
            campusId: APEX_CAMPUS_ID,
            startAt: "not-a-timestamp",
            endAt: t.upcomingEnd,
          });
          await db.collection("events").doc("chrono-bad-types").set(base);
        });
      });

      it("detail edit on event with inverted stored dates is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "chrono-inverted-pub").update({
            title: "Inverted Chronology Edit",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("cancellation on event with inverted stored dates is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "chrono-inverted-pub").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("republishing on event with inverted stored dates is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "chrono-inverted-canc").update({
            status: "published",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("hard deletion on event with inverted stored dates is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "chrono-inverted-pub").delete());
      });

      it("mutations on event with non-timestamp startAt are denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "chrono-bad-types").update({
            title: "Bad Types Edit",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("hard deletion on event with non-timestamp startAt is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "chrono-bad-types").delete());
      });
    });

    describe("8. Campus-Wide & Null communityId Resolution", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("null-comm-pub", aliceUid, null, {
          campusId: APEX_CAMPUS_ID,
          visibility: "campus_public",
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("null-comm-canc", aliceUid, null, {
          campusId: APEX_CAMPUS_ID,
          visibility: "campus_public",
          status: "cancelled",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();
          // Missing communityId key
          const missingKey = eventFixture("missing-comm-key", aliceUid, "apex-ai-club", {
            campusId: APEX_CAMPUS_ID,
            startAt: t.upcomingStart,
            endAt: t.upcomingEnd,
          });
          delete missingKey.communityId;
          await db.collection("events").doc("missing-comm-key").set(missingKey);

          // Non-string communityId (number)
          const badType = eventFixture("bad-comm-type", aliceUid, "apex-ai-club", {
            campusId: APEX_CAMPUS_ID,
            communityId: 99999,
            startAt: t.upcomingStart,
            endAt: t.upcomingEnd,
          });
          await db.collection("events").doc("bad-comm-type").set(badType);
        });
      });

      it("same-campus student can read valid null communityId event with campus_public visibility", async () => {
        const david = contextFor(davidUid);
        const snap = await assertSucceeds(eventRef(david, "null-comm-pub").get());
        expect(snap.exists).toBe(true);
      });

      it("cross-campus student cannot read valid null communityId event", async () => {
        const eve = contextFor(eveUid);
        await expectPermissionDenied(() => eventRef(eve, "null-comm-pub").get());
      });

      it("client Pathway A detail edit on null communityId event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "null-comm-pub").update({
            title: "Admin Edit Null Comm",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("client Pathway B cancellation on null communityId event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "null-comm-pub").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("client Pathway C republishing on null communityId event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "null-comm-canc").update({
            status: "published",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("client hard deletion on null communityId event is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "null-comm-pub").delete());
      });

      it("attempting to adopt null communityId event by writing a non-empty communityId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "null-comm-pub").update({
            communityId: "apex-ai-club",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("mutations on event missing communityId field are denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "missing-comm-key").update({
            title: "Missing Key Edit Attempt",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("hard deletion on event missing communityId field is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "missing-comm-key").delete());
      });

      it("mutations on event with non-string communityId are denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          eventRef(alice, "bad-comm-type").update({
            title: "Bad Type Edit Attempt",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("hard deletion on event with non-string communityId is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() => eventRef(alice, "bad-comm-type").delete());
      });
    });

    describe("9. RSVP Preservation & Interaction Invariants", () => {
      beforeEach(async () => {
        const t = getTimestamps();
        await seedM22Event("rsvp-pub-event", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("rsvp-canc-event", aliceUid, "apex-ai-club", {
          status: "cancelled",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });
        await seedM22Event("rsvp-del-parent-event", aliceUid, "apex-ai-club", {
          status: "published",
          startAt: t.upcomingStart,
          endAt: t.upcomingEnd,
        });

        // Seed existing RSVPs
        const rsvpExistingCancId = `rsvp-canc-event_${davidUid}`;
        await seedM22EventRsvp(rsvpExistingCancId, "rsvp-canc-event", davidUid, APEX_CAMPUS_ID);

        const rsvpDelParentId = `rsvp-del-parent-event_${davidUid}`;
        await seedM22EventRsvp(rsvpDelParentId, "rsvp-del-parent-event", davidUid, APEX_CAMPUS_ID);
        // Delete the parent event doc directly to simulate parent deletion
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("rsvp-del-parent-event").delete();
        });
      });

      it("student cannot create RSVP on cancelled event", async () => {
        const carol = contextFor(carolUid);
        const rsvpId = `rsvp-canc-event_${carolUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(carol, rsvpId).set({
            id: rsvpId,
            eventId: "rsvp-canc-event",
            campusId: APEX_CAMPUS_ID,
            userId: carolUid,
            createdAt: serverTimestamp(),
          })
        );
      });

      it("owner can delete their own RSVP after parent event has been cancelled", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `rsvp-canc-event_${davidUid}`;
        await assertSucceeds(eventRsvpRef(david, rsvpId).delete());
      });

      it("owner can delete their own RSVP after parent event has been hard-deleted", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `rsvp-del-parent-event_${davidUid}`;
        await assertSucceeds(eventRsvpRef(david, rsvpId).delete());
      });

      it("update of existing RSVP is strictly denied", async () => {
        const david = contextFor(davidUid);
        const rsvpId = `rsvp-canc-event_${davidUid}`;
        await expectPermissionDenied(() =>
          eventRsvpRef(david, rsvpId).update({
            createdAt: serverTimestamp(),
          })
        );
      });
    });
  });

  describe("Milestone 23 — Unit 23.2: Event Notifications & Delivery Ledger Security Rules", () => {
    const aliceUid = TEST_UIDS.alice; // Apex student, admin of apex-ai-club
    const bobUid = TEST_UIDS.bob; // Apex student, moderator of apex-ai-club
    const carolUid = TEST_UIDS.carol; // Apex student, regular member of apex-ai-club
    const davidUid = "m23-uid-david"; // Apex student, attendee
    const eveUid = "m23-uid-eve"; // St. Jude student (cross-campus)
    const chunkAttendeeUids = Array.from({ length: 8 }, (_, i) => `m23-chunk-att-${i + 1}`);

    const now = Date.now();
    const upcomingStart = firebase.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000);
    const upcomingEnd = firebase.firestore.Timestamp.fromMillis(now + 48 * 60 * 60 * 1000);

    beforeEach(async () => {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const batch = db.batch();

        const allM23Users = [aliceUid, bobUid, carolUid, davidUid, eveUid, ...chunkAttendeeUids];
        const names = {
          [aliceUid]: "Alice Test",
          [bobUid]: "Bob Test",
          [carolUid]: "Carol Test",
        };
        for (const uid of allM23Users) {
          const isEve = uid === eveUid;
          const campusId = isEve ? ST_JUDE_CAMPUS_ID : APEX_CAMPUS_ID;
          batch.set(db.collection("users").doc(uid), userFixture(uid, { campusId }));
          batch.set(
            db.collection("publicProfiles").doc(uid),
            publicProfileFixture(uid, {
              campusId,
              displayName: names[uid] || `${uid} Student`,
            })
          );
          batch.set(
            db.collection("directoryIndex").doc(uid),
            directoryIndexFixture(uid, {
              campusId,
              displayName: names[uid] || `${uid} Student`,
            })
          );
        }

        // Community memberships
        batch.set(
          db.collection("communityMembers").doc(`apex-ai-club_${aliceUid}`),
          communityMemberFixture("apex-ai-club", aliceUid, {
            role: COMMUNITY_MEMBER_ROLES.ADMIN,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            campusId: APEX_CAMPUS_ID,
          })
        );
        batch.set(
          db.collection("communityMembers").doc(`apex-ai-club_${bobUid}`),
          communityMemberFixture("apex-ai-club", bobUid, {
            role: COMMUNITY_MEMBER_ROLES.MODERATOR,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            campusId: APEX_CAMPUS_ID,
          })
        );
        batch.set(
          db.collection("communityMembers").doc(`apex-ai-club_${carolUid}`),
          communityMemberFixture("apex-ai-club", carolUid, {
            role: COMMUNITY_MEMBER_ROLES.MEMBER,
            status: COMMUNITY_MEMBER_STATUSES.ACTIVE,
            campusId: APEX_CAMPUS_ID,
          })
        );

        await batch.commit();
      });
    });

    async function seedEventDoc(eventId, creatorId, status = "published", overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("events").doc(eventId).set(
          eventFixture(eventId, creatorId, "apex-ai-club", {
            campusId: APEX_CAMPUS_ID,
            status,
            startAt: upcomingStart,
            endAt: upcomingEnd,
            ...overrides,
          })
        );
      });
    }

    async function seedRsvpDoc(rsvpId, eventId, userId, overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("eventRsvps").doc(rsvpId).set(
          eventRsvpFixture(eventId, userId, APEX_CAMPUS_ID, {
            id: rsvpId,
            ...overrides,
          })
        );
      });
    }

    async function seedLedgerDoc(eventId, actorId, cycleId, status = "pending", overrides = {}) {
      await testEnvironment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("eventNotificationDeliveries").doc(eventId).set(
          eventNotificationDeliveryFixture(eventId, actorId, APEX_CAMPUS_ID, "apex-ai-club", {
            cycleId,
            status,
            ...overrides,
          })
        );
      });
    }

    describe("1. Notification Preferences Schema & Compatibility", () => {
      it("allows user update with eventRsvps and eventCancellations booleans", async () => {
        const context = contextFor(aliceUid);
        await assertSucceeds(
          userRef(context, aliceUid).update({
            notificationPreferences: {
              connectionRequests: true,
              connectionAccepted: true,
              eventRsvps: false,
              eventCancellations: true,
            },
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("allows partial user preference update with only eventRsvps", async () => {
        const context = contextFor(aliceUid);
        await assertSucceeds(
          userRef(context, aliceUid).update({
            notificationPreferences: {
              eventRsvps: false,
            },
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("rejects non-boolean eventRsvps update", async () => {
        const context = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          userRef(context, aliceUid).update({
            notificationPreferences: {
              eventRsvps: "disabled",
            },
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("rejects unknown preference keys on update", async () => {
        const context = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          userRef(context, aliceUid).update({
            notificationPreferences: {
              pushNotifications: true,
            },
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("2. Atomic Event Cancellation and Ledger Creation (Section 7.A)", () => {
      beforeEach(async () => {
        await seedEventDoc("m23-cancel-event-1", aliceUid, "published");
      });

      it("valid event cancellation and matching ledger creation succeed atomically", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await assertSucceeds(batch.commit());
      });

      it("cancellation without matching ledger write is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          eventRef(bob, "m23-cancel-event-1").update({
            status: "cancelled",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("ledger creation without event cancellation in the batch is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-cancel-event-1").set({
            ...eventNotificationDeliveryFixture(
              "m23-cancel-event-1",
              bobUid,
              APEX_CAMPUS_ID,
              "apex-ai-club",
              { cycleId: "cycle_init_1234567890" }
            ),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("mismatched event ID between event and ledger is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { eventId: "m23-mismatched-event", cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("mismatched campus between event and ledger is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            ST_JUDE_CAMPUS_ID,
            "apex-ai-club",
            { cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("mismatched community between event and ledger is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            APEX_CAMPUS_ID,
            "other-club",
            { cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("forged actor profile on ledger creation is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { actorName: "Forged Bob Name", cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("actorId not matching request.auth.uid on ledger creation is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            aliceUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("non-admin regular member cannot cancel event and create ledger", async () => {
        const carol = contextFor(carolUid);
        const db = carol.firestore();
        const batch = db.batch();

        batch.update(eventRef(carol, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(carol, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            carolUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("initial ledger with status other than pending is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { status: "completed", cycleId: "cycle_init_1234567890" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("initial ledger with cycleId shorter than 10 characters is rejected", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-cancel-event-1"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.set(deliveryLedgerRef(bob, "m23-cancel-event-1"), {
          ...eventNotificationDeliveryFixture(
            "m23-cancel-event-1",
            bobUid,
            APEX_CAMPUS_ID,
            "apex-ai-club",
            { cycleId: "short" }
          ),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });
    });

    describe("3. Delivery Ledger Authorization, Checkpoint CAS & State Machine (Section 7.B)", () => {
      beforeEach(async () => {
        await seedEventDoc("m23-ledger-event", aliceUid, "cancelled");
        await seedLedgerDoc("m23-ledger-event", aliceUid, "cycle_test_1234567890", "pending", {
          checkpointVersion: 0,
          processedCount: 0,
        });
      });

      it("unauthenticated user cannot read ledger", async () => {
        await expectPermissionDenied(() =>
          deliveryLedgerRef(unauthenticated(), "m23-ledger-event").get()
        );
        await expectPermissionDenied(() =>
          deliveryLedgerRef(unauthenticated(), "nonexistent-event").get()
        );
      });

      it("unrelated student cannot read existing ledger", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(david, "m23-ledger-event").get()
        );
      });

      it("cross-campus student cannot read existing foreign-campus ledger", async () => {
        const eve = contextFor(eveUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(eve, "m23-ledger-event").get()
        );
      });

      it("authorized community admin or actor can read existing ledger", async () => {
        const alice = contextFor(aliceUid);
        const bob = contextFor(bobUid);
        await assertSucceeds(deliveryLedgerRef(alice, "m23-ledger-event").get());
        await assertSucceeds(deliveryLedgerRef(bob, "m23-ledger-event").get());
      });

      it("authorized manager can read existing orphaned ledger after event deletion", async () => {
        await seedEventDoc("m23-deleted-event", aliceUid, "cancelled");
        await seedLedgerDoc("m23-deleted-event", aliceUid, "cycle_del_1234567890", "superseded", {
          checkpointVersion: 1,
          processedCount: 2,
        });
        // Delete parent event
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("m23-deleted-event").delete();
        });

        const alice = contextFor(aliceUid);
        const snap = await assertSucceeds(deliveryLedgerRef(alice, "m23-deleted-event").get());
        expect(snap.exists).toBe(true);
        expect(snap.data().status).toBe("superseded");
      });

      it("authorized manager can read nonexistent ledger for an event they manage", async () => {
        await seedEventDoc("m23-alice-managed-event", aliceUid, "published");
        const alice = contextFor(aliceUid);
        const snap = await assertSucceeds(
          deliveryLedgerRef(alice, "m23-alice-managed-event").get()
        );
        expect(snap.exists).toBe(false);
      });

      it("unauthorized user cannot probe nonexistent ledger (no cross-campus existence disclosure)", async () => {
        const eve = contextFor(eveUid);
        const david = contextFor(davidUid);
        // Existing foreign-campus ledger is denied
        await expectPermissionDenied(() =>
          deliveryLedgerRef(eve, "m23-ledger-event").get()
        );
        // Nonexistent ledger on another campus is ALSO denied (no existence oracle)
        await expectPermissionDenied(() =>
          deliveryLedgerRef(eve, "m23-nonexistent-event").get()
        );
        // Same-campus unauthorized student reading nonexistent ledger is ALSO denied
        await expectPermissionDenied(() =>
          deliveryLedgerRef(david, "m23-nonexistent-event").get()
        );
      });

      it("event creator without active leadership role cannot read existing ledger cancelled by another manager", async () => {
        // Event created by Carol (regular member), cancelled by Alice (admin)
        await seedEventDoc("m23-carol-event-existing", carolUid, "cancelled");
        await seedLedgerDoc("m23-carol-event-existing", aliceUid, "cycle_carol_existing1", "pending");

        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(carol, "m23-carol-event-existing").get()
        );
      });

      it("event creator without active leadership role cannot read nonexistent ledger for an event they created", async () => {
        // Event created by Carol (regular member), published, no ledger exists
        await seedEventDoc("m23-carol-event-nonexistent", carolUid, "published");

        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(carol, "m23-carol-event-nonexistent").get()
        );
      });

      it("demoted creator who was the cancelling actor retains read access to existing signed ledger", async () => {
        // Carol cancelled the event when she was leader, then was demoted to regular member
        await seedEventDoc("m23-carol-actor-ledger", carolUid, "cancelled");
        await seedLedgerDoc("m23-carol-actor-ledger", carolUid, "cycle_carol_actor1", "pending");

        const carol = contextFor(carolUid);
        const snap = await assertSucceeds(
          deliveryLedgerRef(carol, "m23-carol-actor-ledger").get()
        );
        expect(snap.exists).toBe(true);
        expect(snap.data().actorId).toBe(carolUid);
      });

      it("point-listing / collection query on delivery ledgers is denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          alice.firestore().collection("eventNotificationDeliveries").get()
        );
      });

      it("ledger hard deletion is strictly denied", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(alice, "m23-ledger-event").delete()
        );
      });

      it("valid checkpoint update advancing version by exactly 1 succeeds", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            status: "in_progress",
            checkpointVersion: 1,
            lastProcessedRsvpId: "m23-ledger-event_carol",
            processedCount: 1,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update attempting to skip version (0 to 2) is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            status: "in_progress",
            checkpointVersion: 2,
            processedCount: 1,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("stale checkpoint update attempting to reuse same version (0 to 0) is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            status: "in_progress",
            checkpointVersion: 0,
            processedCount: 1,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update decreasing processedCount is rejected", async () => {
        await seedLedgerDoc("m23-ledger-event", aliceUid, "cycle_test_1234567890", "in_progress", {
          checkpointVersion: 1,
          processedCount: 5,
        });

        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            checkpointVersion: 2,
            processedCount: 3,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update attempting to mutate immutable cycleId is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            cycleId: "cycle_tampered_1234567890",
            checkpointVersion: 1,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update injecting unknown fields is rejected", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            checkpointVersion: 1,
            status: "in_progress",
            processedCount: 1,
            injectedField: "malicious",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update transitioning status to completed succeeds", async () => {
        await seedLedgerDoc("m23-ledger-event", aliceUid, "cycle_test_1234567890", "in_progress", {
          checkpointVersion: 1,
          processedCount: 5,
        });

        const bob = contextFor(bobUid);
        await assertSucceeds(
          deliveryLedgerRef(bob, "m23-ledger-event").update({
            status: "completed",
            checkpointVersion: 2,
            processedCount: 5,
            updatedAt: serverTimestamp(),
          })
        );
      });
    });

    describe("4. Repeat Cancellation & Republication Supersession (Section 7.A & 7.C)", () => {
      beforeEach(async () => {
        await seedEventDoc("m23-repub-event", aliceUid, "cancelled");
        await seedLedgerDoc("m23-repub-event", aliceUid, "cycle_repub_1234567890", "in_progress", {
          checkpointVersion: 1,
          processedCount: 3,
        });
      });

      it("atomic republishing updates event to published and ledger to superseded", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(eventRef(bob, "m23-repub-event"), {
          status: "published",
          updatedAt: serverTimestamp(),
        });
        batch.update(deliveryLedgerRef(bob, "m23-repub-event"), {
          status: "superseded",
          updatedAt: serverTimestamp(),
        });

        await assertSucceeds(batch.commit());
      });

      it("lazy supersession of ledger succeeds after event is already published", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context
            .firestore()
            .collection("events")
            .doc("m23-repub-event")
            .update({ status: "published" });
        });

        const bob = contextFor(bobUid);
        await assertSucceeds(
          deliveryLedgerRef(bob, "m23-repub-event").update({
            status: "superseded",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("atomic event deletion and ledger supersession succeeds for community admin", async () => {
        const alice = contextFor(aliceUid);
        const db = alice.firestore();
        const batch = db.batch();

        batch.delete(eventRef(alice, "m23-repub-event"));
        batch.update(deliveryLedgerRef(alice, "m23-repub-event"), {
          status: "superseded",
          updatedAt: serverTimestamp(),
        });

        await assertSucceeds(batch.commit());
      });

      it("lazy supersession of ledger succeeds after event is already deleted", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context
            .firestore()
            .collection("events")
            .doc("m23-repub-event")
            .delete();
        });

        const bob = contextFor(bobUid);
        await assertSucceeds(
          deliveryLedgerRef(bob, "m23-repub-event").update({
            status: "superseded",
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update fails-closed once event is deleted", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context
            .firestore()
            .collection("events")
            .doc("m23-repub-event")
            .delete();
        });

        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-repub-event").update({
            checkpointVersion: 2,
            processedCount: 4,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("checkpoint update fails-closed once event is published", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context
            .firestore()
            .collection("events")
            .doc("m23-repub-event")
            .update({ status: "published" });
        });

        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          deliveryLedgerRef(bob, "m23-repub-event").update({
            checkpointVersion: 2,
            processedCount: 4,
            updatedAt: serverTimestamp(),
          })
        );
      });

      it("repeat cancellation with fresh cycleId succeeds after event was republished", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();
          await db.collection("events").doc("m23-repub-event").update({ status: "published" });
          await db.collection("eventNotificationDeliveries").doc("m23-repub-event").update({ status: "superseded" });
        });

        const alice = contextFor(aliceUid);
        const db = alice.firestore();
        const batch = db.batch();

        batch.update(eventRef(alice, "m23-repub-event"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.update(deliveryLedgerRef(alice, "m23-repub-event"), {
          cycleId: "cycle_second_9876543210",
          actorId: aliceUid,
          actorName: "Alice Test",
          actorAvatar: null,
          status: "pending",
          checkpointVersion: 0,
          lastProcessedRsvpId: null,
          processedCount: 0,
          updatedAt: serverTimestamp(),
        });

        await assertSucceeds(batch.commit());
      });

      it("repeat cancellation reusing identical cycleId is rejected", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();
          await db.collection("events").doc("m23-repub-event").update({ status: "published" });
          await db.collection("eventNotificationDeliveries").doc("m23-repub-event").update({ status: "superseded" });
        });

        const alice = contextFor(aliceUid);
        const db = alice.firestore();
        const batch = db.batch();

        batch.update(eventRef(alice, "m23-repub-event"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.update(deliveryLedgerRef(alice, "m23-repub-event"), {
          cycleId: "cycle_repub_1234567890",
          actorId: aliceUid,
          actorName: "Alice Test",
          actorAvatar: null,
          status: "pending",
          checkpointVersion: 0,
          lastProcessedRsvpId: null,
          processedCount: 0,
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });

      it("attempting repeat cancellation update while previous cycle is still in_progress is rejected", async () => {
        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context.firestore().collection("events").doc("m23-repub-event").update({ status: "published" });
        });

        const alice = contextFor(aliceUid);
        const db = alice.firestore();
        const batch = db.batch();

        batch.update(eventRef(alice, "m23-repub-event"), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        batch.update(deliveryLedgerRef(alice, "m23-repub-event"), {
          cycleId: "cycle_second_9876543210",
          status: "pending",
          checkpointVersion: 0,
          processedCount: 0,
          updatedAt: serverTimestamp(),
        });

        await expectPermissionDenied(() => batch.commit());
      });
    });

    describe("5. Event RSVP Notification Authorization (Section 7.D)", () => {
      beforeEach(async () => {
        await seedEventDoc("m23-rsvp-event", aliceUid, "published", {
          title: "Apex Tech Symposium",
        });
      });

      it("valid atomic RSVP and organizer notification creation succeeds", async () => {
        const carol = contextFor(carolUid);
        const db = carol.firestore();
        const batch = db.batch();

        const rsvpId = `m23-rsvp-event_${carolUid}`;
        batch.set(eventRsvpRef(carol, rsvpId), {
          id: rsvpId,
          eventId: "m23-rsvp-event",
          campusId: APEX_CAMPUS_ID,
          userId: carolUid,
          createdAt: serverTimestamp(),
        });
        batch.set(
          notificationRef(carol, aliceUid, `rsvp_m23-rsvp-event_${carolUid}`),
          {
            ...eventRsvpNotificationFixture(aliceUid, carolUid, "m23-rsvp-event", {
              referenceTitle: "Apex Tech Symposium",
            }),
            createdAt: serverTimestamp(),
          }
        );

        await assertSucceeds(batch.commit());
      });

      it("creating RSVP notification without atomic RSVP document creation is denied", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          notificationRef(carol, aliceUid, `rsvp_m23-rsvp-event_${carolUid}`).set({
            ...eventRsvpNotificationFixture(aliceUid, carolUid, "m23-rsvp-event"),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("self-notification (creator sending RSVP notice to themselves) is denied", async () => {
        const alice = contextFor(aliceUid);
        const db = alice.firestore();
        const batch = db.batch();

        const rsvpId = `m23-rsvp-event_${aliceUid}`;
        batch.set(eventRsvpRef(alice, rsvpId), {
          id: rsvpId,
          eventId: "m23-rsvp-event",
          campusId: APEX_CAMPUS_ID,
          userId: aliceUid,
          createdAt: serverTimestamp(),
        });
        batch.set(
          notificationRef(alice, aliceUid, `rsvp_m23-rsvp-event_${aliceUid}`),
          {
            ...eventRsvpNotificationFixture(aliceUid, aliceUid, "m23-rsvp-event"),
            createdAt: serverTimestamp(),
          }
        );

        await expectPermissionDenied(() => batch.commit());
      });

      it("including cycleId on event_rsvp notification is denied", async () => {
        const carol = contextFor(carolUid);
        const db = carol.firestore();
        const batch = db.batch();

        const rsvpId = `m23-rsvp-event_${carolUid}`;
        batch.set(eventRsvpRef(carol, rsvpId), {
          id: rsvpId,
          eventId: "m23-rsvp-event",
          campusId: APEX_CAMPUS_ID,
          userId: carolUid,
          createdAt: serverTimestamp(),
        });
        batch.set(
          notificationRef(carol, aliceUid, `rsvp_m23-rsvp-event_${carolUid}`),
          {
            ...eventRsvpNotificationFixture(aliceUid, carolUid, "m23-rsvp-event", {
              cycleId: "forbidden_cycle_id",
            }),
            createdAt: serverTimestamp(),
          }
        );

        await expectPermissionDenied(() => batch.commit());
      });

      it("RSVP notification with mismatched referenceTitle is denied", async () => {
        const carol = contextFor(carolUid);
        const db = carol.firestore();
        const batch = db.batch();

        const rsvpId = `m23-rsvp-event_${carolUid}`;
        batch.set(eventRsvpRef(carol, rsvpId), {
          id: rsvpId,
          eventId: "m23-rsvp-event",
          campusId: APEX_CAMPUS_ID,
          userId: carolUid,
          createdAt: serverTimestamp(),
        });
        batch.set(
          notificationRef(carol, aliceUid, `rsvp_m23-rsvp-event_${carolUid}`),
          {
            ...eventRsvpNotificationFixture(aliceUid, carolUid, "m23-rsvp-event", {
              referenceTitle: "Mismatched Forged Title",
            }),
            createdAt: serverTimestamp(),
          }
        );

        await expectPermissionDenied(() => batch.commit());
      });

      it("cross-campus student cannot create event RSVP notification", async () => {
        const eve = contextFor(eveUid);
        const db = eve.firestore();
        const batch = db.batch();

        const rsvpId = `m23-rsvp-event_${eveUid}`;
        batch.set(eventRsvpRef(eve, rsvpId), {
          id: rsvpId,
          eventId: "m23-rsvp-event",
          campusId: ST_JUDE_CAMPUS_ID,
          userId: eveUid,
          createdAt: serverTimestamp(),
        });
        batch.set(
          notificationRef(eve, aliceUid, `rsvp_m23-rsvp-event_${eveUid}`),
          {
            ...eventRsvpNotificationFixture(aliceUid, eveUid, "m23-rsvp-event"),
            createdAt: serverTimestamp(),
          }
        );

        await expectPermissionDenied(() => batch.commit());
      });
    });

    describe("6. Event Cancelled Notification Authorization & Multi-Admin Resumption (Section 7.C)", () => {
      const cycleId = "cycle_canc_1234567890";

      beforeEach(async () => {
        await seedEventDoc("m23-canc-event", aliceUid, "cancelled", {
          title: "Annual Campus AI Hackathon",
        });
        await seedLedgerDoc("m23-canc-event", aliceUid, cycleId, "in_progress", {
          checkpointVersion: 1,
          processedCount: 0,
        });
        await seedRsvpDoc(`m23-canc-event_${davidUid}`, "m23-canc-event", davidUid);
        await seedRsvpDoc(`m23-canc-event_${carolUid}`, "m23-canc-event", carolUid);
      });

      it("original cancelling admin (alice) can write cancellation notice to attendee", async () => {
        const alice = contextFor(aliceUid);
        await assertSucceeds(
          notificationRef(alice, davidUid, `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(davidUid, aliceUid, "m23-canc-event", cycleId, {
              referenceTitle: "Annual Campus AI Hackathon",
            }),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("co-administrator (bob) resuming delivery can write notice bound to original actor (alice)", async () => {
        const bob = contextFor(bobUid);
        await assertSucceeds(
          notificationRef(bob, carolUid, `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(carolUid, aliceUid, "m23-canc-event", cycleId, {
              referenceTitle: "Annual Campus AI Hackathon",
            }),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("resuming admin attempting to replace ledger actor with their own identity is denied", async () => {
        const bob = contextFor(bobUid);
        await expectPermissionDenied(() =>
          notificationRef(bob, carolUid, `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(carolUid, bobUid, "m23-canc-event", cycleId),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("unauthorized non-admin student cannot write cancellation notifications", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() =>
          notificationRef(david, carolUid, `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(carolUid, aliceUid, "m23-canc-event", cycleId),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("writing notice to user without an RSVP is rejected", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          notificationRef(alice, "unregistered-user", `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture("unregistered-user", aliceUid, "m23-canc-event", cycleId),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("notification with mismatched cycleId is rejected", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          notificationRef(alice, davidUid, "cancel_m23-canc-event_wrong_cycle").set({
            ...eventCancelledNotificationFixture(davidUid, aliceUid, "m23-canc-event", "wrong_cycle"),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("writing cancellation notice is rejected once ledger is superseded", async () => {
        await seedLedgerDoc("m23-canc-event", aliceUid, cycleId, "superseded");

        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          notificationRef(alice, davidUid, `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(davidUid, aliceUid, "m23-canc-event", cycleId),
            createdAt: serverTimestamp(),
          })
        );
      });

      it("writing cancellation notice fails-closed if event status is published", async () => {
        await seedEventDoc("m23-canc-event", aliceUid, "published");

        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          notificationRef(alice, davidUid, `cancel_m23-canc-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(davidUid, aliceUid, "m23-canc-event", cycleId),
            createdAt: serverTimestamp(),
          })
        );
      });
    });

    describe("7. Recipient Privacy, Read-State Updates & Legacy Compatibility (Section 7.E)", () => {
      const cycleId = "cycle_compat_1234567890";

      beforeEach(async () => {
        await seedEventDoc("m23-compat-event", aliceUid, "cancelled");
        await seedLedgerDoc("m23-compat-event", aliceUid, cycleId, "in_progress");
        await seedRsvpDoc(`m23-compat-event_${davidUid}`, "m23-compat-event", davidUid);

        await testEnvironment.withSecurityRulesDisabled(async (context) => {
          await context
            .firestore()
            .collection("users")
            .doc(davidUid)
            .collection("notifications")
            .doc(`cancel_m23-compat-event_${cycleId}`)
            .set(
              eventCancelledNotificationFixture(davidUid, aliceUid, "m23-compat-event", cycleId)
            );
        });
      });

      it("recipient can point-read their own notification", async () => {
        const david = contextFor(davidUid);
        await assertSucceeds(
          notificationRef(david, davidUid, `cancel_m23-compat-event_${cycleId}`).get()
        );
      });

      it("unrelated user cannot point-read recipient's notification", async () => {
        const carol = contextFor(carolUid);
        await expectPermissionDenied(() =>
          notificationRef(carol, davidUid, `cancel_m23-compat-event_${cycleId}`).get()
        );
      });

      it("recipient can update isRead to true", async () => {
        const david = contextFor(davidUid);
        await assertSucceeds(
          notificationRef(david, davidUid, `cancel_m23-compat-event_${cycleId}`).update({
            isRead: true,
          })
        );
      });

      it("recipient attempting to modify actorName on notification update is rejected", async () => {
        const david = contextFor(davidUid);
        await expectPermissionDenied(() =>
          notificationRef(david, davidUid, `cancel_m23-compat-event_${cycleId}`).update({
            actorName: "Tampered Name",
          })
        );
      });

      it("other user attempting to mark recipient's notification as read is rejected", async () => {
        const alice = contextFor(aliceUid);
        await expectPermissionDenied(() =>
          notificationRef(alice, davidUid, `cancel_m23-compat-event_${cycleId}`).update({
            isRead: true,
          })
        );
      });

      it("recipient can delete notification from their inbox", async () => {
        const david = contextFor(davidUid);
        await assertSucceeds(
          notificationRef(david, davidUid, `cancel_m23-compat-event_${cycleId}`).delete()
        );
      });

      it("notification with referenceTitle exceeding 100 characters is rejected", async () => {
        const alice = contextFor(aliceUid);
        const tooLongTitle = "A".repeat(101);
        await expectPermissionDenied(() =>
          notificationRef(alice, davidUid, `cancel_m23-compat-event_${cycleId}`).set({
            ...eventCancelledNotificationFixture(davidUid, aliceUid, "m23-compat-event", cycleId, {
              referenceTitle: tooLongTitle,
            }),
            createdAt: serverTimestamp(),
          })
        );
      });
    });

    describe("8. Access-Call Budget & Chunk Size (CHUNK_SIZE = 8) Verification (Section 7.F)", () => {
      const chunkCycleId = "cycle_chunk_1234567890";
      const chunkEventId = "m23-chunk-event";

      beforeEach(async () => {
        await seedEventDoc(chunkEventId, aliceUid, "cancelled", {
          title: "Grand Campus Hackathon",
        });
        await seedLedgerDoc(chunkEventId, aliceUid, chunkCycleId, "in_progress", {
          checkpointVersion: 0,
          processedCount: 0,
        });

        for (const attUid of chunkAttendeeUids) {
          await seedRsvpDoc(`${chunkEventId}_${attUid}`, chunkEventId, attUid);
        }
      });

      it("checkpoint batch of exactly 8 notifications plus 1 ledger update commits within 20-lookup budget", async () => {
        const bob = contextFor(bobUid);
        const db = bob.firestore();
        const batch = db.batch();

        batch.update(deliveryLedgerRef(bob, chunkEventId), {
          checkpointVersion: 1,
          status: "in_progress",
          processedCount: 8,
          lastProcessedRsvpId: `${chunkEventId}_${chunkAttendeeUids[7]}`,
          updatedAt: serverTimestamp(),
        });

        for (const attUid of chunkAttendeeUids) {
          const notifId = `cancel_${chunkEventId}_${chunkCycleId}`;
          batch.set(
            notificationRef(bob, attUid, notifId),
            {
              ...eventCancelledNotificationFixture(attUid, aliceUid, chunkEventId, chunkCycleId, {
                referenceTitle: "Grand Campus Hackathon",
              }),
              createdAt: serverTimestamp(),
            }
          );
        }

        await assertSucceeds(batch.commit());
      });
    });
  });
});
