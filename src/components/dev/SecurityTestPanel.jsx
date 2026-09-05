import { useState } from "react";
import {
  runMilestone8SecurityTests,
  runMilestone9SecurityTests,
} from "../../utils/securityTestRunner";
import Card from "../ui/Card";

export default function SecurityTestPanel({
  currentUid,
  notifications = [],
  initialSuite = "milestone9",
}) {
  const [suite, setSuite] = useState(initialSuite);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // Pick an existing notification ID if available for the field update test
  const existingNotificationId = notifications.length > 0 ? notifications[0].id : null;

  async function handleRunTests() {
    if (isRunning || !currentUid) return;
    setIsRunning(true);
    setResults(null);
    try {
      let testResults;
      if (suite === "milestone9") {
        testResults = await runMilestone9SecurityTests(currentUid);
      } else {
        testResults = await runMilestone8SecurityTests(currentUid, existingNotificationId);
      }
      setResults(testResults);
      setIsOpen(true);
    } catch (err) {
      console.error("Failed to run security tests:", err);
    } finally {
      setIsRunning(false);
    }
  }

  const isM9 = suite === "milestone9";

  return (
    <div className="my-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              DEV ONLY
            </span>
            <h3 className="text-sm font-bold text-amber-950">
              {isM9
                ? "Milestone 9 Security Rules Test Suite (Settings & Users)"
                : "Milestone 8 Security Rules Test Suite (Notifications)"}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-amber-800">
            {isM9
              ? "Executes 5 unauthorized user/settings operations (cross-user update, email tamper, UID tamper, createdAt/role injection, invalid types) to verify Firestore rejection."
              : "Executes 4 unauthorized notification operations (fake profile, cross-user read, field mutation, orphan write) to verify Firestore rejection."}
          </p>

          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSuite("milestone9");
                setResults(null);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                isM9
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-100 text-amber-900 hover:bg-amber-200"
              }`}
            >
              Milestone 9: Settings (5 tests)
            </button>
            <button
              type="button"
              onClick={() => {
                setSuite("milestone8");
                setResults(null);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                !isM9
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-100 text-amber-900 hover:bg-amber-200"
              }`}
            >
              Milestone 8: Notifications (4 tests)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 sm:pt-0">
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

          {results.cleanup && results.cleanup.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Disposable Target Cleanup Audit
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    results.cleanup.every((c) => c.success)
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {results.cleanup.every((c) => c.success)
                    ? "CLEANUP VERIFIED"
                    : "CLEANUP WARNING"}
                </span>
              </div>
              <ul className="mt-2 space-y-1 font-mono text-[11px]">
                {results.cleanup.map((c, idx) => (
                  <li
                    key={idx}
                    className={
                      c.success ? "text-slate-600" : "font-bold text-amber-700"
                    }
                  >
                    {c.success ? "✓" : "⚠️"} {c.resource} ({c.target}):{" "}
                    {c.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
