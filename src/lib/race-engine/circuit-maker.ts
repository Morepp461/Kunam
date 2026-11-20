import {
  CIRCUIT_GEOMETRY_SCHEMA_VERSION,
  validateCircuitGeometryDefinition
} from "./circuit-geometry";
import type {
  CircuitCornerType,
  CircuitGeometryDefinition,
  CircuitGeometrySegment,
  CircuitPathPoint,
  CircuitGeometrySpecifications
} from "./circuit-geometry";
import type { TrackLimitPoint } from "./track-limits";

export interface CircuitMakerSegmentInput {
  id: string;
  sectorNumber: 1 | 2 | 3;
  distanceMeters: number;
  cornerType: CircuitCornerType;
  cornerRadiusMeters: number | null;
  trackWidthMeters: number;
  gripFactor: number;
  lowSpeedDemand: number;
  highSpeedDemand: number;
  tractionDemand: number;
  brakingDemand: number;
  drsAvailable: boolean;
  ersAvailable: boolean;
  overtakingOpportunity: boolean;
  defendingOpportunity: boolean;
  elevationChangeMeters: number;
  bankingDegrees?: number;
  gradientPercent?: number;
}

export interface CircuitMakerInput {
  id: string;
  revision: string;
  name: string;
  countryCode: string;
  totalLaps: number;
  targetLapTimeMs: number;
  layout: readonly CircuitPathPoint[];
  segments: readonly CircuitMakerSegmentInput[];
  kind: "fictional" | "real";
  specifications?: CircuitGeometrySpecifications;
  trackLimitBoundary?: readonly TrackLimitPoint[];
}

export interface CircuitMakerBuildResult {
  definition: CircuitGeometryDefinition | null;
  errors: readonly string[];
}

export function buildCircuitMakerDefinition(input: CircuitMakerInput): CircuitMakerBuildResult {
  const segments: CircuitGeometrySegment[] = input.segments.map((segment) => ({
    id: segment.id,
    sectorNumber: segment.sectorNumber,
    distanceMeters: segment.distanceMeters,
    gripFactor: segment.gripFactor,
    lowSpeedDemand: segment.lowSpeedDemand,
    highSpeedDemand: segment.highSpeedDemand,
    tractionDemand: segment.tractionDemand,
    brakingDemand: segment.brakingDemand,
    drsAvailable: segment.drsAvailable,
    ersAvailable: segment.ersAvailable,
    overtakingOpportunity: segment.overtakingOpportunity,
    defendingOpportunity: segment.defendingOpportunity,
    cornerType: segment.cornerType,
    cornerRadiusMeters: segment.cornerRadiusMeters,
    elevationChangeMeters: segment.elevationChangeMeters,
    trackWidthMeters: segment.trackWidthMeters,
    ...(segment.bankingDegrees === undefined ? {} : { bankingDegrees: segment.bankingDegrees }),
    ...(segment.gradientPercent === undefined ? {} : { gradientPercent: segment.gradientPercent })
  }));
  const definition: CircuitGeometryDefinition = {
    schemaVersion: CIRCUIT_GEOMETRY_SCHEMA_VERSION,
    id: input.id,
    revision: input.revision,
    name: input.name,
    countryCode: input.countryCode,
    totalLaps: input.totalLaps,
    targetLapTimeMs: input.targetLapTimeMs,
    trackLengthMeters: segments.reduce((sum, segment) => sum + segment.distanceMeters, 0),
    kind: input.kind,
    layout: input.layout.map((point) => ({ ...point })),
    segments,
    ...(input.trackLimitBoundary?.length ? { trackLimitGeometry: {
      schemaVersion: 1,
      circuitId: input.id,
      circuitRevision: input.revision,
      coordinateSystem: "normalized_0_1",
      boundary: input.trackLimitBoundary.map(({ x, y }) => ({ x, y }))
    } } : {}),
    ...(input.specifications ? { specifications: input.specifications } : {})
  };
  const validation = validateCircuitGeometryDefinition(definition);
  return { definition: validation.valid ? definition : null, errors: validation.errors };
}

export function calculateNormalizedCircuitLength(points: readonly Pick<CircuitPathPoint, "x" | "y">[]): number {
  if (points.length < 2) return 0;
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}
