import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("application route loading boundary", () => {
  it("loads large route modules only when their routes are visited", () => {
    for (const declaration of [
      'const DashboardModule = lazy(() => import("./DashboardModule"));',
      'const CommunityProgression = lazy(() => import("./CommunityProgression"));',
      'const AdminEconomyEngine = lazy(() => import("./AdminEconomyEngine"));',
      'const RaceControl = lazy(() => import("./RaceControl"));',
      'const LiveRace = lazy(() => import("./LiveRace"));',
      'const TeamLivery = lazy(() => import("./TeamLivery"));',
      'const PublicTeamProfile = lazy(() => import("./PublicTeamProfile"));',
    ]) {
      expect(source).toContain(declaration);
    }
  });

  it("wraps the router in an accessible Suspense fallback", () => {
    expect(source).toContain('<Suspense fallback={');
    const loadingComponent = readFileSync(resolve(process.cwd(), "src/GlobalLoading.tsx"), "utf8");
    expect(loadingComponent).toContain('role="status" aria-live="polite"');
    expect(source).toContain('</Routes></Suspense>');
  });

  it("does not keep split route modules as eager static imports", () => {
    for (const component of [
      "DashboardModule",
      "CommunityProgression",
      "AdminEconomyEngine",
      "RaceControl",
      "LiveRace",
      "TeamLivery",
      "PublicTeamProfile",
    ]) {
      expect(source).not.toContain(`import ${component} from`);
    }
  });
});
