import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  dispatchContinuationTask,
  setTaskEnqueuer,
  resetTaskEnqueuer,
  getTaskDispatchHistory,
  clearTaskDispatchHistory,
  CONTINUATION_TASK_FUNCTION_NAME,
} from "../../src/server/taskDispatcher.js";

describe("Milestone 24.3: Cloud Task Dispatcher Unit Tests", () => {
  beforeEach(() => {
    resetTaskEnqueuer();
    clearTaskDispatchHistory();
  });

  it("exports correct continuation task function name", () => {
    expect(CONTINUATION_TASK_FUNCTION_NAME).toBe("processWaitlistContinuationTask");
  });

  it("rejects dispatch without valid eventId and does not throw", async () => {
    const res1 = await dispatchContinuationTask(null);
    expect(res1.enqueued).toBe(false);
    expect(res1.error).toBe("invalid_event_id");

    const res2 = await dispatchContinuationTask("");
    expect(res2.enqueued).toBe(false);
    expect(res2.error).toBe("invalid_event_id");

    const res3 = await dispatchContinuationTask(12345);
    expect(res3.enqueued).toBe(false);
    expect(res3.error).toBe("invalid_event_id");
  });

  it("dispatches successfully via custom enqueuer and tracks history", async () => {
    const mockEnqueuer = vi.fn().mockResolvedValue(undefined);
    setTaskEnqueuer(mockEnqueuer);

    const res = await dispatchContinuationTask("evt_101");
    expect(res.enqueued).toBe(true);
    expect(res.eventId).toBe("evt_101");
    expect(mockEnqueuer).toHaveBeenCalledWith({ eventId: "evt_101" }, expect.any(Object));

    const history = getTaskDispatchHistory();
    expect(history.length).toBe(1);
    expect(history[0].eventId).toBe("evt_101");
    expect(history[0].success).toBe(true);
  });

  it("isolates enqueue failures: logs warning, returns enqueued: false, and does NOT throw", async () => {
    const mockEnqueuer = vi.fn().mockRejectedValue(new Error("Cloud Tasks service down"));
    setTaskEnqueuer(mockEnqueuer);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await dispatchContinuationTask("evt_102");
    expect(res.enqueued).toBe(false);
    expect(res.eventId).toBe("evt_102");
    expect(res.error).toBe("Cloud Tasks service down");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cloud Task enqueue failed for event evt_102: Cloud Tasks service down")
    );

    const history = getTaskDispatchHistory();
    expect(history.length).toBe(1);
    expect(history[0].eventId).toBe("evt_102");
    expect(history[0].success).toBe(false);
    expect(history[0].error).toBe("Cloud Tasks service down");

    warnSpy.mockRestore();
  });
});
