export const TRACK_LIMIT_GEOMETRY_SCHEMA_VERSION = 1;

export interface TrackLimitPoint {
  readonly x: number;
  readonly y: number;
}

export interface TrackLimitGeometry {
  readonly schemaVersion: typeof TRACK_LIMIT_GEOMETRY_SCHEMA_VERSION;
  readonly circuitId: string;
  readonly circuitRevision: string;
  /** Same normalized 0..1 coordinate space as the circuit layout contract. */
  readonly coordinateSystem: "normalized_0_1";
  /** Polygon closure is implicit; do not repeat the first point as the last point. */
  readonly boundary: readonly TrackLimitPoint[];
}

export interface TrackLimitObservationInput {
  readonly raceId: string;
  readonly driverId: string;
  readonly recordedAt: string;
  readonly simulationTimeMs: number;
  readonly lapNumber: number;
  readonly sectorNumber: 1 | 2 | 3;
  readonly segmentId: string;
  readonly position: TrackLimitPoint;
}

export interface TrackLimitObservation {
  readonly id: string;
  readonly type: "track_limit_observation";
  readonly raceId: string;
  readonly driverId: string;
  readonly recordedAt: string;
  readonly simulationTimeMs: number;
  readonly lapNumber: number;
  readonly sectorNumber: 1 | 2 | 3;
  readonly segmentId: string;
  readonly circuitId: string;
  readonly circuitRevision: string;
  readonly position: TrackLimitPoint;
  readonly evidence: {
    readonly geometrySchemaVersion: typeof TRACK_LIMIT_GEOMETRY_SCHEMA_VERSION;
    readonly coordinateSystem: "normalized_0_1";
    readonly boundaryPointCount: number;
    readonly classification: "outside_boundary";
  };
}

