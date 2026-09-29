import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { MAX_MESSAGE_LENGTH } from "../../services/messageService";

/**
 * Message composer textarea with character count enforcement,
 * Enter-to-send keyboard shortcut, and draft preservation on failure.
 *
 * @param {{
 *   onSendMessage: (content: string) => Promise<any>,
 *   isSending: boolean,
 *   sendError?: string|null,
 *   disabled?: boolean,
 *   placeholder?: string,
 * }} props
 */
export default function MessageComposer({
  onSendMessage,
  isSending = false,
  sendError = null,
  disabled = false,
  placeholder = "Type your message...",
}) {
  const [content, setContent] = useState("");
  const [localError, setLocalError] = useState(null);
  const textareaRef = useRef(null);

  // Focus textarea when component becomes active
  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const trimmedLength = content.trim().length;
  const isTooLong = content.length > MAX_MESSAGE_LENGTH;
  const canSend = !disabled && !isSending && trimmedLength > 0 && !isTooLong;

  async function handleSend() {
    if (!canSend) return;

    setLocalError(null);
    try {
      await onSendMessage(content);
      // Clear draft strictly upon successful send
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      // Content is preserved in content state
      setLocalError(err?.message || "Failed to send message.");
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleChange(e) {
    setContent(e.target.value);
    setLocalError(null);

    // Auto-adjust height up to max
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  const activeError = sendError || localError;

  return (
    <div className="border-t border-border-warm bg-surface p-3 sm:p-4">
      {activeError && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 border border-rose-200"
        >
          {activeError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex flex-col gap-2"
      >
        <div className="relative flex items-end gap-2 rounded-2xl border border-border-warm bg-paper/60 px-3 py-2 transition focus-within:border-terracotta-500 focus-within:ring-2 focus-within:ring-terracotta-500/20">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isSending}
            placeholder={
              disabled
                ? "Messaging is disabled for disconnected users."
                : placeholder
            }
            aria-label="Write a message"
            className="max-h-28 min-h-[1.75rem] w-full resize-none bg-transparent text-sm leading-relaxed text-ink placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed disabled:text-stone-400"
          />

          <button
            type="submit"
            disabled={!canSend}
            id="btn-send-message"
            aria-label="Send message"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-terracotta-600 text-white transition hover:bg-terracotta-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:active:scale-100 shadow-xs"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-ink-muted">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span
            className={
              isTooLong ? "font-semibold text-rose-600" : "text-stone-400"
            }
          >
            {content.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
      </form>
    </div>
  );
}
