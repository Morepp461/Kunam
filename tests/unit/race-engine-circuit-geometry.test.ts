import { describe, expect, it } from "vitest";
import {
  calculateCircuitSectorDistances,
  createImmutableCircuitGeometryDefinition,
  toCircuitSegmentSnapshots,
  validateCircuitGeometryDefinition
} from "../../src/lib/race-engine/circuit-geometry";
import type { CircuitGeometryDefinition } from "../../src/lib/race-engine/circuit-geometry";

function createCircuit(): CircuitGeometryDefinition {
  const distances = [800, 600, 500, 900, 700, 400, 500, 350, 250];
  const sectors = [1, 1, 1, 2, 2, 2, 3, 3, 3];
  const layout = [
    { id: "p1", x: 0.50, y: 0.10, elevationMeters: 10 },
    { id: "p2", x: 0.80, y: 0.20, elevationMeters: 12 },
    { id: "p3", x: 0.90, y: 0.50, elevationMeters: 14 },
    { id: "p4", x: 0.75, y: 0.80, elevationMeters: 11 },
    { id: "p5", x: 0.50, y: 0.90, elevationMeters: 9 },
    { id: "p6", x: 0.20, y: 0.80, elevationMeters: 7 },
    { id: "p7", x: 0.10, y: 0.50, elevationMeters: 8 },
    { id: "p8", x: 0.20, y: 0.20, elevationMeters: 9 },
    { id: "p9", x: 0.50, y: 0.10, elevationMeters: 10 }
  ];

  return {
    schemaVersion: 1,
    id: "synthetic-circuit",
    revision: "1",
    name: "Synthetic Circuit",
    countryCode: "ID",
    totalLaps: 5,
    targetLapTimeMs: 90000,
    trackLengthMeters: 5000,
    layout,
    segments: distances.map((distanceMeters, index) => {
      const isStraight = index === 2 || index === 7;
      return {
        id: `segment-${index + 1}`,
        sectorNumber: sectors[index],
        distanceMeters,
        gripFactor: 1,
        lowSpeedDemand: index % 3 === 0 ? 0.8 : 0.3,
        highSpeedDemand: index % 3 === 1 ? 0.8 : 0.3,
        tractionDemand: index % 3 === 2 ? 0.8 : 0.3,
        drsAvailable: isStraight,
        cornerType: isStraight ? "straight" : index % 2 === 0 ? "slow" : "fast",
        cornerRadiusMeters: isStraight ? null : 45,
        elevationChangeMeters: 0,
        trackWidthMeters: 12
      };
    })
  };
}

describe("Circuit geometry contract", () => {
  it("validates a closed, three-sector circuit with matching segment distance", () => {
    const result = validateCircuitGeometryDefinition(createCircuit());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.calculatedTrackLengthMeters).toBe(5000);
    expect(result.sectorDistancesMeters).toEqual({ 1: 1900, 2: 2000, 3: 1100 });
  });

  it("rejects a layout that is not closed", () => {
    const circuit = createCircuit();
    const layout = [...circuit.layout];
    layout[layout.length - 1] = { ...layout[layout.length - 1], x: 0.42, y: 0.18 };
    const result = validateCircuitGeometryDefinition({ ...circuit, layout });
    expect(result.errors.some((error) => error.includes("closed loop"))).toBe(true);
  });

  it("rejects coordinates outside the normalized map canvas", () => {
    const circuit = createCircuit();
    const layout = [...circuit.layout];
    layout[1] = { ...layout[1], x: 1.2 };
    expect(validateCircuitGeometryDefinition({ ...circuit, layout }).valid).toBe(false);
  });

  it("rejects duplicate segment IDs, missing sectors, and out-of-order sectors", () => {
    const circuit = createCircuit();
    const duplicate = circuit.segments.map((segment, index) =>
      index === 1 ? { ...segment, id: circuit.segments[0].id } : segment
    );
    expect(validateCircuitGeometryDefinition({ ...circuit, segments: duplicate }).errors.some((error) => error.includes("unique"))).toBe(true);

    const missingSector = circuit.segments.filter((segment) => segment.sectorNumber !== 2);
    expect(validateCircuitGeometryDefinition({ ...circuit, segments: missingSector }).errors.some((error) => error.includes("sector 2"))).toBe(true);

    const reordered = [...circuit.segments];
    [reordered[0], reordered[3]] = [reordered[3], reordered[0]];
    expect(validateCircuitGeometryDefinition({ ...circuit, segments: reordered }).errors.some((error) => error.includes("ordered by sector"))).toBe(true);
  });

  it("rejects track-length mismatch and invalid segment demands", () => {
    const circuit = createCircuit();
    const invalidSegments = circuit.segments.map((segment, index) =>
      index === 0 ? { ...segment, lowSpeedDemand: 1.5 } : segment
    );
    const result = validateCircuitGeometryDefinition({
      ...circuit,
      trackLengthMeters: 7000,
      segments: invalidSegments
    });
    expect(result.errors.some((error) => error.includes("trackLengthMeters"))).toBe(true);
    expect(result.errors.some((error) => error.includes("lowSpeedDemand"))).toBe(true);
  });

  it("creates a deep-frozen clone and exports simulation segment snapshots", () => {
    const circuit = createCircuit();
    const frozen = createImmutableCircuitGeometryDefinition(circuit);
    expect(frozen).not.toBe(circuit);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.layout)).toBe(true);
    expect(Object.isFrozen(frozen.segments)).toBe(true);

    const snapshots = toCircuitSegmentSnapshots(circuit);
    expect(snapshots).toHaveLength(9);
    expect(snapshots[2].drsAvailable).toBe(true);
    expect(snapshots[0]).not.toHaveProperty("cornerRadiusMeters");
    expect(calculateCircuitSectorDistances(circuit.segments)).toEqual({ 1: 1900, 2: 2000, 3: 1100 });
  });
});
