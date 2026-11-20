import {
  createImmutableRaceStartSnapshot,
  RACE_ENGINE_VERSION,
  validateRaceStartSnapshot
} from "./contracts";
import type {
  CircuitSegmentSnapshot,
  JsonValue,
  RaceEntrantSnapshot,
  RaceStartSnapshot
} from "./contracts";
import { SeededRandom } from "./random";
import type { RandomGeneratorState } from "./random";
import {
  advanceTyreState,
  createInitialTyreState,
  createTyreSegmentInput,
  getTyreSegmentEnvironment
} from "./tyres";
import { TYRE_COMPOUNDS } from "./tyres";
import type { TyreSimulationModel, TyreState } from "./tyres";
import { advanceWeatherState, createInitialWeatherState, getWeatherInput } from "./weather";
import type { WeatherSimulationModel, WeatherState } from "./weather";

export const SIMULATION_CHECKPOINT_SCHEMA_VERSION = 4;
export const LEGACY_SIMULATION_CHECKPOINT_SCHEMA_VERSION = 3;

export type RaceSimulationStatus = "running" | "completed";
export type RaceEventType =
  | "segment_completed"
  | "sector_completed"
  | "lap_completed"
  | "race_completed";

export interface SegmentPerformanceContext {
  readonly entrant: RaceEntrantSnapshot;
  readonly lapNumber: number;
  readonly segmentIndex: number;
  readonly segmentDistanceMeters: number;
  readonly segment: CircuitSegmentSnapshot;
  readonly baseSegmentTimeMs: number;
  readonly tyreState: TyreState | null;
  readonly weatherState?: WeatherState | null;
}

export interface SegmentPerformanceModel {
  /** Implementations must be pure and deterministic for the same context, version, and snapshot. */
  readonly id: string;
  readonly version: string;
  readonly snapshot: JsonValue;
  calculateAdjustmentMs(context: SegmentPerformanceContext): number;
}

export const NEUTRAL_PERFORMANCE_MODEL: SegmentPerformanceModel = Object.freeze({
  id: "neutral",
  version: "1",
  snapshot: { model: "neutral", version: 1 },
  calculateAdjustmentMs: () => 0
});

export interface RaceSimulationConfig {
  readonly noiseAmplitudeMs: number;
  readonly performanceModelId: string;
  readonly performanceModelVersion: string;
  readonly performanceModelSnapshot: JsonValue;
  readonly tyreModelId: string | null;
  readonly tyreModelVersion: string | null;
  readonly tyreModelSnapshot: JsonValue | null;
  readonly weatherModelId?: string | null;
  readonly weatherModelVersion?: string | null;
  readonly weatherModelSnapshot?: JsonValue | null;
}

export interface RaceSimulationEvent {
  readonly sequence: number;
  readonly type: RaceEventType;
  readonly driverId?: string;
  readonly lapNumber: number;
  readonly sectorNumber?: number;
  readonly segmentId?: string;
  readonly simulationTimeMs: number;
  readonly durationMs?: number;
}

export interface EntrantSimulationState {
  readonly driverId: string;
  readonly teamId: string;
  readonly lapCompleted: number;
  readonly segmentIndex: number;
  readonly elapsedMs: number;
  readonly finished: boolean;
  readonly tyreState?: TyreState;
}

export interface RaceClassificationEntry {
  readonly position: number;
  readonly driverId: string;
  readonly teamId: string;
  readonly lapCompleted: number;
  readonly elapsedMs: number;
  readonly finished: boolean;
}

interface MutableEntrantState {
  driverId: string;
  teamId: string;
  lapCompleted: number;
  segmentIndex: number;
  elapsedMs: number;
  finished: boolean;
  tyreState?: TyreState;
}

export interface RaceSimulationCheckpoint {
  readonly schemaVersion: typeof SIMULATION_CHECKPOINT_SCHEMA_VERSION | typeof LEGACY_SIMULATION_CHECKPOINT_SCHEMA_VERSION;
  readonly engineVersion: string;
  readonly raceId: string;
  readonly snapshot: RaceStartSnapshot;
  readonly config: RaceSimulationConfig;
  readonly randomState: RandomGeneratorState;
  readonly status: RaceSimulationStatus;
  readonly tick: number;
  readonly entrants: readonly EntrantSimulationState[];
  readonly events: readonly RaceSimulationEvent[];
  readonly weatherState?: WeatherState | null;
}

