import { describe, expect, it } from "vitest";
import { importCircuitGeoJsonDraft } from "../../src/lib/race-engine/circuit-import";

const metadata = {
  provider: "Test data provider",
  sourceUrl: "https://data.example.test/circuit.geojson",
  licenseId: "MIT",
  attribution: "Test geometry contributors",
  retrievedAt: "2026-11-20T12:00:00.000Z",
  sourceRevision: "fixture-v1"
};

const closedTrack = JSON.stringify({
  type: "LineString",
  coordinates: [
    [103.8000, 1.3000],
    [103.8010, 1.3000],
    [103.8010, 1.3010],
    [103.8000, 1.3010],
    [103.8000, 1.3000]
  ]
});

describe("Circuit GeoJSON import drafts", () => {
  it("projects a LineString, hashes the exact source, and keeps the draft unverified", async () => {
    const draft = await importCircuitGeoJsonDraft(closedTrack, metadata);
    expect(draft.points).toHaveLength(5);
    expect(draft.isClosed).toBe(true);
    expect(draft.totalLengthMeters).toBeGreaterThan(400);
    expect(draft.sourceProvenance.geometryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(draft.sourceProvenance.fidelityStatus).toBe("unverified");
    expect(draft.hasElevationData).toBe(false);
    expect(draft.warnings.some((warning) => warning.includes("cannot pass official circuit release"))).toBe(true);
    expect(draft.points.every((point) => point.normalizedX >= 0 && point.normalizedX <= 1)).toBe(true);
    expect(draft.points.every((point) => point.normalizedY >= 0 && point.normalizedY <= 1)).toBe(true);
  });

  it("preserves supplied elevation and accepts a single LineString Feature", async () => {
    const raw = JSON.stringify({
      type: "Feature",
      properties: { name: "Fixture" },
      geometry: {
        type: "LineString",
        coordinates: [
          [103.8, 1.3, 12],
          [103.801, 1.3, 14],
          [103.801, 1.301, 15],
          [103.8, 1.301, 13],
          [103.8, 1.3, 12]
        ]
      }
    });
    const draft = await importCircuitGeoJsonDraft(raw, metadata);
    expect(draft.hasElevationData).toBe(true);
    expect(draft.points[1].elevationMeters).toBe(14);
  });

  it("removes consecutive duplicate coordinates without fabricating a closed loop", async () => {
    const raw = JSON.stringify({
      type: "LineString",
      coordinates: [
        [103.8, 1.3],
        [103.8, 1.3],
        [103.801, 1.3],
        [103.801, 1.301],
        [103.8, 1.301]
      ]
    });
    const draft = await importCircuitGeoJsonDraft(raw, metadata);
    expect(draft.points).toHaveLength(4);
    expect(draft.isClosed).toBe(false);
    expect(draft.warnings.some((warning) => warning.includes("does not close"))).toBe(true);
  });

  it("rejects unsupported multi-line geometry and ambiguous feature collections", async () => {
    await expect(importCircuitGeoJsonDraft(JSON.stringify({
      type: "MultiLineString",
      coordinates: [[[103.8, 1.3], [103.801, 1.3]]]
    }), metadata)).rejects.toThrow("Only GeoJSON LineString");

    await expect(importCircuitGeoJsonDraft(JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: [[103.8, 1.3], [103.801, 1.3], [103.801, 1.301], [103.8, 1.301]] } },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[103.9, 1.3], [103.901, 1.3], [103.901, 1.301], [103.9, 1.301]] } }
      ]
    }), metadata)).rejects.toThrow("exactly one LineString");
  });

  it("rejects malformed metadata, JSON, and out-of-range coordinates", async () => {
    await expect(importCircuitGeoJsonDraft(closedTrack, { ...metadata, sourceUrl: "http://data.example.test/track.geojson" }))
      .rejects.toThrow("HTTPS");
    await expect(importCircuitGeoJsonDraft("{not-json", metadata)).rejects.toThrow("not valid JSON");
    await expect(importCircuitGeoJsonDraft(JSON.stringify({
      type: "LineString",
      coordinates: [[103.8, 1.3], [181, 1.3], [103.801, 1.301], [103.8, 1.301]]
    }), metadata)).rejects.toThrow("invalid longitude");
  });
});
