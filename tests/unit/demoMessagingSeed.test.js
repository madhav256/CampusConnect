import { describe, expect, it } from "vitest";

describe("Milestone 16 — Demo Messaging Seed Data Invariants", () => {
  const conversationId = "student-a_student-b";
  const participants = ["student-a", "student-b"];

  const seededConversation = {
    id: conversationId,
    participants,
    participantProfiles: {
      "student-a": {
        displayName: "Alice Chen",
        photoURL: null,
      },
      "student-b": {
        displayName: "Bob Smith",
        photoURL: null,
      },
    },
    lastMessage: {
      id: "msg-demo-3",
      content: "Let me know if you want to collaborate on the data preprocessing pipeline!",
      senderId: "student-b",
      createdAt: 1790700000000,
    },
    unreadCount: {
      "student-a": 1,
      "student-b": 0,
    },
    createdAt: 1790694600000,
    updatedAt: 1790700000000,
  };

  const seededMessages = [
    {
      id: "msg-demo-1",
      conversationId,
      senderId: "student-a",
      content: "Hi Bob, welcome to CampusConnect! Have you started the ML project yet?",
      createdAt: 1790694600000,
    },
    {
      id: "msg-demo-2",
      conversationId,
      senderId: "student-b",
      content: "Hey Alice! Yes, just setting up the PyTorch environment now.",
      createdAt: 1790698200000,
    },
    {
      id: "msg-demo-3",
      conversationId,
      senderId: "student-b",
      content: "Let me know if you want to collaborate on the data preprocessing pipeline!",
      createdAt: 1790700000000,
    },
  ];

  it("conversation document uses the canonical sorted-pair ID", () => {
    const [p0, p1] = participants;
    const canonicalId = p0 < p1 ? `${p0}_${p1}` : `${p1}_${p0}`;
    expect(seededConversation.id).toBe(canonicalId);
    expect(seededConversation.id).toBe("student-a_student-b");
  });

  it("participants array contains exactly two sorted lexicographical UIDs", () => {
    expect(seededConversation.participants).toHaveLength(2);
    expect(seededConversation.participants[0]).toBe("student-a");
    expect(seededConversation.participants[1]).toBe("student-b");
    expect(seededConversation.participants[0] < seededConversation.participants[1]).toBe(true);
  });

  it("participantProfiles contains matching snapshots for both participants", () => {
    expect(Object.keys(seededConversation.participantProfiles).sort()).toEqual([
      "student-a",
      "student-b",
    ]);
    expect(seededConversation.participantProfiles["student-a"].displayName).toBe("Alice Chen");
    expect(seededConversation.participantProfiles["student-b"].displayName).toBe("Bob Smith");
  });

  it("lastMessage has exactly the four required keys", () => {
    expect(Object.keys(seededConversation.lastMessage).sort()).toEqual([
      "content",
      "createdAt",
      "id",
      "senderId",
    ]);
  });

  it("lastMessage.id points to an existing message document whose content and senderId match exactly", () => {
    const targetMsg = seededMessages.find((m) => m.id === seededConversation.lastMessage.id);
    expect(targetMsg).toBeDefined();
    expect(targetMsg.content).toBe(seededConversation.lastMessage.content);
    expect(targetMsg.senderId).toBe(seededConversation.lastMessage.senderId);
    expect(targetMsg.createdAt).toBe(seededConversation.lastMessage.createdAt);
  });

  it("unread counts are plausible and match the seeded sender", () => {
    // Bob sent the last message, so Bob has 0 unread; Alice has 1 unread
    expect(seededConversation.unreadCount["student-a"]).toBe(1);
    expect(seededConversation.unreadCount["student-b"]).toBe(0);
  });

  it("all message documents satisfy the immutable message schema", () => {
    for (const msg of seededMessages) {
      expect(Object.keys(msg).sort()).toEqual([
        "content",
        "conversationId",
        "createdAt",
        "id",
        "senderId",
      ]);
      expect(msg.conversationId).toBe(conversationId);
      expect(participants).toContain(msg.senderId);
      expect(typeof msg.content).toBe("string");
      expect(msg.content.length).toBeGreaterThan(0);
      expect(msg.content.length).toBeLessThanOrEqual(1000);
    }
  });

  it("messages are in strictly ascending chronological order", () => {
    for (let i = 0; i < seededMessages.length - 1; i++) {
      expect(seededMessages[i].createdAt).toBeLessThan(seededMessages[i + 1].createdAt);
    }
  });
});