export interface AdvanceResult {
  readonly status: RaceSimulationStatus;
  readonly tick: number;
  readonly eventsAdded: readonly RaceSimulationEvent[];
  readonly classification: readonly RaceClassificationEntry[];
}

function assertConfig(config: RaceSimulationConfig): void {
  if (!Number.isInteger(config.noiseAmplitudeMs) || config.noiseAmplitudeMs < 0 || config.noiseAmplitudeMs > 1000) {
    throw new RangeError("noiseAmplitudeMs must be an integer from 0 to 1000");
  }
  if (!config.performanceModelId.trim() || !config.performanceModelVersion.trim()) {
    throw new Error("Performance model ID and version are required");
  }
  const tyreFields = [
    config.tyreModelId,
    config.tyreModelVersion,
    config.tyreModelSnapshot
  ];
  const allTyreFieldsNull = tyreFields.every((value) => value === null);
  const allTyreFieldsPresent = tyreFields.every((value) => value !== null);
  if (!allTyreFieldsNull && !allTyreFieldsPresent) {
    throw new Error("Tyre model configuration is invalid");
  }
  if (
    config.tyreModelId !== null && !config.tyreModelId.trim() ||
    config.tyreModelVersion !== null && !config.tyreModelVersion.trim()
  ) {
    throw new Error("Tyre model ID and version must not be empty");
  }
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child as JsonValue)])
    ) as T;
  }
  return value;
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

function copyEvent(event: RaceSimulationEvent): RaceSimulationEvent {
  return { ...event };
}

function copyEntrantState(state: MutableEntrantState): EntrantSimulationState {
  return { ...state };
}

/**
 * Deterministic segment-stepped race kernel.
 * Physics is injected through a versioned performance model; the default model
 * is intentionally neutral until the game-specific coefficients are calibrated.
 * Each segment tick is staged and committed atomically in memory.
 */
export class RaceSimulation {
  readonly snapshot: Readonly<RaceStartSnapshot>;
  readonly config: RaceSimulationConfig;

  private random: SeededRandom;
  private readonly performanceModel: SegmentPerformanceModel;
  private readonly tyreModel?: TyreSimulationModel;
  private readonly weatherModel?: WeatherSimulationModel;
  private weatherStateValue?: WeatherState;
  private readonly mutableEntrants: MutableEntrantState[];
  private readonly mutableEvents: RaceSimulationEvent[] = [];
  private statusValue: RaceSimulationStatus = "running";
  private tickValue = 0;

