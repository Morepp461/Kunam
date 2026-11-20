import type { RaceSimulationCheckpoint } from "./simulation.ts";

export const RACE_TIMING_PROJECTION_SCHEMA_VERSION = 1;

export interface RaceTimingProjectionRow {
  readonly position: number | null;
  readonly driverId: string;
  readonly teamId: string;
  readonly lapCompleted: number;
  readonly elapsedMs: number;
  readonly finished: boolean;
  readonly retired: boolean;
  readonly pitStopCount: number;
  readonly segmentIndex: number | null;
  readonly segmentId: string | null;
  readonly segmentDistanceCompletedMeters: number;
  readonly tyre: null | {
    readonly compound: string;
    readonly wearPercent: number;
    readonly surfaceTempC: number;
    readonly carcassTempC: number;
    readonly gripPercent: number;
  };
}

export interface RaceTimingProjectionClassificationEntry {
  readonly position: number | null;
  readonly driverId: string;
  readonly teamId: string;
  readonly lapCompleted: number;
  readonly elapsedMs: number;
  readonly finished: boolean;
  readonly retired?: boolean;
  readonly pitStopCount?: number;
}

export interface RaceTimingProjection {
  readonly schemaVersion: typeof RACE_TIMING_PROJECTION_SCHEMA_VERSION;
  readonly raceId: string;
  readonly engineVersion: string;
  readonly tick: number;
  readonly status: "running" | "completed";
  readonly simulationTimeMs: number;
  readonly generatedAt: string;
  readonly timingRows: readonly RaceTimingProjectionRow[];
  readonly weather: null | {
    readonly trackWetness: number;
    readonly gripPercent: number;
    readonly trackWaterDepthMm: number;
  };
  readonly activeFlags: readonly {
    readonly flag: string;
    readonly incidentId: string;
    readonly expiresAtSimulationTimeMs: number;
  }[];
  readonly latestEventSequence: number;
  readonly latestEvents: readonly {
    readonly sequence: number;
    readonly type: string;
    readonly driverId: string | null;
    readonly lapNumber: number;
    readonly simulationTimeMs: number;
  }[];
}

export function buildRaceTimingProjection(
  checkpoint: RaceSimulationCheckpoint,
  classification: readonly RaceTimingProjectionClassificationEntry[],
  generatedAt: string
): RaceTimingProjection {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Projection generatedAt must be a valid timestamp");
  if (classification.length !== checkpoint.entrants.length) {
    throw new Error("Projection classification must include every checkpoint entrant");
  }
  const totalCircuitDistance = checkpoint.snapshot.circuit.segments.reduce(
    (total, segment) => total + segment.distanceMeters, 0
  );
  if (!Number.isFinite(totalCircuitDistance) || totalCircuitDistance <= 0) {
    throw new Error("Projection circuit distance must be positive");
  }

  const states = new Map(checkpoint.entrants.map((entrant) => [entrant.driverId, entrant]));
  const seenDrivers = new Set<string>();
  const timingRows = classification.map((entry, index) => {
    const state = states.get(entry.driverId);
    if (!state || seenDrivers.has(entry.driverId)) {
      throw new Error("Projection classification contains an unknown or duplicate driver");
    }
    seenDrivers.add(entry.driverId);
    const segmentIndex = state.finished || state.retired
      ? null
      : Math.min(state.segmentIndex, checkpoint.snapshot.circuit.segments.length - 1);
    const segment = segmentIndex === null ? null : checkpoint.snapshot.circuit.segments[segmentIndex];
    const segmentDistanceCompletedMeters = state.finished
      ? checkpoint.snapshot.circuit.totalLaps * totalCircuitDistance
      : state.lapCompleted * totalCircuitDistance +
        checkpoint.snapshot.circuit.segments.slice(0, state.segmentIndex)
          .reduce((total, item) => total + item.distanceMeters, 0);
    const tyre = state.tyreState ? Object.freeze({
      compound: state.tyreState.compound,
      wearPercent: state.tyreState.wearPercent,
      surfaceTempC: state.tyreState.surfaceTempC,
      carcassTempC: state.tyreState.carcassTempC,
      gripPercent: state.tyreState.gripPercent
    }) : null;
    return Object.freeze({
      position: entry.position,
      driverId: entry.driverId,
      teamId: entry.teamId,
      lapCompleted: entry.lapCompleted,
      elapsedMs: entry.elapsedMs,
      finished: entry.finished,
      retired: Boolean(entry.retired),
      pitStopCount: entry.pitStopCount ?? 0,
      segmentIndex,
      segmentId: segment?.id ?? null,
      segmentDistanceCompletedMeters,
      tyre
    });
  });
  if (seenDrivers.size !== states.size) throw new Error("Projection omitted one or more checkpoint drivers");

  const weatherState = checkpoint.weatherState;
  const weather = weatherState ? Object.freeze({
    trackWetness: weatherState.trackWetness,
    gripPercent: weatherState.gripPercent,
    trackWaterDepthMm: weatherState.trackWaterDepthMm
  }) : null;

  return Object.freeze({
    schemaVersion: RACE_TIMING_PROJECTION_SCHEMA_VERSION,
    raceId: checkpoint.raceId,
    engineVersion: checkpoint.engineVersion,
    tick: checkpoint.tick,
    status: checkpoint.status,
    simulationTimeMs: checkpoint.simulationClockMs ?? 0,
    generatedAt,
    timingRows: Object.freeze(timingRows),
    weather,
    activeFlags: Object.freeze((checkpoint.activeRaceControlFlags ?? []).map((flag) => Object.freeze({ ...flag }))),
    latestEventSequence: checkpoint.events.at(-1)?.sequence ?? 0,
    latestEvents: Object.freeze(checkpoint.events.slice(-20).map((event) => Object.freeze({
      sequence: event.sequence,
      type: event.type,
      driverId: event.driverId ?? null,
      lapNumber: event.lapNumber,
      simulationTimeMs: event.simulationTimeMs
    })))
  });
}
