import {
  ATTRIBUTE_SCHEMA_VERSION,
  CAR_TEAM_ATTRIBUTE_DEFINITIONS,
  DRIVER_ATTRIBUTE_DEFINITIONS
} from "./attributes";
import type { CarTeamAttributeValues, DriverAttributeValues } from "./attributes";
import {
  RACE_ENGINE_VERSION,
  RACE_START_SNAPSHOT_SCHEMA_VERSION
} from "./contracts";
import type { RaceStartSnapshot } from "./contracts";
import { SeededRandom } from "./random";
import type { CircuitGeometryDefinition } from "./circuit-geometry";

export interface SyntheticRaceFixtureOptions {
  readonly seed?: number;
  readonly totalLaps?: number;
  readonly driverCount?: number;
  readonly teamCount?: number;
}

function createAttributeValues<T extends string>(
  keys: readonly T[],
  random: SeededRandom
): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 50 + random.nextInt(51)])) as Record<T, number>;
}

/**
 * Generates isolated synthetic data for engine tests and benchmarks.
 * It never writes to Supabase or any application data source.
 */
export function createSyntheticRaceFixture(
  options: SyntheticRaceFixtureOptions = {}
): RaceStartSnapshot {
  const seed = options.seed ?? 20261120;
  const driverCount = options.driverCount ?? 20;
  const teamCount = options.teamCount ?? 10;
  const totalLaps = options.totalLaps ?? 5;

  if (!Number.isInteger(driverCount) || driverCount < 1) throw new RangeError("driverCount must be positive");
  if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > driverCount) {
    throw new RangeError("teamCount must be positive and cannot exceed driverCount");
  }
  if (!Number.isInteger(totalLaps) || totalLaps < 1) throw new RangeError("totalLaps must be positive");

  const random = new SeededRandom(seed);
  const driverKeys = DRIVER_ATTRIBUTE_DEFINITIONS.map((definition) => definition.key);
  const carTeamKeys = CAR_TEAM_ATTRIBUTE_DEFINITIONS.map((definition) => definition.key);
  const teamAttributes = Array.from({ length: teamCount }, () =>
    createAttributeValues(carTeamKeys, random)
  );

  const entrants = Array.from({ length: driverCount }, (_, index) => {
    const teamIndex = index % teamCount;
    return {
      driverId: `synthetic-driver-${String(index + 1).padStart(2, "0")}`,
      teamId: `synthetic-team-${String(teamIndex + 1).padStart(2, "0")}`,
      driverNameSnapshot: `AI Driver ${String(index + 1).padStart(2, "0")}`,
      teamNameSnapshot: `AI Team ${String(teamIndex + 1).padStart(2, "0")}`,
      driverAttributes: createAttributeValues(driverKeys, random) as DriverAttributeValues,
      carTeamAttributes: teamAttributes[teamIndex] as CarTeamAttributeValues,
      hqEffects: {}
    };
  });

  const distances = [800, 600, 500, 900, 700, 400, 500, 350, 250];
  const sectors = [1, 1, 1, 2, 2, 2, 3, 3, 3];
  const segments: CircuitGeometryDefinition["segments"] = distances.map((distanceMeters, index) => ({
    id: `synthetic-segment-${String(index + 1).padStart(2, "0")}`,
    sectorNumber: sectors[index],
    distanceMeters,
    gripFactor: 1,
    lowSpeedDemand: index % 3 === 0 ? 0.8 : 0.3,
    highSpeedDemand: index % 3 === 1 ? 0.8 : 0.3,
    tractionDemand: index % 3 === 2 ? 0.8 : 0.3,
    drsAvailable: index === 2 || index === 7,
    ersAvailable: index === 2 || index === 7,
    overtakingOpportunity: index === 2 || index === 7,
    defendingOpportunity: true,
    cornerType: index === 2 || index === 7 ? "straight" : index % 2 === 0 ? "slow" : "fast",
    cornerRadiusMeters: index === 2 || index === 7 ? null : 45,
    elevationChangeMeters: 0,
    trackWidthMeters: 12
  }));

  return {
    schemaVersion: RACE_START_SNAPSHOT_SCHEMA_VERSION,
    engineVersion: RACE_ENGINE_VERSION,
    attributeSchemaVersion: ATTRIBUTE_SCHEMA_VERSION,
    raceId: `synthetic-race-${seed}`,
    seed,
    createdAt: "2026-01-01T00:00:00.000Z",
    circuit: {
      schemaVersion: 1,
      countryCode: "ID",
      trackLengthMeters: distances.reduce((total, distance) => total + distance, 0),
      layout: [
        { id: "p1", x: 0.50, y: 0.10, elevationMeters: 10 },
        { id: "p2", x: 0.80, y: 0.20, elevationMeters: 12 },
        { id: "p3", x: 0.90, y: 0.50, elevationMeters: 14 },
        { id: "p4", x: 0.75, y: 0.80, elevationMeters: 11 },
        { id: "p5", x: 0.50, y: 0.90, elevationMeters: 9 },
        { id: "p6", x: 0.20, y: 0.80, elevationMeters: 7 },
        { id: "p7", x: 0.10, y: 0.50, elevationMeters: 8 },
        { id: "p8", x: 0.20, y: 0.20, elevationMeters: 9 },
        { id: "p9", x: 0.50, y: 0.10, elevationMeters: 10 }
      ],
      id: "synthetic-grand-prix-circuit",
      revision: "1",
      name: "Synthetic Grand Prix Circuit",
      totalLaps,
      targetLapTimeMs: 90000,
      segments
    },
    entrants
  };
}