  constructor(
    snapshot: RaceStartSnapshot,
    options?: {
      config?: Partial<RaceSimulationConfig>;
      performanceModel?: SegmentPerformanceModel;
      randomState?: RandomGeneratorState;
      tyreModel?: TyreSimulationModel;
      weatherModel?: WeatherSimulationModel;
    }
  ) {
    const immutableSnapshot = createImmutableRaceStartSnapshot(snapshot);
    this.snapshot = immutableSnapshot;
    this.performanceModel = options?.performanceModel ?? NEUTRAL_PERFORMANCE_MODEL;
    this.tyreModel = options?.tyreModel;
    this.weatherModel = options?.weatherModel;
    const config: RaceSimulationConfig = {
      noiseAmplitudeMs: options?.config?.noiseAmplitudeMs ?? 0,
      performanceModelId: this.performanceModel.id,
      performanceModelVersion: this.performanceModel.version,
      performanceModelSnapshot: cloneJsonValue(this.performanceModel.snapshot),
      tyreModelId: this.tyreModel?.id ?? null,
      tyreModelVersion: this.tyreModel?.version ?? null,
      tyreModelSnapshot: this.tyreModel ? cloneJsonValue(this.tyreModel.snapshot) : null,
      weatherModelId: this.weatherModel?.id ?? null,
      weatherModelVersion: this.weatherModel?.version ?? null,
      weatherModelSnapshot: this.weatherModel ? cloneJsonValue(this.weatherModel.snapshot) : null
    };
    if (options?.config?.performanceModelId && options.config.performanceModelId !== config.performanceModelId) {
      throw new Error("Configured performance model ID does not match the injected model");
    }
    if (options?.config?.performanceModelVersion && options.config.performanceModelVersion !== config.performanceModelVersion) {
      throw new Error("Configured performance model version does not match the injected model");
    }
    if (
      options?.config?.performanceModelSnapshot !== undefined &&
      canonicalJson(options.config.performanceModelSnapshot) !== canonicalJson(config.performanceModelSnapshot)
    ) {
      throw new Error("Configured performance model snapshot does not match the injected model");
    }
    if (
      options?.config?.tyreModelId !== undefined &&
      options.config.tyreModelId !== config.tyreModelId
    ) {
      throw new Error("Configured tyre model ID does not match the injected model");
    }
    if (
      options?.config?.tyreModelVersion !== undefined &&
      options.config.tyreModelVersion !== config.tyreModelVersion
    ) {
      throw new Error("Configured tyre model version does not match the injected model");
    }
    if (
      options?.config?.tyreModelSnapshot !== undefined &&
      canonicalJson(options.config.tyreModelSnapshot) !== canonicalJson(config.tyreModelSnapshot)
    ) {
      throw new Error("Configured tyre model snapshot does not match the injected model");
    }
    const weatherFields = [config.weatherModelId ?? null, config.weatherModelVersion ?? null, config.weatherModelSnapshot ?? null];
    const allWeatherNull = weatherFields.every((value) => value === null);
    const allWeatherPresent = weatherFields.every((value) => value !== null);
    if (!allWeatherNull && !allWeatherPresent) throw new Error("Weather model configuration is invalid");
    if (this.weatherModel && (
      config.weatherModelId !== this.weatherModel.id ||
      config.weatherModelVersion !== this.weatherModel.version ||
      canonicalJson(config.weatherModelSnapshot as JsonValue) !== canonicalJson(this.weatherModel.snapshot)
    )) throw new Error("Configured weather model does not match the injected model");
    if (!this.weatherModel && !allWeatherNull) throw new Error("Weather model configuration requires an injected weather model");
    assertConfig(config);
    this.config = deepFreeze(config);
    if (this.weatherModel) {
      const firstInput = getWeatherInput(this.weatherModel, 1, immutableSnapshot.circuit.segments[0].id);
      this.weatherStateValue = createInitialWeatherState(firstInput, this.weatherModel.profile);
      for (let lap = 1; lap <= immutableSnapshot.circuit.totalLaps; lap += 1) {
        for (const segment of immutableSnapshot.circuit.segments) getWeatherInput(this.weatherModel, lap, segment.id);
      }
    }
    this.random = options?.randomState
      ? SeededRandom.restore(options.randomState)
      : new SeededRandom(immutableSnapshot.seed);
    if (this.tyreModel) {
      const entrantIds = new Set(immutableSnapshot.entrants.map((entrant) => entrant.driverId));
      const configuredIds = Object.keys(this.tyreModel.startingCompounds);
      if (
        configuredIds.length !== entrantIds.size ||
        configuredIds.some((id) => !entrantIds.has(id))
      ) {
        throw new Error("Tyre model must define exactly one starting compound for every race entrant");
      }
      for (let lap = 1; lap <= immutableSnapshot.circuit.totalLaps; lap += 1) {
        for (const segment of immutableSnapshot.circuit.segments) {
          getTyreSegmentEnvironment(this.tyreModel, lap, segment.id);
        }
      }
    }
    this.mutableEntrants = immutableSnapshot.entrants.map((entrant) => {
      const firstSegment = immutableSnapshot.circuit.segments[0];
      const firstEnvironment = this.tyreModel
        ? getTyreSegmentEnvironment(this.tyreModel, 1, firstSegment.id)
        : undefined;
      const tyreState = this.tyreModel && firstEnvironment
        ? createInitialTyreState(
            this.tyreModel.startingCompounds[entrant.driverId],
            firstEnvironment.trackWetness,
            firstEnvironment.surfaceTempC,
            firstEnvironment.carcassTempC,
            this.tyreModel.profile
          )
        : undefined;
      return {
        driverId: entrant.driverId,
        teamId: entrant.teamId,
        lapCompleted: 0,
        segmentIndex: 0,
        elapsedMs: 0,
        finished: false,
        ...(tyreState ? { tyreState } : {})
      };
    });
  }

