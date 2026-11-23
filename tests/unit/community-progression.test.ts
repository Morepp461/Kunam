import { describe, expect, it } from "vitest";
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
      [{ finishingPoints: [10, 5], poleBonus: 2 }],
      1,
      () => randomValues[cursor++] ?? 0,
    );
    expect(result.probabilities).toEqual([0, 100]);
    expect(result.maxRemainingPoints).toBe(12);
  });

  it("rejects negative pole bonus configuration", () => {
    expect(() => simulateChampionship(
      [{ name: "A", points: 10 }, { name: "B", points: 9 }],
      [{ finishingPoints: [10, 5], poleBonus: -1 }],
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
