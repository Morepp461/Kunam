import { describe, expect, it } from "vitest";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";
import { createRaceEngineTestModels } from "../../src/lib/race-engine/test-profiles";
import { summarizeMonteCarloDistribution } from "../../src/lib/race-engine/monte-carlo";

type ScenarioStats = {
  durations: number[];
  races: number;
  finishers: number;
  retirements: number;
  pitStops: number;
  incidents: number;
};

describe("Race Engine Monte Carlo scenario analysis", () => {
  it("runs 1,000 seeded races across dry, wet, and changing-weather scenarios", () => {
    const scenarios = ["dry", "wet", "transition"] as const;
    const stats: Record<(typeof scenarios)[number], ScenarioStats> = {
      dry: { durations: [], races: 0, finishers: 0, retirements: 0, pitStops: 0, incidents: 0 },
      wet: { durations: [], races: 0, finishers: 0, retirements: 0, pitStops: 0, incidents: 0 },
      transition: { durations: [], races: 0, finishers: 0, retirements: 0, pitStops: 0, incidents: 0 }
    };

    for (let seed = 1; seed <= 1000; seed += 1) {
      const scenario = scenarios[(seed - 1) % scenarios.length];
      const snapshot = createSyntheticRaceFixture({
        seed,
        driverCount: 5,
        teamCount: 2,
        totalLaps: 3
      });
      const models = createRaceEngineTestModels(snapshot, { weatherScenario: scenario });
      const simulation = new RaceSimulation(snapshot, {
        config: models.config,
        performanceModel: models.performanceModel,
        tyreModel: models.tyreModel,
        weatherModel: models.weatherModel,
        pitModel: models.pitModel,
        incidentModel: models.incidentModel,
        raceControlProfile: models.raceControlProfile
      });
      const classification = simulation.runToCompletion();
      const current = stats[scenario];
      current.races += 1;
      current.finishers += classification.filter((entry) => entry.finished && !entry.retired).length;
      current.retirements += classification.filter((entry) => entry.retired).length;
      current.pitStops += simulation.events.filter((event) => event.type === "pit_stop").length;
      current.incidents += simulation.events.filter((event) => event.type === "incident").length;
      current.durations.push(...classification.map((entry) => entry.elapsedMs));
      expect(classification).toHaveLength(5);
      expect(classification.every((entry) => Number.isFinite(entry.elapsedMs) && entry.elapsedMs >= 0)).toBe(true);
      expect(simulation.status).toBe("completed");
    }

    const report = Object.fromEntries(scenarios.map((scenario) => {
      const current = stats[scenario];
      return [scenario, {
        raceCount: current.races,
        finishers: current.finishers,
        retirements: current.retirements,
        pitStops: current.pitStops,
        incidents: current.incidents,
        durationMs: summarizeMonteCarloDistribution(current.durations)
      }];
    }));

    expect(Object.values(stats).reduce((total, item) => total + item.races, 0)).toBe(1000);
    for (const scenario of scenarios) {
      expect(stats[scenario].races).toBeGreaterThan(300);
      expect(report[scenario].durationMs.sampleCount).toBe(stats[scenario].races * 5);
      expect(Number.isFinite(report[scenario].durationMs.standardDeviation)).toBe(true);
    }
  }, 30000);

  it("summarizes distributions and flags IQR outliers without imposing balance thresholds", () => {
    expect(summarizeMonteCarloDistribution([1, 2, 3, 4, 5, 100])).toMatchObject({
      sampleCount: 6,
      minimum: 1,
      median: 3.5,
      maximum: 100,
      iqrOutlierCount: 1
    });
    expect(() => summarizeMonteCarloDistribution([])).toThrow(RangeError);
    expect(() => summarizeMonteCarloDistribution([1, Number.NaN])).toThrow(RangeError);
  });
});