  static restore(
    checkpoint: RaceSimulationCheckpoint,
    performanceModel: SegmentPerformanceModel = NEUTRAL_PERFORMANCE_MODEL,
    tyreModel?: TyreSimulationModel,
    weatherModel?: WeatherSimulationModel
  ): RaceSimulation {
    if (checkpoint.schemaVersion !== SIMULATION_CHECKPOINT_SCHEMA_VERSION &&
        checkpoint.schemaVersion !== LEGACY_SIMULATION_CHECKPOINT_SCHEMA_VERSION) {
      throw new Error("Unsupported simulation checkpoint schema version");
    }
    if (checkpoint.engineVersion !== RACE_ENGINE_VERSION) {
      throw new Error("Checkpoint engine version does not match this runtime");
    }
    if (checkpoint.raceId !== checkpoint.snapshot.raceId) {
      throw new Error("Checkpoint race ID does not match its input snapshot");
    }
    if (
      checkpoint.config.performanceModelId !== performanceModel.id ||
      checkpoint.config.performanceModelVersion !== performanceModel.version ||
      canonicalJson(checkpoint.config.performanceModelSnapshot) !== canonicalJson(performanceModel.snapshot)
    ) {
      throw new Error("Checkpoint requires the same performance model ID and version");
    }
    const checkpointHasTyreModel = checkpoint.config.tyreModelId !== null;
    if (checkpointHasTyreModel !== Boolean(tyreModel)) {
      throw new Error("Checkpoint requires the same tyre simulation model");
    }
    if (tyreModel && (
      checkpoint.config.tyreModelId !== tyreModel.id ||
      checkpoint.config.tyreModelVersion !== tyreModel.version ||
      canonicalJson(checkpoint.config.tyreModelSnapshot) !== canonicalJson(tyreModel.snapshot)
    )) {
      throw new Error("Checkpoint tyre model ID, version, or snapshot does not match");
    }
    const checkpointHasWeatherModel = (checkpoint.config.weatherModelId ?? null) !== null;
    if (checkpointHasWeatherModel !== Boolean(weatherModel)) throw new Error("Checkpoint requires the same weather simulation model");
    if (weatherModel && (
      checkpoint.config.weatherModelId !== weatherModel.id ||
      checkpoint.config.weatherModelVersion !== weatherModel.version ||
      canonicalJson(checkpoint.config.weatherModelSnapshot as JsonValue) !== canonicalJson(weatherModel.snapshot)
    )) throw new Error("Checkpoint weather model ID, version, or snapshot does not match");
    if (checkpoint.schemaVersion === LEGACY_SIMULATION_CHECKPOINT_SCHEMA_VERSION && weatherModel) {
      throw new Error("Legacy checkpoints cannot be restored with a weather model");
    }
    const validation = validateRaceStartSnapshot(checkpoint.snapshot);
    if (!validation.valid) throw new Error(`Checkpoint snapshot is invalid: ${validation.errors.join("; ")}`);

    const simulation = new RaceSimulation(checkpoint.snapshot, {
      config: checkpoint.config,
      performanceModel,
      tyreModel,
      weatherModel,
      randomState: checkpoint.randomState
    });
    const maxTicks = simulation.snapshot.circuit.totalLaps * simulation.snapshot.circuit.segments.length;
    if (!Number.isInteger(checkpoint.tick) || checkpoint.tick < 0 || checkpoint.tick > maxTicks) {
      throw new Error("Checkpoint tick is invalid");
    }
    if (checkpoint.entrants.length !== simulation.mutableEntrants.length) {
      throw new Error("Checkpoint entrant count does not match input snapshot");
    }
    if (checkpoint.status !== "running" && checkpoint.status !== "completed") {
      throw new Error("Checkpoint status is invalid");
    }

    const expectedIds = new Set(simulation.mutableEntrants.map((entrant) => entrant.driverId));
    const restoredIds = new Set<string>();
    for (const state of checkpoint.entrants) {
      if (!expectedIds.has(state.driverId) || restoredIds.has(state.driverId)) {
        throw new Error("Checkpoint contains an unknown or duplicate driver");
      }
      restoredIds.add(state.driverId);
      if (
        !Number.isInteger(state.lapCompleted) ||
        state.lapCompleted < 0 ||
        state.lapCompleted > simulation.snapshot.circuit.totalLaps ||
        !Number.isInteger(state.segmentIndex) ||
        state.segmentIndex < 0 ||
        state.segmentIndex >= simulation.snapshot.circuit.segments.length ||
        !Number.isFinite(state.elapsedMs) ||
        state.elapsedMs < 0
      ) {
        throw new Error(`Checkpoint state for ${state.driverId} is invalid`);
      }
      if (simulation.tyreModel) {
        if (!state.tyreState || !(TYRE_COMPOUNDS as readonly string[]).includes(state.tyreState.compound)) {
          throw new Error(`Checkpoint tyre state for ${state.driverId} is missing or has an unexpected compound`);
        }
        if (
          !Number.isFinite(state.tyreState.wearPercent) || state.tyreState.wearPercent < 0 || state.tyreState.wearPercent > 100 ||
          !Number.isFinite(state.tyreState.distanceDrivenMeters) || state.tyreState.distanceDrivenMeters < 0 ||
          !Number.isFinite(state.tyreState.surfaceTempC) || !Number.isFinite(state.tyreState.carcassTempC) ||
          !Number.isFinite(state.tyreState.gripPercent) || state.tyreState.gripPercent < 0 || state.tyreState.gripPercent > 100
        ) {
          throw new Error(`Checkpoint tyre state for ${state.driverId} is invalid`);
        }
      } else if (state.tyreState !== undefined) {
        throw new Error(`Checkpoint contains unexpected tyre state for ${state.driverId}`);
      }
      if (state.finished && state.lapCompleted !== simulation.snapshot.circuit.totalLaps) {
        throw new Error(`Finished driver ${state.driverId} has not completed the race distance`);
      }
      if (!state.finished && state.lapCompleted === simulation.snapshot.circuit.totalLaps) {
        throw new Error(`Unfinished driver ${state.driverId} has completed the configured distance`);
      }
      const segmentCount = simulation.snapshot.circuit.segments.length;
      const completedSegments = state.lapCompleted * segmentCount + state.segmentIndex;
      const expectedSegments = state.finished ? maxTicks : checkpoint.tick;
      if (completedSegments !== expectedSegments) {
        throw new Error(`Checkpoint progress for ${state.driverId} does not match the simulation tick`);
      }
    }

    for (let index = 0; index < simulation.mutableEntrants.length; index += 1) {
      const state = checkpoint.entrants.find((item) => item.driverId === simulation.mutableEntrants[index].driverId);
      if (!state) throw new Error("Checkpoint is missing an entrant state");
      simulation.mutableEntrants[index] = { ...state };
    }

    checkpoint.events.forEach((event, index) => {
      if (event.sequence !== index + 1 || !Number.isFinite(event.simulationTimeMs) || event.simulationTimeMs < 0) {
        throw new Error("Checkpoint event log has an invalid sequence or timestamp");
      }
      if (event.driverId && !expectedIds.has(event.driverId)) {
        throw new Error("Checkpoint event references an unknown driver");
      }
    });
    if (simulation.weatherModel) {
      if (!checkpoint.weatherState) throw new Error("Checkpoint weather state is missing");
      const weather = checkpoint.weatherState;
      if (![weather.trackWaterDepthMm, weather.trackWetness, weather.gripPercent, weather.airTempC,
        weather.surfaceTempC, weather.relativeHumidityPercent, weather.rainfallMmPerHour,
        weather.windSpeedMps, weather.windDirectionDeg, weather.visibilityMeters].every(Number.isFinite) ||
        weather.trackWaterDepthMm < 0 || weather.trackWetness < 0 || weather.trackWetness > 1 ||
        weather.gripPercent < 0 || weather.gripPercent > 100) throw new Error("Checkpoint weather state is invalid");
      simulation.weatherStateValue = Object.freeze({ ...weather });
    } else if (checkpoint.weatherState != null) {
      throw new Error("Checkpoint contains unexpected weather state");
    }
    simulation.mutableEvents.push(...checkpoint.events.map(copyEvent));
    simulation.statusValue = checkpoint.status;
    simulation.tickValue = checkpoint.tick;

    if (simulation.statusValue === "completed" && (
      checkpoint.tick !== maxTicks ||
      simulation.mutableEntrants.some((entrant) => !entrant.finished)
    )) {
      throw new Error("Completed checkpoint contains an unfinished or incomplete race");
    }
    if (simulation.statusValue === "running" && (
      checkpoint.tick >= maxTicks ||
      simulation.mutableEntrants.some((entrant) => entrant.finished)
    )) {
      throw new Error("Running checkpoint has invalid race progress");
    }
    return simulation;
  }

