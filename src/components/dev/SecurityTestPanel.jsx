import { useState } from "react";
import { runMilestone8SecurityTests } from "../../utils/securityTestRunner";
import Card from "../ui/Card";

export default function SecurityTestPanel({ currentUid, notifications = [] }) {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // Pick an existing notification ID if available for the field update test
  const existingNotificationId = notifications.length > 0 ? notifications[0].id : null;

  async function handleRunTests() {
    if (isRunning || !currentUid) return;
    setIsRunning(true);
    try {
      const testResults = await runMilestone8SecurityTests(currentUid, existingNotificationId);
      setResults(testResults);
      setIsOpen(true);
    } catch (err) {
      console.error("Failed to run security tests:", err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="my-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              DEV ONLY
            </span>
            <h3 className="text-sm font-bold text-amber-950">
              Milestone 8 Security Rules Test Suite
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-amber-800">
            Executes 4 unauthorized operations (fake profile, cross-user read, field mutation, orphan write) to verify Firestore rejection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {results && (
            <button
              onClick={() => setIsOpen((prev) => !prev)}
              className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
            >
              {isOpen ? "Hide Results" : "Show Results"}
            </button>
          )}
          <button
            id="btn-run-security-tests"
            onClick={handleRunTests}
            disabled={isRunning}
            className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
          >
            {isRunning ? "Running Audit…" : "Run Security Audit"}
          </button>
        </div>
      </div>

      {isOpen && results && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3">
            {results.map((r) => (
              <Card
                key={r.id}
                className={`p-3 text-xs transition ${
                  r.passed
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                    : "border-red-200 bg-red-50 text-red-950"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold">
                        #{r.id}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {r.title}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{r.description}</p>
                    <p className="mt-1.5 font-mono text-[11px]">
                      Result: <span className="font-semibold">{r.message}</span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                      r.passed
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {r.passed ? "BLOCKED (PASS)" : "ALLOWED (FAIL)"}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Passed:{" "}
              <strong className="text-emerald-700">
                {results.filter((r) => r.passed).length} / {results.length}
              </strong>
            </span>
            <span>Console table also available in browser DevTools.</span>
          </div>
        </div>
      )}
    </div>
  );
}
