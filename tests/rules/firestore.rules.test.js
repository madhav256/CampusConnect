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

const contextFor = (uid) =>
  testEnvironment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
  });

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

async function seedPendingConnection(senderId = TEST_UIDS.alice, receiverId = TEST_UIDS.bob) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("connections")
      .doc(`${senderId}_${receiverId}`)
      .set(connectionFixture(senderId, receiverId));
  });
}

async function seedAcceptedConnection(senderId = TEST_UIDS.alice, receiverId = TEST_UIDS.bob) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("connections")
      .doc(`${senderId}_${receiverId}`)
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

  it("allow an owner to create their own profile", async () => {
    const context = contextFor("new-user");
    await assertSucceeds(
      userRef(context, "new-user").set({
        ...userFixture("new-user"),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("allow an owner to update profile and settings fields", async () => {
    const context = contextFor(TEST_UIDS.alice);
    await assertSucceeds(
      userRef(context, TEST_UIDS.alice).update({
        bio: "Updated test bio",
        isDiscoverable: false,
        notificationPreferences: {
          connectionRequests: false,
          connectionAccepted: true,
        },
        updatedAt: serverTimestamp(),
      })
    );
  });

  it("reject cross-user updates", async () => {
    await expectPermissionDenied(() =>
      userRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob).update({
        isDiscoverable: false,
      })
    );
  });

  it("reject identity tampering and invalid settings shapes", async () => {
    const context = contextFor(TEST_UIDS.alice);

    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ uid: "spoofed" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ email: "spoofed@example.test" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ createdAt: laterTimestamp })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ role: "admin" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({ isDiscoverable: "false" })
    );
    await expectPermissionDenied(() =>
      userRef(context, TEST_UIDS.alice).update({
        notificationPreferences: { sms: true },
      })
    );
  });

  it("reject user deletion", async () => {
    await expectPermissionDenied(() =>
      userRef(contextFor(TEST_UIDS.alice), TEST_UIDS.alice).delete()
    );
  });

  it("KNOWN GAP 13C: permit an owner to create an unvalidated user shape", async () => {
    const context = contextFor("gap-user");
    await assertSucceeds(
      userRef(context, "gap-user").set({
        uid: "different-uid",
        role: "admin",
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

  it("reject posts with a different author or nonzero initial counters", async () => {
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
  });

  it("reject a post with a client timestamp instead of request time", async () => {
    await expectPermissionDenied(() =>
      postRef(contextFor(TEST_UIDS.alice), "wrong-time").set({
        ...postFixture("wrong-time", TEST_UIDS.alice),
        createdAt: timestamp,
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

  it("KNOWN GAP 13C: permit the post author to edit protected post fields", async () => {
    await assertSucceeds(
      postRef(contextFor(TEST_UIDS.alice), TEST_IDS.alicePost).update({
        content: "Edited outside the current UI",
      })
    );
  });

  it("KNOWN GAP 13C: permit arbitrary comment-counter changes without a comment mutation", async () => {
    await assertSucceeds(
      postRef(contextFor(TEST_UIDS.carol), TEST_IDS.alicePost).update({
        commentsCount: 99,
        updatedAt: laterTimestamp,
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

  it("allow authenticated reads and author-owned comment mutations", async () => {
    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const newComment = commentRef(alice, TEST_IDS.alicePost, "comment-new");

    await assertSucceeds(
      newComment.set(commentFixture(TEST_UIDS.alice))
    );
    await assertSucceeds(newComment.update({ content: "Edited comment" }));
    await expectPermissionDenied(() =>
      commentRef(bob, TEST_IDS.alicePost, "comment-new").update({
        content: "Not the author",
      })
    );
    await assertSucceeds(newComment.delete());
  });

  it("allow the normal comment and parent-counter batch", async () => {
    const context = contextFor(TEST_UIDS.bob);
    const db = context.firestore();
    const newComment = commentRef(context, TEST_IDS.alicePost, "comment-batch");
    const post = postRef(context, TEST_IDS.alicePost);

    await assertSucceeds(
      db.batch()
        .set(newComment, {
          ...commentFixture(TEST_UIDS.bob),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        .update(post, {
          commentsCount: firebase.firestore.FieldValue.increment(1),
          updatedAt: serverTimestamp(),
        })
        .commit()
    );
  });

  it("KNOWN GAP 13C: permit arbitrary fields and spoofed snapshots on comment creation", async () => {
    await assertSucceeds(
      commentRef(contextFor(TEST_UIDS.bob), TEST_IDS.alicePost, "comment-gap").set({
        ...commentFixture(TEST_UIDS.bob),
        authorName: "Forged Name",
        role: "admin",
      })
    );
  });
});

describe("likes rules", () => {
  it("reject unauthenticated reads", async () => {
    await expectPermissionDenied(() =>
      likeRef(unauthenticated(), TEST_IDS.alicePost, TEST_UIDS.alice).get()
    );
  });

  it("allow a user to create and delete only their own like", async () => {
    const alice = contextFor(TEST_UIDS.alice);
    const bob = contextFor(TEST_UIDS.bob);
    const aliceLike = likeRef(alice, TEST_IDS.alicePost, TEST_UIDS.alice);

    await assertSucceeds(
      aliceLike.set({ userId: TEST_UIDS.alice, createdAt: serverTimestamp() })
    );
    await expectPermissionDenied(() =>
      likeRef(alice, TEST_IDS.alicePost, TEST_UIDS.bob).set({
        userId: TEST_UIDS.bob,
        createdAt: serverTimestamp(),
      })
    );
    await expectPermissionDenied(() =>
      likeRef(alice, TEST_IDS.alicePost, TEST_UIDS.alice).set({
        userId: TEST_UIDS.bob,
      })
    );
    await expectPermissionDenied(() =>
      likeRef(bob, TEST_IDS.alicePost, TEST_UIDS.alice).delete()
    );
    await assertSucceeds(aliceLike.delete());
  });

  it("reject like updates", async () => {
    const context = contextFor(TEST_UIDS.alice);
    const ref = likeRef(context, TEST_IDS.alicePost, TEST_UIDS.alice);
    await assertSucceeds(ref.set({ userId: TEST_UIDS.alice, createdAt: timestamp }));
    await expectPermissionDenied(() => ref.update({ userId: "changed" }));
  });

  it("KNOWN GAP 13C: permit arbitrary fields on like creation", async () => {
    await assertSucceeds(
      likeRef(contextFor(TEST_UIDS.carol), TEST_IDS.alicePost, TEST_UIDS.carol).set({
        userId: TEST_UIDS.carol,
        createdAt: timestamp,
        forgedMetadata: true,
      })
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

    await seedPendingConnection("alice", "carol");
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
    await assertSucceeds(
      connectionRef(contextFor(TEST_UIDS.bob), "alice_bob").delete()
    );

    await seedAcceptedConnection();
    await assertSucceeds(
      connectionRef(contextFor(TEST_UIDS.bob), "alice_bob").delete()
    );

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

    await assertSucceeds(bob.firestore().collection("users").doc("bob").collection("notifications").get());
    await expectPermissionDenied(() =>
      alice.firestore().collection("users").doc("bob").collection("notifications").get()
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
        transaction.set(db.collection("users").doc("bob").collection("notifications").doc("req_alice_bob"), {
          ...notificationFixture(TEST_UIDS.bob, TEST_UIDS.alice, {
            actorName: "Forged Alice",
            createdAt: serverTimestamp(),
          }),
        });
      })
    );
  });

  it("allow a valid acceptance notification with the accepted transition", async () => {
    await seedPendingConnection();
    const bob = contextFor(TEST_UIDS.bob);
    const db = bob.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const notification = db
      .collection("users")
      .doc("alice")
      .collection("notifications")
      .doc("acc_alice_bob");

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        transaction.update(connection, {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
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

  it("allow the recipient to delete and the request actor to delete during cancellation", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await assertSucceeds(
      notificationRef(contextFor(TEST_UIDS.bob), TEST_UIDS.bob, notification.id).delete()
    );

    await seedPendingConnection();
    const alice = contextFor(TEST_UIDS.alice);
    const db = alice.firestore();
    const connection = db.collection("connections").doc("alice_bob");
    const requestNotification = db
      .collection("users")
      .doc("bob")
      .collection("notifications")
      .doc("req_alice_bob");
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("users")
        .doc("bob")
        .collection("notifications")
        .doc("req_alice_bob")
        .set(notificationFixture(TEST_UIDS.bob, TEST_UIDS.alice));
    });

    await assertSucceeds(
      db.runTransaction(async (transaction) => {
        await transaction.get(connection);
        await transaction.get(requestNotification);
        transaction.delete(connection);
        transaction.delete(requestNotification);
      })
    );
  });

  it("KNOWN GAP 13C: permit the stored actor to directly read another user's notification", async () => {
    const notification = await seedNotification(TEST_UIDS.bob, TEST_UIDS.alice);
    await assertSucceeds(
      notificationRef(contextFor(TEST_UIDS.alice), TEST_UIDS.bob, notification.id).get()
    );
  });
});