  get status(): RaceSimulationStatus {
    return this.statusValue;
  }

  get tick(): number {
    return this.tickValue;
  }

  get weatherState(): WeatherState | null {
    return this.weatherStateValue ? { ...this.weatherStateValue } : null;
  }

  get events(): readonly RaceSimulationEvent[] {
    return this.mutableEvents.map(copyEvent);
  }

  get entrantStates(): readonly EntrantSimulationState[] {
    return this.mutableEntrants.map(copyEntrantState);
  }

  get classification(): readonly RaceClassificationEntry[] {
    const totalDistance = this.snapshot.circuit.segments.reduce((sum, segment) => sum + segment.distanceMeters, 0);
    const segments = this.snapshot.circuit.segments;
    const progress = (entrant: MutableEntrantState) => {
      if (entrant.finished) return this.snapshot.circuit.totalLaps * totalDistance;
      const completedThisLap = segments.slice(0, entrant.segmentIndex)
        .reduce((sum, segment) => sum + segment.distanceMeters, 0);
      return entrant.lapCompleted * totalDistance + completedThisLap;
    };

    return [...this.mutableEntrants]
      .sort((a, b) => {
        const distanceDifference = progress(b) - progress(a);
        if (distanceDifference !== 0) return distanceDifference;
        if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
        if (a.driverId < b.driverId) return -1;
        if (a.driverId > b.driverId) return 1;
        return 0;
      })
      .map((entrant, index) => ({
        position: index + 1,
        driverId: entrant.driverId,
        teamId: entrant.teamId,
        lapCompleted: entrant.lapCompleted,
        elapsedMs: entrant.elapsedMs,
        finished: entrant.finished
      }));
  }

