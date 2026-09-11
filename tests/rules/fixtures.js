import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

export const TEST_UIDS = {
  alice: "alice",
  bob: "bob",
  carol: "carol",
};

export const TEST_IDS = {
  alicePost: "post-alice",
  bobPost: "post-bob",
  existingComment: "comment-existing",
};

const timestamp = firebase.firestore.Timestamp.fromMillis(1_700_000_000_000);

export function userFixture(uid, overrides = {}) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
  };

  return {
    uid,
    displayName: names[uid] || "Test Student",
    email: `${uid}@example.test`,
    photoURL: null,
    bio: "Rules test profile",
    department: "Computer Science",
    year: "Senior",
    skills: ["Testing"],
    socialLinks: {
      github: "",
      linkedin: "",
      portfolio: "",
      website: "",
    },
    isDiscoverable: true,
    notificationPreferences: {
      connectionRequests: true,
      connectionAccepted: true,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function postFixture(id, authorId, overrides = {}) {
  return {
    authorId,
    authorName: authorId === TEST_UIDS.alice ? "Alice Test" : "Bob Test",
    authorAvatar: null,
    content: "A deterministic rules-test post.",
    likesCount: 0,
    commentsCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
    id,
  };
}

export function commentFixture(authorId, overrides = {}) {
  return {
    authorId,
    authorName: authorId === TEST_UIDS.alice ? "Alice Test" : "Bob Test",
    authorAvatar: null,
    content: "A deterministic rules-test comment.",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function connectionFixture(senderId, receiverId, overrides = {}) {
  const users = [senderId, receiverId].sort();
  return {
    users,
    senderId,
    receiverId,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function notificationFixture(recipientId, actorId, overrides = {}) {
  const connectionId = [recipientId, actorId].sort().join("_");
  const type = overrides.type || "connection_request";
  const id = overrides.id || `${type === "connection_accepted" ? "acc" : "req"}_${connectionId}`;

  return {
    id,
    recipientId,
    actorId,
    actorName: actorId === TEST_UIDS.alice ? "Alice Test" : "Bob Test",
    actorAvatar: null,
    type,
    referenceId: connectionId,
    isRead: false,
    createdAt: timestamp,
    ...overrides,
  };
}

export async function seedBaseData(testEnvironment) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = db.batch();

    for (const uid of Object.values(TEST_UIDS)) {
      batch.set(db.collection("users").doc(uid), userFixture(uid));
    }

    batch.set(
      db.collection("posts").doc(TEST_IDS.alicePost),
      postFixture(TEST_IDS.alicePost, TEST_UIDS.alice)
    );
    batch.set(
      db.collection("posts").doc(TEST_IDS.bobPost),
      postFixture(TEST_IDS.bobPost, TEST_UIDS.bob)
    );
    batch.set(
      db
        .collection("posts")
        .doc(TEST_IDS.alicePost)
        .collection("comments")
        .doc(TEST_IDS.existingComment),
      commentFixture(TEST_UIDS.alice)
    );

    await batch.commit();
  });
}
