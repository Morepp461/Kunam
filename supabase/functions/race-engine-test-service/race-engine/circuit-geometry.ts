import type { CircuitSegmentSnapshot } from "./contracts.ts";
import { validateTrackLimitGeometry } from "./track-limits.ts";
import type { TrackLimitGeometry } from "./track-limits.ts";

export const CIRCUIT_GEOMETRY_SCHEMA_VERSION = 1;
export const CIRCUIT_SECTOR_COUNT = 3;

export type CircuitCornerType = "straight" | "slow" | "medium" | "fast" | "chicane";

export type CircuitGeometryKind = "synthetic" | "fictional" | "real";
export type CircuitFidelityStatus = "unverified" | "approximate" | "verified";

export interface CircuitSourceProvenance {
  readonly provider: string;
  readonly sourceUrl: string;
  readonly licenseId: string;
  readonly attribution: string;
  readonly retrievedAt: string;
  readonly sourceRevision: string;
  readonly geometryHash: string;
  readonly fidelityStatus: CircuitFidelityStatus;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly knownLimitations?: readonly string[];
}

export interface CircuitPathPoint {
  readonly id: string;
  /** Normalized map coordinate in the inclusive range 0..1. */
  readonly x: number;
  readonly y: number;
  readonly elevationMeters: number;
}

export interface CircuitGeometrySegment extends CircuitSegmentSnapshot {
  readonly cornerType: CircuitCornerType;
  readonly cornerRadiusMeters: number | null;
  readonly elevationChangeMeters: number;
  readonly trackWidthMeters: number;
  /** Measured banking angle in degrees; omitted when the source does not provide it. */
  readonly bankingDegrees?: number;
  /** Measured longitudinal gradient in percent; omitted when unavailable. */
  readonly gradientPercent?: number;
}

export interface CircuitDrsZone {
  readonly id: string;
  readonly startDistanceMeters: number;
  readonly endDistanceMeters: number;
  readonly detectionDistanceMeters: number | null;
}

export interface CircuitGeometrySpecifications {
  readonly direction: "clockwise" | "counterclockwise" | "unknown";
  readonly surface: "asphalt" | "concrete" | "mixed" | "unknown";
  readonly elevationDataStatus: "measured" | "unavailable";
  readonly pitLane: {
    readonly enabled: boolean;
    readonly lengthMeters: number | null;
    readonly speedLimitKph: number | null;
    readonly entryDistanceMeters: number | null;
    readonly exitDistanceMeters: number | null;
  };
  readonly drsZones: readonly CircuitDrsZone[];
  readonly trackLimits: {
    readonly method: "segment_width" | "polygon" | "unverified";
    readonly sourceNote: string;
  };
}

export interface CircuitGeometryDefinition {
  readonly schemaVersion: typeof CIRCUIT_GEOMETRY_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: string;
  readonly name: string;
  readonly countryCode: string;
  readonly totalLaps: number;
  readonly targetLapTimeMs: number;
  readonly trackLengthMeters: number;
  /** Missing kind/provenance remains compatible with legacy synthetic fixtures but blocks official release. */
  readonly kind?: CircuitGeometryKind;
  readonly sourceProvenance?: CircuitSourceProvenance;
  readonly layout: readonly CircuitPathPoint[];
  readonly segments: readonly CircuitGeometrySegment[];
  readonly trackLimitGeometry?: TrackLimitGeometry;
  readonly specifications?: CircuitGeometrySpecifications;
}


export interface CircuitReleaseReadinessResult {
  readonly ready: boolean;
  readonly errors: readonly string[];
}

/**
 * A geometrically valid drawing is not automatically an approved real circuit.
 * Official release requires a declared circuit kind and traceable, reviewed source provenance.
 */