  advanceOneSegment(): AdvanceResult {
    if (this.statusValue === "completed") {
      return { status: this.statusValue, tick: this.tickValue, eventsAdded: [], classification: this.classification };
    }

    const segments = this.snapshot.circuit.segments;
    const totalDistance = segments.reduce((sum, segment) => sum + segment.distanceMeters, 0);
    const stagedEntrants = this.mutableEntrants.map((entrant) => ({ ...entrant }));
    const stagedRandom = SeededRandom.restore(this.random.snapshot());
    const stagedEvents: RaceSimulationEvent[] = [];
    const appendEvent = (event: Omit<RaceSimulationEvent, "sequence">) => {
      stagedEvents.push({
        sequence: this.mutableEvents.length + stagedEvents.length + 1,
        ...event
      });
    };

    let globalTickDurationMs = 0;
    for (const state of stagedEntrants) {
      if (state.finished) continue;
      const entrant = this.snapshot.entrants.find((item) => item.driverId === state.driverId);
      if (!entrant) throw new Error(`Missing immutable entrant snapshot for ${state.driverId}`);

      const segment = segments[state.segmentIndex];
      const baseSegmentTimeMs = this.snapshot.circuit.targetLapTimeMs * segment.distanceMeters / totalDistance;
      const adjustmentMs = this.performanceModel.calculateAdjustmentMs({
        entrant,
        lapNumber: state.lapCompleted + 1,
        segmentIndex: state.segmentIndex,
        segmentDistanceMeters: segment.distanceMeters,
        segment,
        baseSegmentTimeMs,
        tyreState: state.tyreState ?? null,
        weatherState: this.weatherStateValue ?? null
      });
      if (!Number.isFinite(adjustmentMs)) {
        throw new Error(`Performance model returned a non-finite adjustment for ${state.driverId}`);
      }
      const noiseMs = this.config.noiseAmplitudeMs === 0
        ? 0
        : stagedRandom.nextInt(this.config.noiseAmplitudeMs * 2 + 1) - this.config.noiseAmplitudeMs;
      const durationMs = Math.round(baseSegmentTimeMs + adjustmentMs + noiseMs);
      globalTickDurationMs = Math.max(globalTickDurationMs, durationMs);
      if (durationMs <= 0) throw new Error(`Segment duration must be positive for ${state.driverId}`);

      if (this.tyreModel && state.tyreState) {
        const environment = getTyreSegmentEnvironment(
          this.tyreModel,
          state.lapCompleted + 1,
          segment.id
        );
        const tyreInput = createTyreSegmentInput(
          this.weatherStateValue
            ? { ...environment, trackWetness: this.weatherStateValue.trackWetness, surfaceTempC: this.weatherStateValue.surfaceTempC }
            : environment,
          segment.distanceMeters,
          entrant.driverAttributes.tyre_management,
          entrant.carTeamAttributes.team_tyre_management,
          entrant.carTeamAttributes.car_tyre_wear
        );
        state.tyreState = advanceTyreState(state.tyreState, tyreInput, this.tyreModel.profile);
      }

      state.elapsedMs += durationMs;
      appendEvent({
        type: "segment_completed",
        driverId: state.driverId,
        lapNumber: state.lapCompleted + 1,
        sectorNumber: segment.sectorNumber,
        segmentId: segment.id,
        simulationTimeMs: state.elapsedMs,
        durationMs
      });

      const nextSegment = segments[state.segmentIndex + 1];
      if (!nextSegment || nextSegment.sectorNumber !== segment.sectorNumber) {
        appendEvent({
          type: "sector_completed",
          driverId: state.driverId,
          lapNumber: state.lapCompleted + 1,
          sectorNumber: segment.sectorNumber,
          segmentId: segment.id,
          simulationTimeMs: state.elapsedMs
        });
      }

      if (state.segmentIndex === segments.length - 1) {
        state.lapCompleted += 1;
        state.segmentIndex = 0;
        appendEvent({
          type: "lap_completed",
          driverId: state.driverId,
          lapNumber: state.lapCompleted,
          simulationTimeMs: state.elapsedMs
        });
        if (state.lapCompleted >= this.snapshot.circuit.totalLaps) {
          state.finished = true;
          appendEvent({
            type: "race_completed",
            driverId: state.driverId,
            lapNumber: state.lapCompleted,
            simulationTimeMs: state.elapsedMs
          });
        }
      } else {
        state.segmentIndex += 1;
      }
    }

    // Commit the tick only after every entrant has advanced successfully.
    this.mutableEntrants.splice(0, this.mutableEntrants.length, ...stagedEntrants);
    this.mutableEvents.push(...stagedEvents);
    this.random = stagedRandom;
    if (this.weatherModel && this.weatherStateValue) {
      const referenceState = stagedEntrants.find((entrant) => !entrant.finished);
      const lap = referenceState ? referenceState.lapCompleted + 1 : this.snapshot.circuit.totalLaps;
      const segment = referenceState ? segments[referenceState.segmentIndex] : segments[segments.length - 1];
      const input = getWeatherInput(this.weatherModel, lap, segment.id);
      this.weatherStateValue = advanceWeatherState(
        this.weatherStateValue, input, globalTickDurationMs / 1000, this.weatherModel.profile
      );
    }
    this.tickValue += 1;
    if (this.mutableEntrants.every((entrant) => entrant.finished)) {
      this.statusValue = "completed";
    }

    return {
      status: this.statusValue,
      tick: this.tickValue,
      eventsAdded: stagedEvents.map(copyEvent),
      classification: this.classification
    };
  }

