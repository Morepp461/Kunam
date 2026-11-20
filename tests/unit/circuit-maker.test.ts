import { describe, expect, it } from "vitest";
import { buildCircuitMakerDefinition } from "../../src/lib/race-engine/circuit-maker";

const layout = [
  { id: "p1", x: 0.1, y: 0.1, elevationMeters: 0 },
  { id: "p2", x: 0.8, y: 0.1, elevationMeters: 0 },
  { id: "p3", x: 0.8, y: 0.8, elevationMeters: 0 },
  { id: "p4", x: 0.1, y: 0.8, elevationMeters: 0 },
  { id: "p5", x: 0.1, y: 0.1, elevationMeters: 0 }
];
const segments = [1,2,3].map((sector) => ({
  id: `s${sector}`, sectorNumber: sector as 1|2|3, distanceMeters: 1000,
  cornerType: "straight" as const, cornerRadiusMeters: null, trackWidthMeters: 12,
  gripFactor: 1, lowSpeedDemand: 0.2, highSpeedDemand: 0.2, tractionDemand: 0.2,
  brakingDemand: 0.2, drsAvailable: sector === 1, ersAvailable: true,
  overtakingOpportunity: false, defendingOpportunity: false, elevationChangeMeters: 0
}));

describe("Circuit Maker geometry builder", () => {
  it("creates a validated fictional circuit definition from visual and specification inputs", () => {
    const result = buildCircuitMakerDefinition({
      id: "fictional-test", revision: "draft-1", name: "Test Ring", countryCode: "ID",
      totalLaps: 5, targetLapTimeMs: 92000, layout, segments, kind: "fictional"
    });
    expect(result.errors).toEqual([]);
    expect(result.definition?.trackLengthMeters).toBe(3000);
    expect(result.definition?.segments).toHaveLength(3);
  });

  it("rejects missing track measurements instead of inventing values", () => {
    const result = buildCircuitMakerDefinition({
      id: "fictional-test", revision: "draft-1", name: "Test Ring", countryCode: "ID",
      totalLaps: 5, targetLapTimeMs: 92000, layout,
      segments: segments.map((segment) => ({ ...segment, distanceMeters: Number.NaN })),
      kind: "fictional"
    });
    expect(result.definition).toBeNull();
    expect(result.errors.some((error) => error.includes("distanceMeters"))).toBe(true);
  });
});
