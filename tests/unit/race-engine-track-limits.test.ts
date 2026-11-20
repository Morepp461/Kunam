import { describe, expect, it } from "vitest";
import {
  evaluateTrackLimitObservation,
  validateTrackLimitGeometry
} from "../../src/lib/race-engine/track-limits";
import type { TrackLimitGeometry } from "../../src/lib/race-engine/track-limits";

function geometry(): TrackLimitGeometry {
  return {
    schemaVersion: 1,
    circuitId: "circuit-1",
    circuitRevision: "rev-4",
    coordinateSystem: "normalized_0_1",
    boundary: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 }
    ]
  };
}

function input(position: { x: number; y: number }) {
  return {
    raceId: "race-1",
    driverId: "driver-3",
    recordedAt: "2026-11-20T14:30:00.000Z",
    simulationTimeMs: 90000,
    lapNumber: 4,
    sectorNumber: 2 as const,
    segmentId: "segment-8",
    position
  };
}

describe("Geometry-based track-limit observations", () => {
  it("validates a versioned normalized boundary polygon", () => {
    expect(validateTrackLimitGeometry(geometry()).valid).toBe(true);
  });

  it("does not emit an observation for an inside or boundary position", () => {
    expect(evaluateTrackLimitObservation(geometry(), input({ x: 0.5, y: 0.5 }))).toBeNull();
    expect(evaluateTrackLimitObservation(geometry(), input({ x: 0.2, y: 0.5 }))).toBeNull();
  });

  it("emits deterministic auditable evidence for an outside position", () => {
    const first = evaluateTrackLimitObservation(geometry(), input({ x: 0.9, y: 0.5 }));
    const second = evaluateTrackLimitObservation(geometry(), input({ x: 0.9, y: 0.5 }));
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      type: "track_limit_observation",
      raceId: "race-1",
      driverId: "driver-3",
      lapNumber: 4,
      sectorNumber: 2,
      segmentId: "segment-8",
      circuitId: "circuit-1",
      circuitRevision: "rev-4",
      evidence: { classification: "outside_boundary" }
    });
  });

  it("rejects malformed and self-intersecting boundaries", () => {
    const malformed = { ...geometry(), boundary: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }] };
    expect(validateTrackLimitGeometry(malformed).valid).toBe(false);
    const crossing = {
      ...geometry(),
      boundary: [
        { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.2 }
      ]
    };
    expect(validateTrackLimitGeometry(crossing).errors).toContain("Track-limit boundary must not self-intersect");
  });

  it("does not adjudicate a penalty or mutate the supplied geometry", () => {
    const source = geometry();
    const event = evaluateTrackLimitObservation(source, input({ x: 0.9, y: 0.5 }));
    expect(event).not.toHaveProperty("penalty");
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event?.evidence)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
  });
});
