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
