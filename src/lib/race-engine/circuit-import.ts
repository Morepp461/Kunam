import type { CircuitFidelityStatus, CircuitSourceProvenance } from "./circuit-geometry";

export interface CircuitGeoJsonSourceMetadata {
  readonly provider: string;
  readonly sourceUrl: string;
  readonly licenseId: string;
  readonly attribution: string;
  readonly retrievedAt: string;
  readonly sourceRevision: string;
  readonly knownLimitations?: readonly string[];
}

export interface CircuitGeoJsonDraftPoint {
  readonly id: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly elevationMeters: number | null;
  readonly projectedXMeters: number;
  readonly projectedYMeters: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly distanceFromStartMeters: number;
}

export interface CircuitGeoJsonImportDraft {
  readonly schemaVersion: 1;
  readonly sourceProvenance: CircuitSourceProvenance;
  readonly points: readonly CircuitGeoJsonDraftPoint[];
  readonly totalLengthMeters: number;
  readonly isClosed: boolean;
  readonly closureGapMeters: number;
  readonly hasElevationData: boolean;
  readonly warnings: readonly string[];
}

type GeoJsonLineString = {
  readonly type: "LineString";
  readonly coordinates: readonly unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractLineString(value: unknown): GeoJsonLineString {
  if (!isRecord(value)) throw new Error("GeoJSON root must be an object");
  if (value.type === "LineString") return value as unknown as GeoJsonLineString;
  if (value.type === "Feature") {
    const geometry = value.geometry;
    if (isRecord(geometry) && geometry.type === "LineString") return geometry as unknown as GeoJsonLineString;
    throw new Error("GeoJSON Feature must contain exactly one LineString geometry");
  }
  if (value.type === "FeatureCollection") {
    const features = Array.isArray(value.features) ? value.features : [];
    const candidates = features.filter((feature) =>
      isRecord(feature) && isRecord(feature.geometry) && feature.geometry.type === "LineString"
    );
    if (candidates.length !== 1) {
      throw new Error("GeoJSON FeatureCollection must contain exactly one LineString feature");
    }
    return (candidates[0] as Record<string, unknown>).geometry as GeoJsonLineString;
  }
  throw new Error("Only GeoJSON LineString, Feature, or single-LineString FeatureCollection is supported");
}

function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radius = 6_371_008.8;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(Math.min(1, value)));
}

function validateSourceMetadata(metadata: CircuitGeoJsonSourceMetadata): void {
  if (!metadata.provider.trim()) throw new Error("Circuit data provider is required");
  let source: URL;
  try { source = new URL(metadata.sourceUrl); } catch { throw new Error("Circuit source URL is invalid"); }
  if (source.protocol !== "https:") throw new Error("Circuit source URL must use HTTPS");
  if (source.username || source.password) throw new Error("Circuit source URL must not contain credentials");
  if ([...source.searchParams.keys()].some((key) => /token|api.?key|secret|auth|signature|credential/i.test(key))) {
    throw new Error("Circuit source URL must not contain private access tokens or signed credentials");
  }
  if (!metadata.licenseId.trim()) throw new Error("Circuit source license is required");
  if (!metadata.attribution.trim()) throw new Error("Circuit source attribution is required");
  if (!Number.isFinite(Date.parse(metadata.retrievedAt))) throw new Error("Circuit retrieval timestamp is invalid");
  if (!metadata.sourceRevision.trim()) throw new Error("Circuit source revision is required");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Imports geographic centerline data as an unverified draft only.
 * It intentionally does not invent sectors, corners, widths, pit lanes, DRS zones, or elevation.
 */
export async function importCircuitGeoJsonDraft(
  rawGeoJson: string,
  metadata: CircuitGeoJsonSourceMetadata
): Promise<CircuitGeoJsonImportDraft> {
  validateSourceMetadata(metadata);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawGeoJson);
  } catch {
    throw new Error("Circuit source is not valid JSON");
  }

  const line = extractLineString(parsed);
  if (line.coordinates.length > 50_000) throw new Error("Circuit centerline is limited to 50,000 coordinates");
  const coordinates = line.coordinates.map((coordinate, index) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      throw new Error(`GeoJSON coordinate ${index + 1} must contain longitude and latitude`);
    }
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    const elevation = coordinate.length > 2 && coordinate[2] !== null ? Number(coordinate[2]) : null;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`GeoJSON coordinate ${index + 1} has an invalid longitude`);
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`GeoJSON coordinate ${index + 1} has an invalid latitude`);
    }
    if (elevation !== null && !Number.isFinite(elevation)) {
      throw new Error(`GeoJSON coordinate ${index + 1} has an invalid elevation`);
    }
    return { longitude, latitude, elevationMeters: elevation };
  });

  const points = coordinates.filter((point, index) =>
    index === 0 || haversineMeters(coordinates[index - 1], point) >= 0.25
  );
  if (points.length < 4) throw new Error("Circuit centerline requires at least four distinct points");

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const originLatitude = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
  const originLongitude = longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length;
  const latitudeRadians = originLatitude * Math.PI / 180;
  const projected = points.map((point) => ({
    ...point,
    x: (point.longitude - originLongitude) * Math.PI / 180 * 6_378_137 * Math.cos(latitudeRadians),
    y: (point.latitude - originLatitude) * Math.PI / 180 * 6_378_137
  }));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 1 || height < 1) throw new Error("Circuit centerline has insufficient geographic extent");

  let distanceFromStartMeters = 0;
  const draftPoints = projected.map((point, index) => {
    if (index > 0) distanceFromStartMeters += haversineMeters(points[index - 1], point);
    return Object.freeze({
      id: `geojson-${index + 1}`,
      longitude: point.longitude,
      latitude: point.latitude,
      elevationMeters: point.elevationMeters,
      projectedXMeters: point.x,
      projectedYMeters: point.y,
      normalizedX: (point.x - minX) / width,
      normalizedY: 1 - (point.y - minY) / height,
      distanceFromStartMeters
    });
  });

  const closureGapMeters = haversineMeters(points[0], points[points.length - 1]);
  const isClosed = closureGapMeters <= 15;
  const hasElevationData = points.every((point) => point.elevationMeters !== null);
  const warnings = [
    "Imported centerline is an unverified draft and cannot pass official circuit release.",
    "Sector boundaries, corner classification, track widths, pit lane, DRS zones, and track limits require manual authoritative annotation."
  ];
  if (!isClosed) warnings.push("Source centerline does not close within 15 meters; review closure manually.");
  if (!hasElevationData) warnings.push("Elevation data is incomplete; no elevation values were fabricated.");
  if (metadata.knownLimitations?.length) warnings.push(...metadata.knownLimitations);

  const sourceProvenance: CircuitSourceProvenance = Object.freeze({
    provider: metadata.provider,
    sourceUrl: metadata.sourceUrl,
    licenseId: metadata.licenseId,
    attribution: metadata.attribution,
    retrievedAt: metadata.retrievedAt,
    sourceRevision: metadata.sourceRevision,
    geometryHash: await sha256Hex(rawGeoJson),
    fidelityStatus: "unverified" satisfies CircuitFidelityStatus,
    knownLimitations: Object.freeze([...warnings])
  });

  return Object.freeze({
    schemaVersion: 1,
    sourceProvenance,
    points: Object.freeze(draftPoints),
    totalLengthMeters: distanceFromStartMeters,
    isClosed,
    closureGapMeters,
    hasElevationData,
    warnings: Object.freeze(warnings)
  });
}
