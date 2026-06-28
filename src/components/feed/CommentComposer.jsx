import { useState, useRef } from "react";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import { useAuth } from "../../hooks/useAuth";

export default function CommentComposer({ onComment }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onComment(content);
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (err) {
      setError("Failed to post comment.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setContent(e.target.value);
    if (error) setError(null);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="flex gap-3 pt-4">
      <div className="flex-shrink-0 mt-1">
        <Avatar name={user?.name} photoURL={user?.photoURL} size="sm" />
      </div>
      
      <div className="flex-1 space-y-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            placeholder="Write a comment..."
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            rows={1}
            className="w-full resize-none overflow-hidden rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
        </div>
        
        {error && <p className="text-xs text-red-500">{error}</p>}
        
        {content.trim().length > 0 && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Post
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
