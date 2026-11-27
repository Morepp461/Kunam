import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildYearbookPrintHtml, escapeHtml, getCalerisLevel, simulateChampionship } from "../../src/lib/community-progression";

describe("Caleris account levels", () => {
  it("keeps XP cumulative and applies the configured doubling thresholds", () => {
    expect(getCalerisLevel(0)).toBe(0);
    expect(getCalerisLevel(49)).toBe(0);
    expect(getCalerisLevel(50)).toBe(1);
    expect(getCalerisLevel(100)).toBe(2);
    expect(getCalerisLevel(6400)).toBe(8);
    expect(getCalerisLevel(50 * 2 ** 99)).toBe(100);
  });

  it("handles invalid and negative totals safely", () => {
    expect(getCalerisLevel(-20)).toBe(0);
    expect(getCalerisLevel(Number.NaN)).toBe(0);
  });
});

describe("Championship predictor", () => {
  it("locks a champion only with a strict lead over every rival maximum", () => {
    const result = simulateChampionship(
      [{ name: "A", points: 100 }, { name: "B", points: 80 }],
      [[10, 6, 4]],
    );
    expect(result.lockedChampionIndex).toBe(0);
    expect(result.probabilities).toEqual([100, 0]);
  });

  it("does not lock a tied mathematical boundary", () => {
    const result = simulateChampionship(
      [{ name: "A", points: 20 }, { name: "B", points: 10 }],
      [[10, 5]],
      20,
      () => 0.25,
    );
    expect(result.lockedChampionIndex).toBeNull();
    expect(result.probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
  });

  it("marks a driver eliminated only when a rival has a strict maximum-points lead", () => {
    const result = simulateChampionship(
      [{ name: "A", points: 100 }, { name: "B", points: 0 }],
      [[10, 5]],
      10,
      () => 0.1,
    );
    expect(result.eliminated).toEqual([false, true]);
    expect(result.probabilities[1]).toBe(0);
  });

  it("awards pole bonus independently from finishing position", () => {
    const randomValues = [0, 0, 0];
    let cursor = 0;
    const result = simulateChampionship(
      [{ name: "A", points: 0 }, { name: "B", points: 0 }],
      [{ finishingPoints: [10, 5], poleBonus: 2, sessionType: "race" }],
      1,
      () => randomValues[cursor++] ?? 0,
    );
    expect(result.probabilities).toEqual([0, 100]);
    expect(result.maxRemainingPoints).toBe(12);
  });

  it("uses race countback before qualifying countback when points are level", () => {
    const raceResult = simulateChampionship(
      [{ name: "A", points: 0 }, { name: "B", points: 0 }],
      [{ finishingPoints: [10, 10], poleBonus: 0, sessionType: "race" }],
      1,
      () => 0,
    );
    expect(raceResult.probabilities).toEqual([0, 100]);
    expect(raceResult.unresolvedTiebreakTrials).toBe(0);

    const qualifyingFallback = simulateChampionship(
      [
        { name: "A", points: 0, countback: [], qualifyingCountback: [0, 1] },
        { name: "B", points: 0, countback: [], qualifyingCountback: [1, 0] },
      ],
      [{ finishingPoints: [0, 0], poleBonus: 0, sessionType: "qualifying" }],
      1,
      () => 0,
    );
    expect(qualifyingFallback.probabilities).toEqual([0, 100]);
  });

  it("does not use sprint finishes for countback and splits unresolved qualifying ties", () => {
    const result = simulateChampionship(
      [{ name: "A", points: 0 }, { name: "B", points: 0 }],
      [{ finishingPoints: [10, 10], poleBonus: 0, sessionType: "sprint" }],
      1,
      () => 0,
    );
    expect(result.probabilities).toEqual([50, 50]);
    expect(result.unresolvedTiebreakTrials).toBe(1);
  });

  it("rejects negative pole bonus configuration", () => {
    expect(() => simulateChampionship(
      [{ name: "A", points: 10 }, { name: "B", points: 9 }],
      [{ finishingPoints: [10, 5], poleBonus: -1, sessionType: "race" }],
    )).toThrow("Aturan poin");
  });

  it("rejects incomplete scoring vectors instead of silently dropping a round", () => {
    expect(() => simulateChampionship(
      [{ name: "A", points: 10 }, { name: "B", points: 9 }],
      [[10, 5], []],
    )).toThrow("Aturan poin");
  });
});

describe("Yearbook output", () => {
  it("escapes untrusted content and produces a printable yearbook", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    const html = buildYearbookPrintHtml({
      title: "<Unsafe>",
      season: { title: "Season 1" },
      member: { character_name: "Driver One" },
      xp: 120,
      level: 2,
      official_season_data: {
        driver_standings: [{ driver_name_snapshot: "Driver One", final_points: 120 }],
      },
    });
    expect(html).toContain("&lt;Unsafe&gt;");
    expect(html).toContain("Official Driver Standings");
    expect(html).toContain("Driver One");
    expect(html).toContain("window.print()");
  });
});


describe("Digital ID template selector", () => {
  it("renders unlocked data-driven templates and limits personalization to tagline and earned badges", () => {
    const source = readFileSync(new URL("../../src/CommunityProgression.tsx", import.meta.url), "utf8");
    const identitySection = source.split('{tab === "identity" && <section')[1]?.split('{tab === "yearbook"')[0] ?? "";
    expect(identitySection).toContain('className="cp-section cp-digital-id-editor"');
    expect(identitySection).not.toMatch(/<select\\b/);
    expect(identitySection).toContain('className="cp-id-template-picker"');
    expect(identitySection).toContain('className="cp-id-template-options"');
    expect(identitySection).toContain('idTemplates.map((template: any)');
    expect(identitySection).toContain('disabled={!template.unlocked}');
    expect(identitySection).toContain('maximum 3');
    expect(identitySection).toContain('Public verification page');
    const css = readFileSync(new URL("../../src/community-progression.css", import.meta.url), "utf8");
    expect(css).toContain(".cp-id-template-options");
    expect(css).toContain(".cp-id-template--license_bronze");
  });
});