export function validateCircuitReleaseReadiness(
  circuit: CircuitGeometryDefinition
): CircuitReleaseReadinessResult {
  const errors: string[] = [];
  const geometry = validateCircuitGeometryDefinition(circuit);
  errors.push(...geometry.errors);

  if (!circuit.kind) {
    errors.push("Circuit kind must be declared before official release");
  } else if (circuit.kind === "synthetic") {
    errors.push("Synthetic circuits are test-only and cannot be used for official races");
  } else if (circuit.kind === "real") {
    if (!circuit.trackLimitGeometry || circuit.specifications?.trackLimits.method !== "polygon") {
      errors.push("Real circuits require a measured track-limit boundary polygon and polygon method");
    }
    const source = circuit.sourceProvenance;
    if (!source) {
      errors.push("Real circuits require source provenance");
    } else {
      if (!source.provider.trim()) errors.push("Circuit source provider is required");
      if (!/^https:\/\//i.test(source.sourceUrl)) errors.push("Circuit source URL must use HTTPS");
      if (!source.licenseId.trim()) errors.push("Circuit source license is required");
      if (!source.attribution.trim()) errors.push("Circuit source attribution is required");
      if (!Number.isFinite(Date.parse(source.retrievedAt))) errors.push("Circuit source retrieval timestamp is invalid");
      if (!source.sourceRevision.trim()) errors.push("Circuit source revision is required");
      if (!/^[a-f0-9]{64}$/i.test(source.geometryHash)) errors.push("Circuit geometry hash must be a SHA-256 hex digest");
      if (source.fidelityStatus !== "verified") errors.push("Real circuit geometry must pass fidelity review");
      if (!source.reviewedBy?.trim() || !source.reviewedAt || !Number.isFinite(Date.parse(source.reviewedAt))) {
        errors.push("Real circuit fidelity review requires reviewer identity and timestamp");
      }
    }
  }

  return { ready: errors.length === 0, errors };
}

export interface CircuitGeometryValidationOptions {
  readonly distanceTolerancePercent?: number;
  readonly layoutClosureTolerance?: number;
}

export interface CircuitGeometryValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly calculatedTrackLengthMeters: number;
  readonly sectorDistancesMeters: Readonly<Record<1 | 2 | 3, number>>;
}

function isFiniteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function calculateCircuitSegmentDistance(
  segments: readonly CircuitGeometrySegment[]
): number {
  return segments.reduce((total, segment) => total + segment.distanceMeters, 0);
}

export function calculateCircuitSectorDistances(
  segments: readonly CircuitGeometrySegment[]
): Readonly<Record<1 | 2 | 3, number>> {
  const distances: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const segment of segments) {
    if (segment.sectorNumber === 1 || segment.sectorNumber === 2 || segment.sectorNumber === 3) {
      distances[segment.sectorNumber] += segment.distanceMeters;
    }
  }
  return distances;
}

