import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("application route loading boundary", () => {
  it("uses React lazy imports for large route modules", () => {
    for (const component of [
      "DashboardModule",
      "CommunityProgression",
      "AdminEconomyEngine",
      "RaceControl",
      "LiveRace",
      "TeamLivery",
      "PublicTeamProfile",
    ]) {
      expect(source).toMatch(new RegExp(`const ${component} = lazy\\(\\(\\) => import\\(`));
    }
  });

  it("keeps route-level Suspense around the router", () => {
    expect(source).toMatch(/<Suspense fallback=\{<div className="auth-loading"/);
    expect(source).toMatch(/<Suspense[\\s\\S]*?<Routes>[\\s\\S]*?<\\/Routes><\\/Suspense>/);
  });

  it("does not eagerly import the route modules it splits", () => {
    expect(source).not.toMatch(/import (?:DashboardModule|CommunityProgression|AdminEconomyEngine|RaceControl|LiveRace|TeamLivery|PublicTeamProfile) from/);
  });
});
