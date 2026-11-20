import { describe, expect, it } from "vitest";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import {
  validateCircuitReleaseReadiness
} from "../../src/lib/race-engine/circuit-geometry";

const syntheticCircuit = createSyntheticRaceFixture({ driverCount: 2, teamCount: 1, totalLaps: 1 }).circuit;

const verifiedTrackLimitGeometry = {
  schemaVersion: 1 as const,
  circuitId: syntheticCircuit.id,
  circuitRevision: syntheticCircuit.revision,
  coordinateSystem: "normalized_0_1" as const,
  boundary: [
    { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }
  ]
};

const verifiedTrackLimitSpecifications = {
  direction: "clockwise" as const,
  surface: "asphalt" as const,
  elevationDataStatus: "measured" as const,
  pitLane: { enabled: false, lengthMeters: null, speedLimitKph: null, entryDistanceMeters: null, exitDistanceMeters: null },
  drsZones: [],
  trackLimits: { method: "polygon" as const, sourceNote: "Measured source boundary" }
};

const verifiedSource = {
  provider: "Open data provider",
  sourceUrl: "https://data.example.org/circuit.geojson",
  licenseId: "ODbL-1.0",
  attribution: "© Data contributors",
  retrievedAt: "2026-11-20T12:00:00.000Z",
  sourceRevision: "commit:abc123",
  geometryHash: "a".repeat(64),
  fidelityStatus: "verified" as const,
  reviewedBy: "circuit-reviewer",
  reviewedAt: "2026-11-20T12:30:00.000Z",
  knownLimitations: ["Elevation sampled from a separate source"]
};

describe("Circuit official-release provenance gate", () => {
  it("keeps legacy synthetic geometry usable in tests but blocks official release", () => {
    expect(validateCircuitReleaseReadiness(syntheticCircuit).ready).toBe(false);
    expect(validateCircuitReleaseReadiness(syntheticCircuit).errors).toContain(
      "Circuit kind must be declared before official release"
    );
    expect(validateCircuitReleaseReadiness({ ...syntheticCircuit, kind: "synthetic" }).errors)
      .toContain("Synthetic circuits are test-only and cannot be used for official races");
  });

  it("allows fictional circuits after geometric validation without pretending they are real", () => {
    const result = validateCircuitReleaseReadiness({ ...syntheticCircuit, kind: "fictional" });
    expect(result.ready).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("blocks real circuits with missing or incomplete source provenance", () => {
    const missing = validateCircuitReleaseReadiness({ ...syntheticCircuit, kind: "real", trackLimitGeometry: verifiedTrackLimitGeometry,
      specifications: verifiedTrackLimitSpecifications });
    expect(missing.ready).toBe(false);
    expect(missing.errors).toContain("Real circuits require source provenance");

    const incomplete = validateCircuitReleaseReadiness({
      ...syntheticCircuit,
      kind: "real",
      trackLimitGeometry: verifiedTrackLimitGeometry,
      specifications: verifiedTrackLimitSpecifications,
      sourceProvenance: { ...verifiedSource, sourceUrl: "http://data.example.org/track.geojson", geometryHash: "bad" }
    });
    expect(incomplete.ready).toBe(false);
    expect(incomplete.errors.some((error) => error.includes("HTTPS"))).toBe(true);
    expect(incomplete.errors.some((error) => error.includes("SHA-256"))).toBe(true);
  });

  it("requires traceable source license, retrieval revision, hash, and independent fidelity review", () => {
    const ready = validateCircuitReleaseReadiness({
      ...syntheticCircuit,
      kind: "real",
      trackLimitGeometry: verifiedTrackLimitGeometry,
      specifications: verifiedTrackLimitSpecifications,
      sourceProvenance: verifiedSource
    });
    expect(ready.ready).toBe(true);
    expect(ready.errors).toEqual([]);

    const approximate = validateCircuitReleaseReadiness({
      ...syntheticCircuit,
      kind: "real",
      trackLimitGeometry: verifiedTrackLimitGeometry,
      specifications: verifiedTrackLimitSpecifications,
      sourceProvenance: { ...verifiedSource, fidelityStatus: "approximate" }
    });
    expect(approximate.ready).toBe(false);
    expect(approximate.errors).toContain("Real circuit geometry must pass fidelity review");
  });
});