export interface TrackLimitValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function validPoint(point: TrackLimitPoint): boolean {
  return Boolean(point) && typeof point === "object" &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function samePoint(a: TrackLimitPoint, b: TrackLimitPoint): boolean {
  return Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12;
}

function orientation(a: TrackLimitPoint, b: TrackLimitPoint, c: TrackLimitPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: TrackLimitPoint, a: TrackLimitPoint, b: TrackLimitPoint): boolean {
  const cross = orientation(a, b, point);
  if (Math.abs(cross) > 1e-10) return false;
  return point.x >= Math.min(a.x, b.x) - 1e-10 &&
    point.x <= Math.max(a.x, b.x) + 1e-10 &&
    point.y >= Math.min(a.y, b.y) - 1e-10 &&
    point.y <= Math.max(a.y, b.y) + 1e-10;
}

function segmentsIntersect(
  a: TrackLimitPoint, b: TrackLimitPoint, c: TrackLimitPoint, d: TrackLimitPoint
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
      ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return (Math.abs(o1) <= 1e-10 && pointOnSegment(c, a, b)) ||
    (Math.abs(o2) <= 1e-10 && pointOnSegment(d, a, b)) ||
    (Math.abs(o3) <= 1e-10 && pointOnSegment(a, c, d)) ||
    (Math.abs(o4) <= 1e-10 && pointOnSegment(b, c, d));
}

export function validateTrackLimitGeometry(geometry: TrackLimitGeometry): TrackLimitValidationResult {
  const errors: string[] = [];
  if (geometry.schemaVersion !== TRACK_LIMIT_GEOMETRY_SCHEMA_VERSION) errors.push("Unsupported track-limit geometry schema version");
  if (!geometry.circuitId.trim() || !geometry.circuitRevision.trim()) errors.push("Track-limit circuit identity and revision are required");
  if (geometry.coordinateSystem !== "normalized_0_1") errors.push("Track-limit coordinate system is unsupported");
  if (!Array.isArray(geometry.boundary) || geometry.boundary.length < 3) {
    errors.push("Track-limit boundary must contain at least three points");
    return Object.freeze({ valid: false, errors: Object.freeze(errors) });
  }
  for (let index = 0; index < geometry.boundary.length; index += 1) {
    const point = geometry.boundary[index];
    const next = geometry.boundary[(index + 1) % geometry.boundary.length];
    if (!validPoint(point)) errors.push(`Track-limit boundary point ${index} must be normalized and finite`);
    if (validPoint(point) && validPoint(next) && samePoint(point, next)) {
      errors.push("Track-limit boundary must not contain adjacent duplicate points or repeat its first point at the end");
    }
  }
  if (geometry.boundary.every(validPoint)) {
    const areaTwice = geometry.boundary.reduce((area, point, index) => {
      const next = geometry.boundary[(index + 1) % geometry.boundary.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0);
    if (Math.abs(areaTwice) < 1e-10) errors.push("Track-limit boundary must enclose a non-zero area");
  }
  const count = geometry.boundary.length;
  if (geometry.boundary.every(validPoint)) for (let first = 0; first < count; first += 1) {
    const firstNext = (first + 1) % count;
    for (let second = first + 1; second < count; second += 1) {
      const secondNext = (second + 1) % count;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(geometry.boundary[first], geometry.boundary[firstNext], geometry.boundary[second], geometry.boundary[secondNext])) {
        errors.push("Track-limit boundary must not self-intersect");
      }
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/** Boundary points count as inside; this records geometry evidence only and never issues a penalty. */
export function evaluateTrackLimitObservation(
  geometry: TrackLimitGeometry,
  input: TrackLimitObservationInput
): TrackLimitObservation | null {
  const validation = validateTrackLimitGeometry(geometry);
  if (!validation.valid) throw new Error(`Invalid track-limit geometry: ${validation.errors.join("; ")}`);
  if (!input.raceId.trim() || !input.driverId.trim() || !input.segmentId.trim()) {
    throw new Error("Track-limit observation identity fields are required");
  }
  if (!Number.isFinite(Date.parse(input.recordedAt)) || !Number.isFinite(input.simulationTimeMs) || input.simulationTimeMs < 0) {
    throw new Error("Track-limit observation timestamps are invalid");
  }
  if (!Number.isInteger(input.lapNumber) || input.lapNumber < 1 || ![1, 2, 3].includes(input.sectorNumber)) {
    throw new Error("Track-limit lap or sector is invalid");
  }
  if (!validPoint(input.position)) throw new Error("Track-limit position must be normalized and finite");

  let inside = false;
  const points = geometry.boundary;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[previous];
    const b = points[index];
    if (pointOnSegment(input.position, a, b)) return null;
    const crosses = (a.y > input.position.y) !== (b.y > input.position.y);
    if (crosses) {
      const intersectionX = ((b.x - a.x) * (input.position.y - a.y)) / (b.y - a.y) + a.x;
      if (input.position.x < intersectionX) inside = !inside;
    }
  }
  if (inside) return null;

  const position = Object.freeze({ x: input.position.x, y: input.position.y });
  const id = [
    "track-limit", input.raceId, input.driverId, input.lapNumber, input.segmentId,
    input.simulationTimeMs, position.x.toFixed(6), position.y.toFixed(6)
  ].join(":");
  return Object.freeze({
    id,
    type: "track_limit_observation",
    raceId: input.raceId,
    driverId: input.driverId,
    recordedAt: input.recordedAt,
    simulationTimeMs: input.simulationTimeMs,
    lapNumber: input.lapNumber,
    sectorNumber: input.sectorNumber,
    segmentId: input.segmentId,
    circuitId: geometry.circuitId,
    circuitRevision: geometry.circuitRevision,
    position,
    evidence: Object.freeze({
      geometrySchemaVersion: geometry.schemaVersion,
      coordinateSystem: geometry.coordinateSystem,
      boundaryPointCount: geometry.boundary.length,
      classification: "outside_boundary"
    })
  });
}
