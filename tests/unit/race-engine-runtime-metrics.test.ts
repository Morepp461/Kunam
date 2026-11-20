import { describe, expect, it } from "vitest";
import { summarizeRaceEngineBatch } from "../../src/lib/race-engine/runtime-metrics";

describe("Managed Race Engine batch metrics", () => {
  it("summarizes progress, contention, retries, suspension, and queue age", () => {
    expect(summarizeRaceEngineBatch([
      { status: "running" },
      { status: "completed" },
      { status: "busy" },
      { status: "retry_pending" },
      { status: "suspended_by_red_flag" }
    ], 8, [
      "2026-11-20T09:00:00.000Z",
      "2026-11-20T09:04:00.000Z"
    ], "2026-11-20T09:05:00.000Z")).toEqual({
      batchSize: 5,
      activeQueueDepth: 8,
      progressedCount: 2,
      busyCount: 1,
      retryPendingCount: 1,
      suspendedCount: 1,
      oldestSelectedSessionAgeMs: 300000
    });
  });

  it("handles an empty queue without inventing queue age", () => {
    expect(summarizeRaceEngineBatch([], 0, [], "2026-11-20T09:05:00.000Z")).toMatchObject({
      batchSize: 0,
      activeQueueDepth: 0,
      progressedCount: 0,
      oldestSelectedSessionAgeMs: null
    });
  });

  it("rejects invalid counts and future or invalid timestamps", () => {
    expect(() => summarizeRaceEngineBatch([], -1, [], "2026-11-20T09:05:00.000Z")).toThrow(/non-negative/i);
    expect(() => summarizeRaceEngineBatch([], 1, ["not-a-date"], "2026-11-20T09:05:00.000Z")).toThrow(/createdAt/i);
    expect(() => summarizeRaceEngineBatch([], 1, ["2026-11-20T09:06:00.000Z"], "2026-11-20T09:05:00.000Z")).toThrow(/future/i);
  });
});
