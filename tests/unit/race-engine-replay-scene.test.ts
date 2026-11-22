import { describe, expect, it } from "vitest";
import { projectReplayScenePoint } from "../../src/lib/race-engine/replay-scene";

const layout = [
  { id: "layout-a", x: 0.2, y: 0.2 },
  { id: "layout-b", x: 0.8, y: 0.2 },
  { id: "layout-c", x: 0.8, y: 0.8 },
  { id: "layout-d", x: 0.2, y: 0.2 }
];

describe("3D replay scene projection", () => {
  it("maps normalized circuit coordinates onto a centered 3D plane", () => {
    expect(projectReplayScenePoint(layout, { x: 0.5, y: 0.25 })).toEqual({
      x: 0,
      z: -30,
      headingRadians: Math.PI / 2
    });
  });

  it("derives heading from the nearest layout edge, not unrelated segment IDs", () => {
    const point = projectReplayScenePoint(layout, { x: 0.78, y: 0.52 });
    expect(point.headingRadians).toBeCloseTo(Math.PI);
  });

  it("rejects invalid coordinates and incomplete layouts", () => {
    expect(() => projectReplayScenePoint(layout, { x: Number.NaN, y: 0.5 })).toThrow(/finite coordinates/);
    expect(() => projectReplayScenePoint([], { x: 0.5, y: 0.5 })).toThrow(/circuit path/);
  });

  it("rejects layouts without a usable edge", () => {
    expect(() => projectReplayScenePoint([{ id: "a", x: 0.5, y: 0.5 }, { id: "b", x: 0.5, y: 0.5 }], { x: 0.5, y: 0.5 })).toThrow(/usable edge/);
  });
});
