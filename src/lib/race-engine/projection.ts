import type { RaceSimulationCheckpoint } from "./simulation";

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

export interface RaceSegmentTelemetryPoint {
  readonly sequence: number;
  readonly driverId: string;
  readonly racePosition: number | null;
  readonly lapNumber: number;
  readonly sectorNumber: number | null;
  readonly segmentId: string;
  readonly simulationTimeMs: number;
  readonly segmentDurationMs: number;
  readonly distanceMeters: number;
  readonly averageSpeedKph: number;
  readonly trackPositionMeters: number;
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
  readonly segmentTelemetry: readonly RaceSegmentTelemetryPoint[];
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
  const timingRows = classification.map((entry) => {
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

  const segmentIndexes = new Map(checkpoint.snapshot.circuit.segments.map((segment, index) => [segment.id, index]));
  const racePositions = new Map(classification.map((entry) => [entry.driverId, entry.position]));
  const segmentTelemetry = checkpoint.events
    .filter((event) => event.type === "segment_completed" && event.driverId && event.segmentId && event.durationMs !== undefined && event.durationMs > 0)
    .slice(-30)
    .map((event) => {
      const segmentIndex = segmentIndexes.get(event.segmentId!);
      const segment = segmentIndex === undefined ? undefined : checkpoint.snapshot.circuit.segments[segmentIndex];
      if (!segment || segmentIndex === undefined || !event.driverId || !event.durationMs) {
        throw new Error("Segment telemetry references an unknown circuit segment");
      }
      const completedBefore = checkpoint.snapshot.circuit.segments.slice(0, segmentIndex)
        .reduce((total, item) => total + item.distanceMeters, 0);
      return Object.freeze({
        sequence: event.sequence,
        driverId: event.driverId,
        racePosition: racePositions.get(event.driverId) ?? null,
        lapNumber: event.lapNumber,
        sectorNumber: event.sectorNumber ?? null,
        segmentId: segment.id,
        simulationTimeMs: event.simulationTimeMs,
        segmentDurationMs: event.durationMs,
        distanceMeters: segment.distanceMeters,
        averageSpeedKph: segment.distanceMeters * 3600 / event.durationMs,
        trackPositionMeters: (event.lapNumber - 1) * totalCircuitDistance + completedBefore + segment.distanceMeters
      });
    });

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
    segmentTelemetry: Object.freeze(segmentTelemetry),
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
