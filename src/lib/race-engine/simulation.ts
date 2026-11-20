import {
  createImmutableRaceStartSnapshot,
  RACE_ENGINE_VERSION,
  validateRaceStartSnapshot
} from "./contracts";
import type {
  RaceEntrantSnapshot,
  RaceStartSnapshot
} from "./contracts";
import { SeededRandom } from "./random";
import type { RandomGeneratorState } from "./random";

export const SIMULATION_CHECKPOINT_SCHEMA_VERSION = 1;

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
  readonly baseSegmentTimeMs: number;
}

export interface SegmentPerformanceModel {
  readonly id: string;
  readonly version: string;
  calculateAdjustmentMs(context: SegmentPerformanceContext): number;
}

export const NEUTRAL_PERFORMANCE_MODEL: SegmentPerformanceModel = Object.freeze({
  id: "neutral",
  version: "1",
  calculateAdjustmentMs: () => 0
});

export interface RaceSimulationConfig {
  readonly noiseAmplitudeMs: number;
  readonly performanceModelId: string;
  readonly performanceModelVersion: string;
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
}

export interface RaceSimulationCheckpoint {
  readonly schemaVersion: typeof SIMULATION_CHECKPOINT_SCHEMA_VERSION;
  readonly engineVersion: string;
  readonly raceId: string;
  readonly snapshot: RaceStartSnapshot;
  readonly config: RaceSimulationConfig;
  readonly randomState: RandomGeneratorState;
  readonly status: RaceSimulationStatus;
  readonly tick: number;
  readonly entrants: readonly EntrantSimulationState[];
  readonly events: readonly RaceSimulationEvent[];
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
    }
  ) {
    const immutableSnapshot = createImmutableRaceStartSnapshot(snapshot);
    this.snapshot = immutableSnapshot;
    this.performanceModel = options?.performanceModel ?? NEUTRAL_PERFORMANCE_MODEL;
    const config: RaceSimulationConfig = {
      noiseAmplitudeMs: options?.config?.noiseAmplitudeMs ?? 0,
      performanceModelId: this.performanceModel.id,
      performanceModelVersion: this.performanceModel.version
    };
    if (options?.config?.performanceModelId && options.config.performanceModelId !== config.performanceModelId) {
      throw new Error("Configured performance model ID does not match the injected model");
    }
    if (options?.config?.performanceModelVersion && options.config.performanceModelVersion !== config.performanceModelVersion) {
      throw new Error("Configured performance model version does not match the injected model");
    }
    assertConfig(config);
    this.config = Object.freeze(config);
    this.random = options?.randomState
      ? SeededRandom.restore(options.randomState)
      : new SeededRandom(immutableSnapshot.seed);
    this.mutableEntrants = immutableSnapshot.entrants.map((entrant) => ({
      driverId: entrant.driverId,
      teamId: entrant.teamId,
      lapCompleted: 0,
      segmentIndex: 0,
      elapsedMs: 0,
      finished: false
    }));
  }

  static restore(
    checkpoint: RaceSimulationCheckpoint,
    performanceModel: SegmentPerformanceModel = NEUTRAL_PERFORMANCE_MODEL
  ): RaceSimulation {
    if (checkpoint.schemaVersion !== SIMULATION_CHECKPOINT_SCHEMA_VERSION) {
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
      checkpoint.config.performanceModelVersion !== performanceModel.version
    ) {
      throw new Error("Checkpoint requires the same performance model ID and version");
    }
    const validation = validateRaceStartSnapshot(checkpoint.snapshot);
    if (!validation.valid) throw new Error(`Checkpoint snapshot is invalid: ${validation.errors.join("; ")}`);

    const simulation = new RaceSimulation(checkpoint.snapshot, {
      config: checkpoint.config,
      performanceModel,
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
      if (state.finished && state.lapCompleted !== simulation.snapshot.circuit.totalLaps) {
        throw new Error(`Finished driver ${state.driverId} has not completed the race distance`);
      }
      if (!state.finished && state.lapCompleted === simulation.snapshot.circuit.totalLaps) {
        throw new Error(`Unfinished driver ${state.driverId} has completed the configured distance`);
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
    simulation.mutableEvents.push(...checkpoint.events.map(copyEvent));
    simulation.statusValue = checkpoint.status;
    simulation.tickValue = checkpoint.tick;

    if (simulation.statusValue === "completed" && simulation.mutableEntrants.some((entrant) => !entrant.finished)) {
      throw new Error("Completed checkpoint contains an unfinished entrant");
    }
    if (simulation.statusValue === "running" && simulation.mutableEntrants.every((entrant) => entrant.finished)) {
      throw new Error("Running checkpoint cannot contain only finished entrants");
    }
    return simulation;
  }

  get status(): RaceSimulationStatus {
    return this.statusValue;
  }

  get tick(): number {
    return this.tickValue;
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
        baseSegmentTimeMs
      });
      if (!Number.isFinite(adjustmentMs)) {
        throw new Error(`Performance model returned a non-finite adjustment for ${state.driverId}`);
      }
      const noiseMs = this.config.noiseAmplitudeMs === 0
        ? 0
        : stagedRandom.nextInt(this.config.noiseAmplitudeMs * 2 + 1) - this.config.noiseAmplitudeMs;
      const durationMs = Math.round(baseSegmentTimeMs + adjustmentMs + noiseMs);
      if (durationMs <= 0) throw new Error(`Segment duration must be positive for ${state.driverId}`);

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
      config: { ...this.config },
      randomState: this.random.snapshot(),
      status: this.statusValue,
      tick: this.tickValue,
      entrants: this.entrantStates,
      events: this.events
    };
  }
}
