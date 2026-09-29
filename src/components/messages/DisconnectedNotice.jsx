import { AlertCircle } from "lucide-react";

/**
 * Notice displayed in the message thread when the two participants
 * are no longer in an accepted connection state.
 */
export default function DisconnectedNotice() {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-900 shadow-xs"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <div>
        <p className="font-semibold text-amber-950">Connection Inactive</p>
        <p className="mt-0.5 text-amber-800">
          You are no longer connected with this student. Past messages are
          preserved, but new messages cannot be sent.
        </p>
      </div>
    </div>
  );
}