export function validateCircuitGeometryDefinition(
  circuit: CircuitGeometryDefinition,
  options: CircuitGeometryValidationOptions = {}
): CircuitGeometryValidationResult {
  const errors: string[] = [];
  const distanceTolerancePercent = options.distanceTolerancePercent ?? 1;
  const closureTolerance = options.layoutClosureTolerance ?? 0.02;

  if (circuit.schemaVersion !== CIRCUIT_GEOMETRY_SCHEMA_VERSION) {
    errors.push("Unsupported circuit geometry schema version");
  }
  if (!circuit.id.trim() || !circuit.revision.trim()) {
    errors.push("Circuit ID and revision are required");
  }
  if (circuit.name.trim().length < 2) errors.push("Circuit name must contain at least two characters");
  if (!/^[A-Z]{2}$/.test(circuit.countryCode)) errors.push("Circuit countryCode must be a two-letter uppercase code");
  if (!Number.isInteger(circuit.totalLaps) || circuit.totalLaps < 1) {
    errors.push("Circuit totalLaps must be a positive integer");
  }
  if (!Number.isFinite(circuit.targetLapTimeMs) || circuit.targetLapTimeMs <= 0) {
    errors.push("Circuit targetLapTimeMs must be positive");
  }
  if (!Number.isFinite(circuit.trackLengthMeters) || circuit.trackLengthMeters <= 0) {
    errors.push("Circuit trackLengthMeters must be positive");
  }
  if (!Number.isFinite(distanceTolerancePercent) || distanceTolerancePercent < 0 || distanceTolerancePercent > 10) {
    errors.push("distanceTolerancePercent must be between 0 and 10");
  }
  if (!Number.isFinite(closureTolerance) || closureTolerance <= 0 || closureTolerance > 0.25) {
    errors.push("layoutClosureTolerance must be greater than 0 and at most 0.25");
  }

  if (circuit.layout.length < 4) errors.push("Circuit layout must contain at least four path points");
  const pointIds = new Set<string>();
  for (const [index, point] of circuit.layout.entries()) {
    if (!point.id.trim() || pointIds.has(point.id)) {
      errors.push("Circuit layout point IDs must be present and unique");
    }
    pointIds.add(point.id);
    if (!isFiniteInRange(point.x, 0, 1) || !isFiniteInRange(point.y, 0, 1)) {
      errors.push(`Layout point ${point.id} coordinates must be normalized between 0 and 1`);
    }
    if (!Number.isFinite(point.elevationMeters)) {
      errors.push(`Layout point ${point.id} elevationMeters must be finite`);
    }
    const previous = circuit.layout[index - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.000001) {
      errors.push(`Layout point ${point.id} duplicates the previous point`);
    }
  }

  if (circuit.layout.length >= 2) {
    const first = circuit.layout[0];
    const last = circuit.layout[circuit.layout.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) > closureTolerance) {
      errors.push("Circuit layout must form a closed loop");
    }
  }

  if (circuit.segments.length < CIRCUIT_SECTOR_COUNT) {
    errors.push("Circuit must contain at least three segments");
  }
  const segmentIds = new Set<string>();
  let previousSector = 0;
  const sectorCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };

  for (const segment of circuit.segments) {
    if (!segment.id.trim() || segmentIds.has(segment.id)) {
      errors.push("Circuit segment IDs must be present and unique");
    }
    segmentIds.add(segment.id);

    if (!Number.isInteger(segment.sectorNumber) || segment.sectorNumber < 1 || segment.sectorNumber > CIRCUIT_SECTOR_COUNT) {
      errors.push(`Segment ${segment.id} sectorNumber must be 1, 2, or 3`);
    } else {
      if (segment.sectorNumber < previousSector) {
        errors.push("Circuit segments must be ordered by sector from 1 through 3");
      }
      previousSector = segment.sectorNumber;
      sectorCounts[segment.sectorNumber as 1 | 2 | 3] += 1;
    }

    if (!Number.isFinite(segment.distanceMeters) || segment.distanceMeters <= 0) {
      errors.push(`Segment ${segment.id} distanceMeters must be positive`);
    }
    if (!Number.isFinite(segment.gripFactor) || segment.gripFactor <= 0) {
      errors.push(`Segment ${segment.id} gripFactor must be positive`);
    }
    for (const [key, demand] of [
      ["lowSpeedDemand", segment.lowSpeedDemand],
      ["highSpeedDemand", segment.highSpeedDemand],
      ["tractionDemand", segment.tractionDemand],
      ["brakingDemand", segment.brakingDemand ?? 0]
    ] as const) {
      if (!isFiniteInRange(demand, 0, 1)) {
        errors.push(`Segment ${segment.id} ${key} must be between 0 and 1`);
      }
    }
    for (const [key, value] of [
      ["ersAvailable", segment.ersAvailable],
      ["overtakingOpportunity", segment.overtakingOpportunity],
      ["defendingOpportunity", segment.defendingOpportunity]
    ] as const) {
      if (value !== undefined && typeof value !== "boolean") errors.push(`Segment ${segment.id} ${key} must be boolean when supplied`);
    }
    if (!["straight", "slow", "medium", "fast", "chicane"].includes(segment.cornerType)) {
      errors.push(`Segment ${segment.id} has an unsupported cornerType`);
    }
    if (segment.cornerType === "straight") {
      if (segment.cornerRadiusMeters !== null) {
        errors.push(`Straight segment ${segment.id} must not define a corner radius`);
      }
    } else if (
      segment.cornerRadiusMeters === null ||
      !Number.isFinite(segment.cornerRadiusMeters) ||
      segment.cornerRadiusMeters <= 0
    ) {
      errors.push(`Corner segment ${segment.id} must define a positive cornerRadiusMeters`);
    }
    if (!Number.isFinite(segment.elevationChangeMeters)) {
      errors.push(`Segment ${segment.id} elevationChangeMeters must be finite`);
    }
    if (segment.bankingDegrees !== undefined && !Number.isFinite(segment.bankingDegrees)) errors.push(`Segment ${segment.id} bankingDegrees must be finite when supplied`);
    if (segment.gradientPercent !== undefined && !Number.isFinite(segment.gradientPercent)) errors.push(`Segment ${segment.id} gradientPercent must be finite when supplied`);
    if (!Number.isFinite(segment.trackWidthMeters) || segment.trackWidthMeters <= 0) {
      errors.push(`Segment ${segment.id} trackWidthMeters must be positive`);
    }
  }

  for (const sector of [1, 2, 3] as const) {
    if (sectorCounts[sector] === 0) errors.push(`Circuit is missing sector ${sector}`);
  }

  if (circuit.specifications) {
    const spec = circuit.specifications;
    if (!["clockwise", "counterclockwise", "unknown"].includes(spec.direction)) errors.push("Circuit direction is invalid");
    if (!["asphalt", "concrete", "mixed", "unknown"].includes(spec.surface)) errors.push("Circuit surface is invalid");
    if (!["measured", "unavailable"].includes(spec.elevationDataStatus)) errors.push("Circuit elevation data status is invalid");
    if (!["segment_width", "polygon", "unverified"].includes(spec.trackLimits.method)) errors.push("Circuit track-limit method is invalid");
    if (typeof spec.trackLimits.sourceNote !== "string") errors.push("Circuit track-limit source note must be text");
    if (spec.trackLimits.method === "polygon" && !circuit.trackLimitGeometry) errors.push("Polygon track limits require a measured boundary polygon");
    if (spec.trackLimits.method !== "polygon" && circuit.trackLimitGeometry) errors.push("Track-limit polygon requires the polygon track-limit method");
    if (spec.pitLane.enabled) {
      for (const [key, value] of [
        ["lengthMeters", spec.pitLane.lengthMeters],
        ["speedLimitKph", spec.pitLane.speedLimitKph]
      ] as const) {
        if (value === null || !Number.isFinite(value) || value <= 0) errors.push("Pit lane " + key + " must be a positive measured value");
      }
      if (spec.pitLane.entryDistanceMeters === null || !Number.isFinite(spec.pitLane.entryDistanceMeters) || spec.pitLane.entryDistanceMeters < 0) {
        errors.push("Pit lane entry distance must be measured and non-negative");
      }
      if (spec.pitLane.exitDistanceMeters === null || !Number.isFinite(spec.pitLane.exitDistanceMeters) || spec.pitLane.exitDistanceMeters <= 0) {
        errors.push("Pit lane exit distance must be a positive measured value");
      }
      if (spec.pitLane.entryDistanceMeters !== null && spec.pitLane.exitDistanceMeters !== null &&
          spec.pitLane.entryDistanceMeters >= spec.pitLane.exitDistanceMeters) {
        errors.push("Pit lane entry distance must be before pit lane exit distance");
      }
    }
    const drsIds = new Set<string>();
    for (const zone of spec.drsZones) {
      if (!zone.id.trim() || drsIds.has(zone.id)) errors.push("DRS zone IDs must be present and unique");
      drsIds.add(zone.id);
      if (!Number.isFinite(zone.startDistanceMeters) || !Number.isFinite(zone.endDistanceMeters) ||
          zone.startDistanceMeters < 0 || zone.endDistanceMeters <= zone.startDistanceMeters ||
          zone.endDistanceMeters > circuit.trackLengthMeters) {
        errors.push("DRS zone distances must be within the measured circuit length");
      }
      if (zone.detectionDistanceMeters !== null &&
          (!Number.isFinite(zone.detectionDistanceMeters) || zone.detectionDistanceMeters < 0 ||
           zone.detectionDistanceMeters >= circuit.trackLengthMeters)) {
        errors.push("DRS detection distance must be within the measured circuit length");
      }
    }
  }

  if (circuit.trackLimitGeometry) {
    const boundaryValidation = validateTrackLimitGeometry(circuit.trackLimitGeometry);
    errors.push(...boundaryValidation.errors.map((error) => `Track limits: ${error}`));
    if (circuit.trackLimitGeometry.circuitId !== circuit.id || circuit.trackLimitGeometry.circuitRevision !== circuit.revision) {
      errors.push("Track-limit boundary circuit identity/revision must match the geometry snapshot");
    }
  }

  const calculatedTrackLengthMeters = calculateCircuitSegmentDistance(circuit.segments);
  const allowedDifference = circuit.trackLengthMeters * distanceTolerancePercent / 100;
  if (
    Number.isFinite(circuit.trackLengthMeters) &&
    circuit.trackLengthMeters > 0 &&
    Math.abs(calculatedTrackLengthMeters - circuit.trackLengthMeters) > allowedDifference
  ) {
    errors.push("Sum of segment distances does not match trackLengthMeters within the configured tolerance");
  }

  return {
    valid: errors.length === 0,
    errors,
    calculatedTrackLengthMeters,
    sectorDistancesMeters: calculateCircuitSectorDistances(circuit.segments)
  };
}

