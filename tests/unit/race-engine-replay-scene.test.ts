import { describe, expect, it } from "vitest";
import { projectReplayScenePoint } from "../../src/lib/race-engine/replay-scene";

const layout = [
  { id: "s1", x: 0.2, y: 0.2 },
  { id: "s2", x: 0.8, y: 0.2 },
  { id: "s3", x: 0.8, y: 0.8 },
  { id: "s4", x: 0.2, y: 0.2 }
];

describe("3D replay scene projection", () => {
  it("maps normalized circuit coordinates onto a centered 3D plane", () => {
    expect(projectReplayScenePoint(layout, { x: 0.5, y: 0.25, segmentId: "s1" })).toEqual({
      x: 0,
      z: -30,
      headingRadians: 0
    });
  });

  it("derives heading from the referenced circuit path segment", () => {
    const point = projectReplayScenePoint(layout, { x: 0.8, y: 0.5, segmentId: "s2" });
    expect(point.headingRadians).toBeCloseTo(-Math.PI / 2);
  });

  it("rejects unknown segment references", () => {
    expect(() => projectReplayScenePoint(layout, { x: 0.5, y: 0.5, segmentId: "missing" })).toThrow(/unknown segment/);
  });

  it("rejects invalid coordinates and incomplete layouts", () => {
    expect(() => projectReplayScenePoint(layout, { x: Number.NaN, y: 0.5, segmentId: "s1" })).toThrow(/finite coordinates/);
    expect(() => projectReplayScenePoint([], { x: 0.5, y: 0.5, segmentId: "s1" })).toThrow(/circuit path/);
  });
});
