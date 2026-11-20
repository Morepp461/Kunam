import { describe, expect, it } from "vitest";
import { RaceSimulation } from "../../src/lib/race-engine/simulation";
import { createSyntheticRaceFixture } from "../../src/lib/race-engine/synthetic-fixture";

describe("Ten-session race isolation", () => {
  it("runs ten independent 25-driver sessions interleaved with checkpoint restarts and no cross-session leakage", () => {
    const sessions = Array.from({ length: 10 }, (_, index) => {
      const snapshot = createSyntheticRaceFixture({
        seed: 91000 + index,
        driverCount: 25,
        teamCount: 10,
        totalLaps: 2
      });
      return {
        id: snapshot.raceId,
        simulation: new RaceSimulation(snapshot),
        baseline: new RaceSimulation(snapshot)
      };
    });

    let active = true;
    let ticks = 0;
    while (active) {
      active = false;
      for (const session of sessions) {
        if (session.simulation.status !== "completed") {
          active = true;
          session.simulation.advanceOneSegment();
          if (session.simulation.tick % 7 === 0 && session.simulation.status !== "completed") {
            session.simulation = RaceSimulation.restore(session.simulation.createCheckpoint());
          }
        }
      }
      ticks += 1;
      expect(ticks).toBeLessThanOrEqual(100);
    }

    for (const session of sessions) {
      session.baseline.runToCompletion();
      expect(session.simulation.events).toEqual(session.baseline.events);
      expect(session.simulation.classification).toEqual(session.baseline.classification);
      expect(session.simulation.entrantStates).toHaveLength(25);
      expect(new Set(session.simulation.entrantStates.map((entry) => entry.driverId)).size).toBe(25);
      expect(session.simulation.snapshot.raceId).toBe(session.id);
    }
  });
});
