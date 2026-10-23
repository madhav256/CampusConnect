/**
 * Milestone 24 — Unit 24.2: useEventCapacity React Hook Tests
 *
 * Tests for reactive coordinator subscription, memoized derived metrics,
 * manual refresh lifecycle, and cleanup on unmount.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "./hookTestUtils";

const mocks = vi.hoisted(() => ({
  subscribeToEventCapacity: vi.fn(),
  getEventCapacity: vi.fn(),
  getEventCapacityMetrics: vi.fn((event, coord) => ({
    isCapped: Boolean(coord?.capacity),
    capacity: coord?.capacity || null,
    confirmedCount: coord?.confirmedCount || 0,
    offeredCount: coord?.offeredCount || 0,
    waitlistCount: coord?.waitlistCount || 0,
    allocatedSeats: (coord?.confirmedCount || 0) + (coord?.offeredCount || 0),
    availableSeats: coord?.capacity ? coord.capacity - (coord.confirmedCount || 0) : null,
    isFull: coord?.capacity ? (coord.confirmedCount || 0) >= coord.capacity : false,
    canDirectRsvp: (coord?.waitlistCount || 0) === 0,
  })),
}));

vi.mock("../../src/services/eventCapacityService.js", () => ({
  subscribeToEventCapacity: mocks.subscribeToEventCapacity,
  getEventCapacity: mocks.getEventCapacity,
  getEventCapacityMetrics: mocks.getEventCapacityMetrics,
}));

import { useEventCapacity } from "../../src/hooks/useEventCapacity.js";

describe("Milestone 24 — Unit 24.2: useEventCapacity Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles null/empty eventId without subscribing", () => {
    const { result } = renderHook(() => useEventCapacity(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.coordinator).toBeNull();
    expect(mocks.subscribeToEventCapacity).not.toHaveBeenCalled();
  });

  it("subscribes to event capacity and updates state upon emission", () => {
    let emitData;
    const unsubMock = vi.fn();
    mocks.subscribeToEventCapacity.mockImplementation((id, onNext) => {
      emitData = onNext;
      return unsubMock;
    });

    const { result, unmount } = renderHook(() => useEventCapacity("evt-100"));

    expect(mocks.subscribeToEventCapacity).toHaveBeenCalledWith(
      "evt-100",
      expect.any(Function),
      expect.any(Function)
    );

    act(() => {
      emitData({
        eventId: "evt-100",
        capacity: 50,
        confirmedCount: 20,
        offeredCount: 2,
        waitlistCount: 5,
        headSequence: 1,
        nextSequence: 6,
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.coordinator).not.toBeNull();
    expect(result.current.coordinator.capacity).toBe(50);
    expect(result.current.metrics.allocatedSeats).toBe(22);
    expect(result.current.metrics.canDirectRsvp).toBe(false);

    unmount();
    expect(unsubMock).toHaveBeenCalled();
  });

  it("handles subscription error without crashing", () => {
    let emitError;
    mocks.subscribeToEventCapacity.mockImplementation((id, onNext, onError) => {
      emitError = onError;
      return vi.fn();
    });

    const { result } = renderHook(() => useEventCapacity("evt-err"));

    act(() => {
      emitError(new Error("Permission denied"));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error.message).toBe("Permission denied");
  });

  it("performs manual refresh when refresh() is invoked", async () => {
    mocks.subscribeToEventCapacity.mockReturnValue(vi.fn());
    mocks.getEventCapacity.mockResolvedValueOnce({
      eventId: "evt-manual",
      capacity: 30,
      confirmedCount: 15,
    });

    const { result } = renderHook(() => useEventCapacity("evt-manual"));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mocks.getEventCapacity).toHaveBeenCalledWith("evt-manual");
    expect(result.current.coordinator.capacity).toBe(30);
    expect(result.current.coordinator.confirmedCount).toBe(15);
  });
});