  runToCompletion(maxTicks = this.snapshot.circuit.totalLaps * this.snapshot.circuit.segments.length): readonly RaceClassificationEntry[] {
    if (!Number.isInteger(maxTicks) || maxTicks < 0) throw new RangeError("maxTicks must be a non-negative integer");
    let advanced = 0;
    while (this.statusValue === "running" && advanced < maxTicks) {
      this.advanceOneSegment();
      advanced += 1;
    }
    if (this.statusValue !== "completed") {
      throw new Error("Simulation did not complete within maxTicks");
    }
    return this.classification;
  }

  createCheckpoint(): RaceSimulationCheckpoint {
    return {
      schemaVersion: SIMULATION_CHECKPOINT_SCHEMA_VERSION,
      engineVersion: RACE_ENGINE_VERSION,
      raceId: this.snapshot.raceId,
      snapshot: this.snapshot as RaceStartSnapshot,
      config: {
        ...this.config,
        performanceModelSnapshot: cloneJsonValue(this.config.performanceModelSnapshot),
        tyreModelSnapshot: this.config.tyreModelSnapshot === null
          ? null
          : cloneJsonValue(this.config.tyreModelSnapshot)
      },
      randomState: this.random.snapshot(),
      status: this.statusValue,
      tick: this.tickValue,
      entrants: this.entrantStates,
      events: this.events,
      weatherState: this.weatherStateValue ? { ...this.weatherStateValue } : null
    };
  }
}