function cloneCircuit<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneCircuit(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, cloneCircuit(child)])
    ) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

export function createImmutableCircuitGeometryDefinition(
  circuit: CircuitGeometryDefinition
): Readonly<CircuitGeometryDefinition> {
  const validation = validateCircuitGeometryDefinition(circuit);
  if (!validation.valid) {
    throw new Error(`Invalid circuit geometry: ${validation.errors.join("; ")}`);
  }
  return deepFreeze(cloneCircuit(circuit));
}

export function toCircuitSegmentSnapshots(
  circuit: CircuitGeometryDefinition
): readonly CircuitSegmentSnapshot[] {
  const validation = validateCircuitGeometryDefinition(circuit);
  if (!validation.valid) {
    throw new Error(`Invalid circuit geometry: ${validation.errors.join("; ")}`);
  }
  return circuit.segments.map((segment) => ({
    id: segment.id,
    sectorNumber: segment.sectorNumber,
    distanceMeters: segment.distanceMeters,
    gripFactor: segment.gripFactor,
    lowSpeedDemand: segment.lowSpeedDemand,
    highSpeedDemand: segment.highSpeedDemand,
    tractionDemand: segment.tractionDemand,
    ...(segment.brakingDemand !== undefined ? { brakingDemand: segment.brakingDemand } : {}),
    drsAvailable: segment.drsAvailable
  }));
}
