import { describe, expect, it } from "vitest";
import { buildCircuitMakerDefinition } from "../../src/lib/race-engine/circuit-maker";
import { validateCircuitReleaseReadiness } from "../../src/lib/race-engine/circuit-geometry";

const layout = [
  { id: "p1", x: 0.1, y: 0.1, elevationMeters: 0 },
  { id: "p2", x: 0.8, y: 0.1, elevationMeters: 0 },
  { id: "p3", x: 0.8, y: 0.8, elevationMeters: 0 },
  { id: "p4", x: 0.1, y: 0.8, elevationMeters: 0 },
  { id: "p5", x: 0.1, y: 0.1, elevationMeters: 0 }
];
const segments = [1, 2, 3].map((sector) => ({
  id: "segment-" + sector,
  sectorNumber: sector as 1 | 2 | 3,
  distanceMeters: 1000,
  cornerType: "straight" as const,
  cornerRadiusMeters: null,
  trackWidthMeters: 12,
  gripFactor: 1,
  lowSpeedDemand: 0.2,
  highSpeedDemand: 0.2,
  tractionDemand: 0.2,
  brakingDemand: 0.2,
  drsAvailable: sector === 1,
  ersAvailable: true,
  overtakingOpportunity: false,
  defendingOpportunity: false,
  elevationChangeMeters: 0
}));

describe("Circuit Maker advanced specifications", () => {
  it("validates and persists pit-lane and DRS measurements", () => {
    const result = buildCircuitMakerDefinition({
      id: "fictional-test",
      revision: "rev-1",
      name: "Test Ring",
      countryCode: "ID",
      totalLaps: 5,
      targetLapTimeMs: 92000,
      layout,
      segments,
      kind: "fictional",
      specifications: {
        direction: "clockwise",
        surface: "asphalt",
        elevationDataStatus: "unavailable",
        pitLane: {
          enabled: true,
          lengthMeters: 450,
          speedLimitKph: 80,
          entryDistanceMeters: 0,
          exitDistanceMeters: 700
        },
        drsZones: [{ id: "drs-1", startDistanceMeters: 800, endDistanceMeters: 1400, detectionDistanceMeters: 750 }],
        trackLimits: { method: "segment_width", sourceNote: "Measured test fixture" }
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.definition?.specifications?.pitLane.speedLimitKph).toBe(80);
    expect(result.definition?.specifications?.drsZones).toHaveLength(1);
    expect(result.definition?.segments[0].drsAvailable).toBe(true);
    expect(result.definition?.segments[1].drsAvailable).toBe(true);
    expect(result.definition?.segments[2].drsAvailable).toBe(false);
  });

  it("keeps real circuits blocked until provenance and fidelity review are complete", () => {
    const result = buildCircuitMakerDefinition({
      id: "real-test",
      revision: "draft-1",
      name: "Real Test Circuit",
      countryCode: "ID",
      totalLaps: 5,
      targetLapTimeMs: 92000,
      layout,
      segments,
      kind: "real"
    });
    expect(result.definition).not.toBeNull();
    expect(validateCircuitReleaseReadiness(result.definition!).ready).toBe(false);
  });
});
