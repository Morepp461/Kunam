import { describe, expect, it } from "vitest";
import {
  ATTRIBUTE_SCHEMA_VERSION,
  CAR_TEAM_ATTRIBUTE_DEFINITIONS,
  DRIVER_ATTRIBUTE_DEFINITIONS,
  RACE_ATTRIBUTE_DEFINITIONS,
  validateAttributeValues
} from "../../src/lib/race-engine/attributes";
import {
  createImmutableRaceStartSnapshot,
  RACE_ENGINE_VERSION,
  validateRaceStartSnapshot
} from "../../src/lib/race-engine/contracts";
import type { RaceStartSnapshot } from "../../src/lib/race-engine/contracts";
import { SeededRandom } from "../../src/lib/race-engine/random";

const driverAttributes = Object.fromEntries(
  DRIVER_ATTRIBUTE_DEFINITIONS.map((definition) => [definition.key, 50])
) as Record<string, number>;
const carTeamAttributes = Object.fromEntries(
  CAR_TEAM_ATTRIBUTE_DEFINITIONS.map((definition) => [definition.key, 50])
) as Record<string, number>;

function validSnapshot(): RaceStartSnapshot {
  return {
    schemaVersion: 1,
    engineVersion: RACE_ENGINE_VERSION,
    attributeSchemaVersion: ATTRIBUTE_SCHEMA_VERSION,
    raceId: "race-test-001",
    seed: 123456,
    createdAt: "2026-11-20T00:00:00.000Z",
    circuit: {
      id: "synthetic-test-track",
      revision: "1",
      name: "Synthetic Test Track",
      totalLaps: 5,
      targetLapTimeMs: 90000,
      segments: [{
        id: "sector-1-segment-1",
        sectorNumber: 1,
        distanceMeters: 1000,
        gripFactor: 1,
        lowSpeedDemand: 0.5,
        highSpeedDemand: 0.5,
        tractionDemand: 0.5,
        drsAvailable: false
      }]
    },
    entrants: [{
      driverId: "driver-001",
      teamId: "team-001",
      driverNameSnapshot: "Test Driver",
      teamNameSnapshot: "Test Team",
      driverAttributes: driverAttributes as RaceStartSnapshot["entrants"][number]["driverAttributes"],
      carTeamAttributes: carTeamAttributes as RaceStartSnapshot["entrants"][number]["carTeamAttributes"],
      hqEffects: {}
    }]
  };
}

describe("Race Engine v1 attribute contract", () => {
  it("locks the initial catalog to 8 driver and 16 car/team attributes", () => {
    expect(DRIVER_ATTRIBUTE_DEFINITIONS).toHaveLength(8);
    expect(CAR_TEAM_ATTRIBUTE_DEFINITIONS).toHaveLength(16);
    expect(RACE_ATTRIBUTE_DEFINITIONS).toHaveLength(24);
    expect(new Set(RACE_ATTRIBUTE_DEFINITIONS.map((item) => item.id)).size).toBe(24);
  });

  it("preserves the explicitly confirmed risk direction for Mistake Rate", () => {
    expect(DRIVER_ATTRIBUTE_DEFINITIONS.find((item) => item.key === "mistake_rate")?.direction)
      .toBe("higher_is_riskier");
  });

  it("rejects missing, out-of-range, non-finite, and unknown attribute values", () => {
    expect(validateAttributeValues("driver", driverAttributes).valid).toBe(true);
    expect(validateAttributeValues("driver", { ...driverAttributes, race_pace: 101 }).valid).toBe(false);
    expect(validateAttributeValues("driver", { ...driverAttributes, race_pace: Number.NaN }).valid).toBe(false);
    const { race_pace: _ignored, ...missing } = driverAttributes;
    expect(validateAttributeValues("driver", missing).valid).toBe(false);
    expect(validateAttributeValues("driver", { ...driverAttributes, future_stat: 60 }).valid).toBe(false);
  });
});

describe("SeededRandom", () => {
  it("reproduces the same stream from the same seed", () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);
    expect(Array.from({ length: 20 }, () => first.nextUint32()))
      .toEqual(Array.from({ length: 20 }, () => second.nextUint32()));
  });

  it("restores the exact stream from a serialized state", () => {
    const original = new SeededRandom(98765);
    original.nextUint32();
    original.nextUint32();
    const restored = SeededRandom.restore(original.snapshot());
    expect(Array.from({ length: 10 }, () => original.nextUint32()))
      .toEqual(Array.from({ length: 10 }, () => restored.nextUint32()));
  });

  it("rejects invalid seeds and integer ranges", () => {
    expect(() => new SeededRandom(-1)).toThrow(RangeError);
    expect(() => new SeededRandom(1.5)).toThrow(RangeError);
    expect(() => new SeededRandom(0x1_0000_0000)).toThrow(RangeError);
    expect(() => new SeededRandom(1).nextInt(0)).toThrow(RangeError);
  });
});

describe("Race start snapshot validation", () => {
  it("accepts a versioned, complete race-start snapshot", () => {
    expect(validateRaceStartSnapshot(validSnapshot()).valid).toBe(true);
  });

  it("creates a deep-frozen snapshot without retaining mutable input references", () => {
    const input = validSnapshot();
    const frozen = createImmutableRaceStartSnapshot(input);
    expect(frozen).not.toBe(input);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.circuit)).toBe(true);
    expect(Object.isFrozen(frozen.circuit.segments)).toBe(true);
    expect(Object.isFrozen(frozen.entrants[0].driverAttributes)).toBe(true);
  });

  it("rejects duplicate drivers and unsupported schema versions", () => {
    const snapshot = validSnapshot();
    const invalid = {
      ...snapshot,
      schemaVersion: 99,
      entrants: [...snapshot.entrants, snapshot.entrants[0]]
    } as unknown as RaceStartSnapshot;
    const result = validateRaceStartSnapshot(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("schema version"))).toBe(true);
    expect(result.errors.some((error) => error.includes("unique"))).toBe(true);
  });

  it("rejects malformed circuit segments", () => {
    const snapshot = validSnapshot();
    const invalid = {
      ...snapshot,
      circuit: {
        ...snapshot.circuit,
        segments: [{ ...snapshot.circuit.segments[0], distanceMeters: 0 }]
      }
    };
    expect(validateRaceStartSnapshot(invalid).valid).toBe(false);
  });
});
