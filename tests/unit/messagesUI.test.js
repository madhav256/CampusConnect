import { describe, expect, it, vi } from "vitest";
import DisconnectedNotice from "../../src/components/messages/DisconnectedNotice";
import MessageBubble from "../../src/components/messages/MessageBubble";
import MessageComposer from "../../src/components/messages/MessageComposer";
import ConversationItem from "../../src/components/messages/ConversationItem";
import ConversationList from "../../src/components/messages/ConversationList";

import { renderHook } from "./hookTestUtils";

describe("Milestone 16 — Unit 16.5: Messages UI Components", () => {
  describe("DisconnectedNotice", () => {
    it("renders the exact documented archive message", () => {
      const notice = DisconnectedNotice();
      expect(notice.props.role).toBe("alert");

      const textContainer = notice.props.children[1];
      const heading = textContainer.props.children[0];
      const paragraph = textContainer.props.children[1];

      expect(heading.props.children).toBe("Connection Inactive");
      expect(paragraph.props.children).toContain(
        "You are no longer connected with this student. Past messages are preserved, but new messages cannot be sent."
      );
    });
  });

  describe("MessageBubble", () => {
    const sampleMsg = {
      id: "msg-1",
      senderId: "userA",
      content: "Hello from campus!",
      createdAt: new Date(2026, 8, 29, 14, 30),
    };

    it("renders own message with terracotta right-aligned bubble", () => {
      const bubble = MessageBubble({ message: sampleMsg, isOwn: true });
      expect(bubble.props.className).toContain("justify-end");

      const innerBubble = bubble.props.children;
      expect(innerBubble.props.className).toContain("bg-terracotta-600");
      expect(innerBubble.props.className).toContain("text-white");

      const paragraph = innerBubble.props.children[0];
      expect(paragraph.props.children).toBe("Hello from campus!");
    });

    it("renders peer message with stone/surface left-aligned bubble", () => {
      const bubble = MessageBubble({ message: sampleMsg, isOwn: false });
      expect(bubble.props.className).toContain("justify-start");

      const innerBubble = bubble.props.children;
      expect(innerBubble.props.className).toContain("bg-surface");
      expect(innerBubble.props.className).toContain("text-ink");
    });
  });

  describe("ConversationItem", () => {
    const sampleConv = {
      id: "userA_userB",
      participants: ["userA", "userB"],
      participantProfiles: {
        userB: {
          displayName: "Bob Martinez",
          photoURL: "https://example.com/bob.jpg",
        },
      },
      lastMessage: {
        id: "msg-10",
        senderId: "userB",
        content: "Are you attending the career fair?",
        createdAt: new Date(),
      },
      unreadCount: {
        userA: 3,
        userB: 0,
      },
      updatedAt: new Date(),
    };

    it("renders participant info, last message, and unread count badge", () => {
      const item = ConversationItem({
        conversation: sampleConv,
        currentUid: "userA",
        isActive: false,
      });

      expect(item.props.to).toBe("/messages/userA_userB");

      const contentCol = item.props.children[1];
      const nameRow = contentCol.props.children[0];
      const snippetRow = contentCol.props.children[1];

      // Display name
      expect(nameRow.props.children[0].props.children).toBe("Bob Martinez");

      // Snippet & badge
      expect(snippetRow.props.children[0].props.children).toBe(
        "Are you attending the career fair?"
      );

      const badge = snippetRow.props.children[1];
      expect(badge.props.children).toBe(3);
    });

    it("prepends 'You: ' when the current user is the last sender", () => {
      const ownLastConv = {
        ...sampleConv,
        lastMessage: {
          id: "msg-11",
          senderId: "userA",
          content: "Yes, see you there!",
          createdAt: new Date(),
        },
        unreadCount: { userA: 0 },
      };

      const item = ConversationItem({
        conversation: ownLastConv,
        currentUid: "userA",
        isActive: true,
      });

      expect(item.props.className).toContain("border-l-terracotta-600");
      const contentCol = item.props.children[1];
      const snippetRow = contentCol.props.children[1];
      expect(snippetRow.props.children[0].props.children).toBe(
        "You: Yes, see you there!"
      );
      // No badge when unread is 0
      expect(snippetRow.props.children[1]).toBeFalsy();
    });
  });

  describe("ConversationList", () => {
    it("renders loading skeletons when isLoading is true", () => {
      const list = ConversationList({
        conversations: [],
        currentUid: "userA",
        isLoading: true,
      });

      const children = list.props.children;
      // Header is children[0], loading skeleton is children[2]
      const skeletonContainer = children[2];
      expect(skeletonContainer).toBeTruthy();
      expect(skeletonContainer.props.children).toHaveLength(4);
    });

    it("renders EmptyState when conversation list is empty and not loading", () => {
      const list = ConversationList({
        conversations: [],
        currentUid: "userA",
        isLoading: false,
      });

      const children = list.props.children;
      // Empty container is children[3]
      const emptyContainer = children[3];
      expect(emptyContainer).toBeTruthy();
      const emptyStateComp = emptyContainer.props.children;
      expect(emptyStateComp.props.title).toBe("No conversations yet");
    });

    it("renders list of ConversationItem components when conversations exist", () => {
      const convs = [
        {
          id: "c1",
          participants: ["userA", "userB"],
          participantProfiles: { userB: { displayName: "User B" } },
          unreadCount: { userA: 0 },
        },
        {
          id: "c2",
          participants: ["userA", "userC"],
          participantProfiles: { userC: { displayName: "User C" } },
          unreadCount: { userA: 1 },
        },
      ];

      const list = ConversationList({
        conversations: convs,
        currentUid: "userA",
        activeConversationId: "c2",
        isLoading: false,
      });

      const children = list.props.children;
      const scrollArea = children[4];
      expect(scrollArea).toBeTruthy();
      expect(scrollArea.props.children).toHaveLength(2);
      expect(scrollArea.props.children[0].props.conversation.id).toBe("c1");
      expect(scrollArea.props.children[1].props.conversation.id).toBe("c2");
      expect(scrollArea.props.children[1].props.isActive).toBe(true);
    });
  });

  describe("MessageComposer", () => {
    it("renders textarea and submit button with disabled state when prop is set", () => {
      const onSend = vi.fn();
      const { result } = renderHook(() =>
        MessageComposer({
          onSendMessage: onSend,
          isSending: false,
          disabled: true,
        })
      );
      const composer = result.current;

      const form = composer.props.children[1];
      const inputRow = form.props.children[0];
      const textarea = inputRow.props.children[0];
      const button = inputRow.props.children[1];

      expect(textarea.props.disabled).toBe(true);
      expect(textarea.props.placeholder).toBe(
        "Messaging is disabled for disconnected users."
      );
      expect(button.props.disabled).toBe(true);
    });

    it("displays send error when sendError is provided", () => {
      const { result } = renderHook(() =>
        MessageComposer({
          onSendMessage: vi.fn(),
          isSending: false,
          sendError: "Network connection lost",
        })
      );
      const composer = result.current;

      const errorNotice = composer.props.children[0];
      expect(errorNotice.props.role).toBe("alert");
      expect(errorNotice.props.children).toBe("Network connection lost");
    });
  });
});
