import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import {
  APEX_CAMPUS_ID,
  ST_JUDE_CAMPUS_ID,
  COMMUNITY_MEMBER_ROLES,
  COMMUNITY_MEMBER_STATUSES,
} from "../../src/constants.js";
import { CAMPUS_LIST } from "../../src/data/campuses.js";
import { COMMUNITY_LIST } from "../../src/data/communities.js";

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

export function campusFixture(campusId = APEX_CAMPUS_ID, overrides = {}) {
  const isApex = campusId === APEX_CAMPUS_ID;
  return {
    id: campusId,
    name: isApex ? "Apex Institute of Technology" : "St. Jude University",
    shortName: isApex ? "Apex Tech" : "St. Jude",
    slug: campusId,
    domain: isApex ? "campusconnect.edu" : "stjude.edu",
    location: {
      city: isApex ? "Bengaluru" : "Mumbai",
      state: isApex ? "Karnataka" : "Maharashtra",
      country: "India",
    },
    status: "active",
    branding: {
      logoURL: null,
      primaryColor: isApex ? "#c2410c" : "#0284c7",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function userFixture(uid, overrides = {}) {
  return {
    uid,
    email: `${uid}@example.test`,
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
    authorName: authorId === TEST_UIDS.alice ? "Alice Test" : authorId === TEST_UIDS.bob ? "Bob Test" : "Carol Test",
    authorAvatar: null,
    content: "A deterministic rules-test post.",
    likesCount: 0,
    commentsCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function commentFixture(authorId, overrides = {}) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
  };

  return {
    authorId,
    authorName: names[authorId] || "Test Student",
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
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
  };

  return {
    id,
    recipientId,
    actorId,
    actorName: names[actorId] || "Test Student",
    actorAvatar: null,
    type,
    referenceId: connectionId,
    isRead: false,
    createdAt: timestamp,
    ...overrides,
  };
}

export function conversationFixture(uidA, uidB, overrides = {}) {
  const participants = [uidA, uidB].sort();
  const id = participants.join("_");
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
  };

  const senderId = overrides.senderId || uidA;
  const recipientId = participants[0] === senderId ? participants[1] : participants[0];
  const lastMessageId = overrides.lastMessageId || "msg-test-1";

  return {
    id,
    participants,
    participantProfiles: {
      [participants[0]]: {
        displayName: names[participants[0]] || "Test Student",
        photoURL: null,
      },
      [participants[1]]: {
        displayName: names[participants[1]] || "Test Student",
        photoURL: null,
      },
    },
    lastMessage: {
      id: lastMessageId,
      content: "Hello from test conversation!",
      senderId,
      createdAt: timestamp,
    },
    unreadCount: {
      [senderId]: 0,
      [recipientId]: 1,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function messageFixture(conversationId, senderId, overrides = {}) {
  const id = overrides.id || "msg-test-1";
  return {
    id,
    conversationId,
    senderId,
    content: "Deterministic message fixture content.",
    createdAt: timestamp,
    ...overrides,
  };
}

export function publicProfileFixture(uid, overrides = {}) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
  };

  return {
    uid,
    displayName: names[uid] || "Test Student",
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
    ...overrides,
  };
}

export function directoryIndexFixture(uid, overrides = {}) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
  };

  return {
    uid,
    displayName: names[uid] || "Test Student",
    photoURL: null,
    department: "Computer Science",
    year: "Senior",
    skills: ["Testing"],
    updatedAt: timestamp,
    ...overrides,
  };
}

export function communityFixture(communityId = "apex-ai-club", overrides = {}) {
  const isApex = communityId.startsWith("apex") || communityId === "apex-ai-club";
  return {
    id: communityId,
    campusId: isApex ? APEX_CAMPUS_ID : ST_JUDE_CAMPUS_ID,
    name: isApex ? "Apex AI & Robotics Society" : "St. Jude Medical Society",
    slug: isApex ? "ai-robotics-society" : "medical-society",
    description: "A deterministic community fixture.",
    category: isApex ? "tech" : "academic",
    imageURL: null,
    bannerURL: null,
    createdBy: "system",
    stats: {
      memberCount: 0,
      postCount: 0,
    },
    status: "active",
    visibility: "campus_public",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function communityMemberFixture(
  communityId = "apex-ai-club",
  userId = TEST_UIDS.alice,
  overrides = {}
) {
  const isApex = communityId.startsWith("apex") || communityId === "apex-ai-club";
  const campusId = overrides.campusId || (isApex ? APEX_CAMPUS_ID : ST_JUDE_CAMPUS_ID);
  const id = overrides.id || `${communityId}_${userId}`;
  return {
    id,
    communityId,
    userId,
    campusId,
    role: overrides.role || COMMUNITY_MEMBER_ROLES.MEMBER,
    status: overrides.status || COMMUNITY_MEMBER_STATUSES.ACTIVE,
    joinedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function eventFixture(
  id = "event-test-1",
  creatorId = TEST_UIDS.alice,
  communityId = "apex-ai-club",
  overrides = {}
) {
  const isApex = overrides.campusId
    ? overrides.campusId === APEX_CAMPUS_ID
    : communityId.startsWith("apex") || communityId === "apex-ai-club";
  const campusId = overrides.campusId || (isApex ? APEX_CAMPUS_ID : ST_JUDE_CAMPUS_ID);
  const laterTimestamp = firebase.firestore.Timestamp.fromMillis(1_700_003_600_000);
  return {
    id,
    campusId,
    communityId,
    title: "Test Event Title",
    slug: "test-event-slug",
    description: "A deterministic test event description.",
    category: "tech",
    location: "Main Auditorium Hall A",
    startAt: timestamp,
    endAt: laterTimestamp,
    imageURL: null,
    createdBy: creatorId,
    organizerName: "Test Organizer",
    status: "published",
    visibility: "campus_public",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function eventRsvpFixture(
  eventId = "event-test-1",
  userId = TEST_UIDS.alice,
  campusId = APEX_CAMPUS_ID,
  overrides = {}
) {
  const id = overrides.id || `${eventId}_${userId}`;
  return {
    id,
    eventId,
    campusId,
    userId,
    createdAt: timestamp,
    ...overrides,
  };
}

export function eventNotificationDeliveryFixture(
  eventId = "event-test-1",
  actorId = TEST_UIDS.alice,
  campusId = APEX_CAMPUS_ID,
  communityId = "apex-ai-club",
  overrides = {}
) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
    david: "David Test",
  };
  return {
    id: eventId,
    eventId,
    cycleId: overrides.cycleId || "cycle_test_1234567890",
    campusId,
    communityId,
    actorId,
    actorName: names[actorId] || "Test Student",
    actorAvatar: null,
    status: overrides.status || "pending",
    checkpointVersion: overrides.checkpointVersion !== undefined ? overrides.checkpointVersion : 0,
    lastProcessedRsvpId: overrides.lastProcessedRsvpId !== undefined ? overrides.lastProcessedRsvpId : null,
    processedCount: overrides.processedCount !== undefined ? overrides.processedCount : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

export function eventRsvpNotificationFixture(recipientId, actorId, eventId, overrides = {}) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
    david: "David Test",
  };
  return {
    id: overrides.id || `rsvp_${eventId}_${actorId}`,
    recipientId,
    actorId,
    actorName: names[actorId] || "Test Student",
    actorAvatar: null,
    type: "event_rsvp",
    referenceId: eventId,
    isRead: false,
    createdAt: timestamp,
    ...overrides,
  };
}

export function eventCancelledNotificationFixture(recipientId, actorId, eventId, cycleId, overrides = {}) {
  const names = {
    alice: "Alice Test",
    bob: "Bob Test",
    carol: "Carol Test",
    david: "David Test",
  };
  return {
    id: overrides.id || `cancel_${eventId}_${cycleId}`,
    recipientId,
    actorId,
    actorName: names[actorId] || "Test Student",
    actorAvatar: null,
    type: "event_cancelled",
    referenceId: eventId,
    cycleId,
    isRead: false,
    createdAt: timestamp,
    ...overrides,
  };
}


export async function seedBaseData(testEnvironment) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = db.batch();

    for (const campus of CAMPUS_LIST) {
      batch.set(db.collection("campuses").doc(campus.id), {
        ...campus,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    for (const community of COMMUNITY_LIST) {
      batch.set(db.collection("communities").doc(community.id), {
        ...community,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    for (const uid of Object.values(TEST_UIDS)) {
      batch.set(db.collection("users").doc(uid), userFixture(uid));
      batch.set(db.collection("publicProfiles").doc(uid), publicProfileFixture(uid));
      batch.set(db.collection("directoryIndex").doc(uid), directoryIndexFixture(uid));
    }

    batch.set(
      db.collection("posts").doc(TEST_IDS.alicePost),
      postFixture(TEST_IDS.alicePost, TEST_UIDS.alice, { commentsCount: 1 })
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

