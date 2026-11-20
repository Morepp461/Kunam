const UINT32_RANGE = 0x1_0000_0000;
const ZERO_SEED_FALLBACK = 0x6d2b79f5;

export interface RandomGeneratorState {
  readonly algorithm: "xorshift32";
  readonly state: number;
}

/**
 * Deterministic PRNG for simulation and replay.
 * Its state is serializable so a checkpoint can resume the exact random stream.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
      throw new RangeError("Seed must be an unsigned 32-bit integer");
    }
    this.state = (seed >>> 0) || ZERO_SEED_FALLBACK;
  }

  static restore(snapshot: RandomGeneratorState): SeededRandom {
    if (snapshot.algorithm !== "xorshift32") {
      throw new Error("Unsupported random generator algorithm");
    }
    if (!Number.isInteger(snapshot.state) || snapshot.state <= 0 || snapshot.state >= UINT32_RANGE) {
      throw new RangeError("Random generator state is invalid");
    }
    const generator = new SeededRandom(snapshot.state);
    generator.state = snapshot.state >>> 0;
    return generator;
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer");
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  snapshot(): RandomGeneratorState {
    return { algorithm: "xorshift32", state: this.state };
  }
}
