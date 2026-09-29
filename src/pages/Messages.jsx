import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useConversations } from "../hooks/useConversations";
import Navbar from "../components/layout/Navbar";
import ConversationList from "../components/messages/ConversationList";
import MessageThread from "../components/messages/MessageThread";
import EmptyState from "../components/ui/EmptyState";

export default function Messages() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUid = user?.uid;

  const { conversations, isLoading, error } = useConversations();

  useEffect(() => {
    document.title = "Messages | CampusConnect";
  }, []);

  const activeConversation =
    conversations.find((c) => c.id === conversationId) || null;

  return (
    <div className="flex h-screen flex-col bg-paper text-ink overflow-hidden">
      <Navbar />

      <main
        id="main-content"
        className="flex-1 mx-auto w-full max-w-6xl p-2 sm:p-4 lg:p-6 overflow-hidden min-h-0"
      >
        <h1 className="sr-only">Messages</h1>

        <div className="flex h-full w-full overflow-hidden rounded-2xl border border-border-warm bg-surface shadow-xs">
          {/* Left Pane: Conversation List */}
          {/* Visible on desktop (lg+), or on mobile when no conversation is selected */}
          <div
            className={`w-full lg:w-84 xl:w-96 shrink-0 flex flex-col h-full border-r border-border-warm bg-surface ${
              conversationId ? "hidden lg:flex" : "flex"
            }`}
          >
            <ConversationList
              conversations={conversations}
              currentUid={currentUid}
              activeConversationId={conversationId}
              isLoading={isLoading}
              error={error}
            />
          </div>

          {/* Right Pane: Active Thread or Placeholder */}
          {/* Visible on desktop (lg+), or on mobile when a conversation is selected */}
          <div
            className={`flex-1 flex flex-col h-full min-w-0 bg-surface ${
              conversationId ? "flex" : "hidden lg:flex"
            }`}
          >
            {conversationId ? (
              <MessageThread
                conversationId={conversationId}
                currentUid={currentUid}
                conversation={activeConversation}
                onBack={() => navigate("/messages")}
              />
            ) : (
              <div className="hidden lg:flex flex-1 items-center justify-center p-8 text-center bg-paper/30">
                <EmptyState
                  compact
                  icon={MessageSquare}
                  title="Your Messages"
                  description="Select a conversation from the left to read and send messages."
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
