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
  notificationFixture,
  postFixture,
  seedBaseData,
  userFixture,
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

function notificationRef(context, recipientId, notificationId) {
  return userRef(context, recipientId)
    .collection("notifications")
    .doc(notificationId);
}

function userCreateData(uid, overrides = {}) {
  return {
    ...userFixture(uid),
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

  it("allow authenticated users to read another profile under the current policy", async () => {
    await assertSucceeds(userRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).get());
  });

  it("allow a valid owner profile creation", async () => {
    const context = contextFor("new-user");
    await assertSucceeds(
      userRef(context, "new-user").set(userCreateData("new-user"))
    );
  });

  it("reject a profile created under the wrong document ID", async () => {
    const context = contextFor("new-user");
    await expectPermissionDenied(() =>
      userRef(context, "different-document").set(userCreateData("new-user"))
    );
  });

  it("reject a profile with a mismatched embedded UID", async () => {
    const context = contextFor("mismatched-user");
    await expectPermissionDenied(() =>
      userRef(context, "mismatched-user").set(
        userCreateData("mismatched-user", { uid: "different-uid" })
      )
    );
  });

  it("reject an extra field on profile creation", async () => {
    const context = contextFor("extra-user");
    await expectPermissionDenied(() =>
      userRef(context, "extra-user").set(
        userCreateData("extra-user", { role: "admin" })
      )
    );
  });

  it("reject a profile missing a required field", async () => {
    const context = contextFor("missing-user");
    const data = userCreateData("missing-user");
    delete data.bio;
    await expectPermissionDenied(() =>
      userRef(context, "missing-user").set(data)
    );
  });

  it("reject invalid profile primitive types", async () => {
    const context = contextFor("invalid-type-user");
    await expectPermissionDenied(() =>
      userRef(context, "invalid-type-user").set(
        userCreateData("invalid-type-user", { isDiscoverable: "true" })
      )
    );
  });

  it("reject invalid nested preference shapes", async () => {
    const context = contextFor("invalid-preferences-user");
    await expectPermissionDenied(() =>
      userRef(context, "invalid-preferences-user").set(
        userCreateData("invalid-preferences-user", {
          notificationPreferences: { sms: true },
        })
      )
    );
  });

  it("reject client-supplied profile timestamps", async () => {
    const context = contextFor("invalid-time-user");
    await expectPermissionDenied(() =>
      userRef(context, "invalid-time-user").set(
        userCreateData("invalid-time-user", { createdAt: timestamp })
      )
    );
  });

  it("reject a profile email that does not match Auth", async () => {
    const context = contextFor("email-user", "email-user@example.test");
    await expectPermissionDenied(() =>
      userRef(context, "email-user").set(
        userCreateData("email-user", { email: "spoofed@example.test" })
      )
    );
  });

  it("allow legitimate profile and partial settings updates", async () => {
    const context = contextFor(TEST_UIDS.alice);

    await assertSucceeds(
      userRef(context, TEST_UIDS.alice).update({
        bio: "Updated test bio",
        skills: ["Testing", "Rules"],
        updatedAt: serverTimestamp(),
      })
    );
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

  it("reject invalid profile update types and field injection", async () => {
    const context = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ skills: "not-a-list" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ socialLinks: { github: true } })
    );
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
});
