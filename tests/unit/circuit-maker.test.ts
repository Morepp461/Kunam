import { describe, expect, it } from "vitest";
import { buildCircuitMakerDefinition, circuitLayoutFromGeoJsonDraft } from "../../src/lib/race-engine/circuit-maker";
import { importCircuitGeoJsonDraft } from "../../src/lib/race-engine/circuit-import";
import { validateCircuitReleaseReadiness } from "../../src/lib/race-engine/circuit-geometry";

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

  it("stores measured banking, gradient, and a validated track-limit polygon", () => {
    const result = buildCircuitMakerDefinition({
      id: "fictional-track-boundary",
      revision: "rev-2",
      name: "Boundary Ring",
      countryCode: "ID",
      totalLaps: 5,
      targetLapTimeMs: 92000,
      layout,
      segments: segments.map((segment, index) => ({
        ...segment,
        bankingDegrees: index === 1 ? 8.5 : undefined,
        gradientPercent: index === 2 ? -3.25 : undefined
      })),
      kind: "fictional",
      specifications: {
        direction: "clockwise",
        surface: "asphalt",
        elevationDataStatus: "measured",
        pitLane: { enabled: false, lengthMeters: null, speedLimitKph: null, entryDistanceMeters: null, exitDistanceMeters: null },
        drsZones: [],
        trackLimits: { method: "polygon", sourceNote: "Boundary traced from approved circuit source" }
      },
      trackLimitBoundary: [
        { x: 0.15, y: 0.15 }, { x: 0.85, y: 0.15 },
        { x: 0.85, y: 0.85 }, { x: 0.15, y: 0.85 }
      ]
    });
    expect(result.errors).toEqual([]);
    expect(result.definition?.segments[1].bankingDegrees).toBe(8.5);
    expect(result.definition?.segments[2].gradientPercent).toBe(-3.25);
    expect(result.definition?.trackLimitGeometry?.boundary).toHaveLength(4);
  });

  it("rejects missing or self-intersecting measured track-limit polygons", () => {
    const base = {
      id: "fictional-track-boundary",
      revision: "rev-2",
      name: "Boundary Ring",
      countryCode: "ID",
      totalLaps: 5,
      targetLapTimeMs: 92000,
      layout,
      segments,
      kind: "fictional" as const,
      specifications: {
        direction: "clockwise" as const,
        surface: "asphalt" as const,
        elevationDataStatus: "measured" as const,
        pitLane: { enabled: false, lengthMeters: null, speedLimitKph: null, entryDistanceMeters: null, exitDistanceMeters: null },
        drsZones: [],
        trackLimits: { method: "polygon" as const, sourceNote: "Measured boundary" }
      }
    };
    const missing = buildCircuitMakerDefinition(base);
    expect(missing.definition).toBeNull();
    expect(missing.errors).toContain("Polygon track limits require a measured boundary polygon");

    const crossing = buildCircuitMakerDefinition({
      ...base,
      trackLimitBoundary: [
        { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.2 }
      ]
    });
    expect(crossing.definition).toBeNull();
    expect(crossing.errors.some((error) => error.includes("self-intersect"))).toBe(true);
  });

  it("loads imported GeoJSON into Circuit Maker without fabricating missing elevation and preserves provenance", async () => {
    const raw = JSON.stringify({
      type: "LineString",
      coordinates: [
        [103.8, 1.3], [103.801, 1.3], [103.801, 1.301],
        [103.8, 1.301], [103.8, 1.3]
      ]
    });
    const draft = await importCircuitGeoJsonDraft(raw, {
      provider: "Open circuit dataset",
      sourceUrl: "https://data.example.org/circuit.geojson",
      licenseId: "ODbL-1.0",
      attribution: "Circuit data contributors",
      retrievedAt: "2026-11-20T12:00:00.000Z",
      sourceRevision: "dataset-rev-4"
    });
    const importedLayout = circuitLayoutFromGeoJsonDraft(draft);
    expect(importedLayout).toHaveLength(5);
    expect(importedLayout[0]).not.toHaveProperty("elevationMeters");

    const result = buildCircuitMakerDefinition({
      id: "geojson-imported",
      revision: "rev-1",
      name: "Imported Ring",
      countryCode: "ID",
      totalLaps: 5,
      targetLapTimeMs: 92000,
      layout: importedLayout,
      segments,
      kind: "real",
      sourceProvenance: draft.sourceProvenance
    });
    expect(result.errors).toEqual([]);
    expect(result.definition?.sourceProvenance).toEqual(draft.sourceProvenance);
    expect(result.definition?.layout[0]).not.toHaveProperty("elevationMeters");
  });
});
