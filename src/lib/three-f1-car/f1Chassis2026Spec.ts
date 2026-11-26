export type AeroMode = 'z-mode' | 'x-mode';

export type AssetLodTier = 'game-low' | 'studio-high';

export type LiveryId =
  | 'rosso-corsa'
  | 'papaya-carbon'
  | 'silver-arrow'
  | 'midnight-works'
  | 'emerald-gt'
  | 'raw-prototype';

export type TireCompoundId = 'soft' | 'medium' | 'hard' | 'inter' | 'wet';

export type CameraPresetId =
  | 'hero'
  | 'side'
  | 'front-aero'
  | 'rear-diffuser'
  | 'cockpit'
  | 'top';

export type ChassisModuleId =
  | 'front_wing'
  | 'nose_monocoque'
  | 'halo_cockpit'
  | 'sidepods_engine_cover'
  | 'floor_diffuser'
  | 'rear_wing'
  | 'suspension_system'
  | 'wheels_tires';

export interface LodSegmentBudget {
  id: AssetLodTier;
  label: string;
  loftRadial: number;
  tireRadial: number;
  airfoilSteps: number;
  bevelSegments: number;
  haloTubular: number;
  haloRadial: number;
  strutRadial: number;
  discRadial: number;
}

export function getLodSegmentBudget(tier: AssetLodTier): LodSegmentBudget {
  if (tier === 'game-low') {
    return {
      id: 'game-low',
      label: 'Game Low-Poly',
      loftRadial: 12,
      tireRadial: 18,
      airfoilSteps: 7,
      bevelSegments: 1,
      haloTubular: 20,
      haloRadial: 6,
      strutRadial: 5,
      discRadial: 12,
    };
  }
  return {
    id: 'studio-high',
    label: 'High Detail',
    loftRadial: 26,
    tireRadial: 36,
    airfoilSteps: 16,
    bevelSegments: 2,
    haloTubular: 44,
    haloRadial: 12,
    strutRadial: 10,
    discRadial: 24,
  };
}

export interface LiveryPreset {
  id: LiveryId;
  name: string;
  teamTag: string;
  primary: string;
  secondary: string;
  accent: string;
  numberText: string;
  clearcoat: number;
  metalness: number;
  roughness: number;
  rimAccent: string;
}

export interface TireCompoundSpec {
  id: TireCompoundId;
  label: string;
  code: string;
  stripeColor: string;
  treadGrooves: boolean;
}

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface ChassisModuleMeta {
  id: ChassisModuleId;
  label: string;
  specNote: string;
  explodeOffset: [number, number, number];
}

/**
 * Authentic 2026 FIA Formula 1 Technical Regulations Dimensions (meters, 1 unit = 1m).
 * Car coordinate convention: +Z = Forward (Nose), +Y = Up, +X = Left (Driver's Right when facing +Z is -X).
 * Ground contact plane is Y = 0.000.
 */
export const F1_2026_DIMENSIONS = {
  wheelbase: 3.4,
  frontAxleZ: 1.7,
  rearAxleZ: -1.7,
  maxWidth: 1.9,
  frontTrackHalf: 0.78,
  rearTrackHalf: 0.75,
  wheelRadius: 0.352,
  frontTireWidth: 0.305,
  rearTireWidth: 0.405,
  rimRadius: 0.228,
  frontWingSpan: 1.8,
  rearWingSpan: 0.96,
  floorRideHeight: 0.045,
  totalLength: 5.05,
} as const;

export const LIVERY_PRESETS: readonly LiveryPreset[] = [
  {
    id: 'rosso-corsa',
    name: 'Scuderia Rosso',
    teamTag: 'Maranello Spec',
    primary: '#d4121f',
    secondary: '#14161b',
    accent: '#fbbf24',
    numberText: '16',
    clearcoat: 1.0,
    metalness: 0.35,
    roughness: 0.16,
    rimAccent: '#ef4444',
  },
  {
    id: 'papaya-carbon',
    name: 'Papaya Spark',
    teamTag: 'Woking Aero',
    primary: '#ff6b00',
    secondary: '#12151a',
    accent: '#22d3ee',
    numberText: '04',
    clearcoat: 0.95,
    metalness: 0.28,
    roughness: 0.18,
    rimAccent: '#ff6b00',
  },
  {
    id: 'silver-arrow',
    name: 'Brushed Silver',
    teamTag: 'Brackley Works',
    primary: '#b8c2cc',
    secondary: '#101418',
    accent: '#00d2be',
    numberText: '63',
    clearcoat: 0.9,
    metalness: 0.85,
    roughness: 0.2,
    rimAccent: '#00d2be',
  },
  {
    id: 'midnight-works',
    name: 'Midnight Cobalt',
    teamTag: 'Milton Keynes',
    primary: '#162447',
    secondary: '#0f131a',
    accent: '#f59e0b',
    numberText: '01',
    clearcoat: 0.85,
    metalness: 0.45,
    roughness: 0.24,
    rimAccent: '#f59e0b',
  },
  {
    id: 'emerald-gt',
    name: 'British Emerald',
    teamTag: 'Silverstone Spec',
    primary: '#045d4a',
    secondary: '#101615',
    accent: '#a3e635',
    numberText: '14',
    clearcoat: 1.0,
    metalness: 0.6,
    roughness: 0.16,
    rimAccent: '#a3e635',
  },
  {
    id: 'raw-prototype',
    name: 'Raw Carbon Test',
    teamTag: 'Pre-Season Mule',
    primary: '#1e2229',
    secondary: '#111317',
    accent: '#f97316',
    numberText: '26',
    clearcoat: 0.35,
    metalness: 0.15,
    roughness: 0.38,
    rimAccent: '#f97316',
  },
] as const;

export const TIRE_COMPOUNDS: readonly TireCompoundSpec[] = [
  { id: 'soft', label: 'Soft', code: 'S', stripeColor: '#ef4444', treadGrooves: false },
  { id: 'medium', label: 'Medium', code: 'M', stripeColor: '#facc15', treadGrooves: false },
  { id: 'hard', label: 'Hard', code: 'H', stripeColor: '#f8fafc', treadGrooves: false },
  { id: 'inter', label: 'Inter', code: 'I', stripeColor: '#22c55e', treadGrooves: true },
  { id: 'wet', label: 'Wet', code: 'W', stripeColor: '#38bdf8', treadGrooves: true },
] as const;

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  {
    id: 'hero',
    label: '3/4 Hero',
    position: [4.35, 1.65, 4.05],
    target: [0, 0.34, 0.15],
    fov: 38,
  },
  {
    id: 'side',
    label: 'Side Profile',
    position: [5.15, 0.72, 0.0],
    target: [0, 0.42, 0.0],
    fov: 34,
  },
  {
    id: 'front-aero',
    label: 'Front Aero',
    position: [1.35, 0.78, 4.15],
    target: [0, 0.32, 1.65],
    fov: 38,
  },
  {
    id: 'rear-diffuser',
    label: 'Rear Diffuser',
    position: [-1.85, 0.92, -3.75],
    target: [0, 0.42, -1.55],
    fov: 40,
  },
  {
    id: 'cockpit',
    label: 'Cockpit Halo',
    position: [1.15, 1.45, 0.95],
    target: [0, 0.56, -0.05],
    fov: 42,
  },
  {
    id: 'top',
    label: 'Top Plan',
    position: [0.0, 5.95, 0.01],
    target: [0, 0.25, 0.0],
    fov: 40,
  },
] as const;

export const CHASSIS_MODULES: readonly ChassisModuleMeta[] = [
  {
    id: 'front_wing',
    label: 'Front Wing (Active)',
    specNote: '1800mm span · 3-element active X/Z flaps',
    explodeOffset: [0, 0.16, 0.95],
  },
  {
    id: 'nose_monocoque',
    label: 'Survival Cell & Nose',
    specNote: 'Carbon monocoque · Spoon nosecone',
    explodeOffset: [0, 0.35, 0.28],
  },
  {
    id: 'halo_cockpit',
    label: 'Halo, Cockpit & Driver',
    specNote: 'Grade-5 Ti Halo · Telemetry wheel & helmet',
    explodeOffset: [0, 0.88, 0.0],
  },
  {
    id: 'sidepods_engine_cover',
    label: 'Sidepods & Engine Cover',
    specNote: 'Downwash undercut · 2026 50/50 PU packaging',
    explodeOffset: [0, 0.52, -0.18],
  },
  {
    id: 'floor_diffuser',
    label: 'Venturi Floor & Diffuser',
    specNote: 'Flatter 2026 floor · Multi-vane rear diffuser',
    explodeOffset: [0, -0.22, 0.0],
  },
  {
    id: 'rear_wing',
    label: 'Rear Wing (Active)',
    specNote: '3-element active aero · Swan-neck pylon',
    explodeOffset: [0, 0.62, -0.92],
  },
  {
    id: 'suspension_system',
    label: 'Double Wishbone & Brakes',
    specNote: 'Carbon A-arms · Pushrods & ventilated discs',
    explodeOffset: [0, 0.12, 0.0],
  },
  {
    id: 'wheels_tires',
    label: '18" Wheels & Aero Covers',
    specNote: '305mm F / 405mm R · 704mm OD Pirelli spec',
    explodeOffset: [0, 0.0, 0.0],
  },
] as const;

export function getLiveryPreset(id: LiveryId): LiveryPreset {
  return LIVERY_PRESETS.find((l) => l.id === id) ?? LIVERY_PRESETS[0];
}

export function getTireCompound(id: TireCompoundId): TireCompoundSpec {
  return TIRE_COMPOUNDS.find((t) => t.id === id) ?? TIRE_COMPOUNDS[0];
}

export function getCameraPreset(id: CameraPresetId): CameraPreset {
  return CAMERA_PRESETS.find((c) => c.id === id) ?? CAMERA_PRESETS[0];
}

/**
 * Computes front & rear flap pitch angles (radians) for 2026 Active Aero modes.
 * Z-mode = High downforce cornering angle; X-mode = Flattened straight-line low-drag angle.
 */
export function getAeroFlapAngles(mode: AeroMode): {
  frontFlap1Pitch: number;
  frontFlap2Pitch: number;
  rearFlapPitch: number;
} {
  if (mode === 'x-mode') {
    return {
      frontFlap1Pitch: -0.24,
      frontFlap2Pitch: -0.42,
      rearFlapPitch: -0.58,
    };
  }
  return {
    frontFlap1Pitch: 0.0,
    frontFlap2Pitch: 0.0,
    rearFlapPitch: 0.0,
  };
}

/**
 * Computes Ackermann-approximated front wheel steer angles (left, right) in radians
 * given a normalized steering input (-1 to +1) and max lock angle.
 */
export function computeAckermannSteerAngles(
  steerNormalized: number,
  maxLockRad = 0.42,
): { leftRad: number; rightRad: number } {
  const clamped = Math.max(-1, Math.min(1, steerNormalized));
  const base = clamped * maxLockRad;
  if (Math.abs(base) < 1e-4) {
    return { leftRad: 0, rightRad: 0 };
  }
  const innerBoost = 1.12;
  const outerReduce = 0.92;
  if (base > 0) {
    // Turning left (+X in +Z forward system)
    return {
      leftRad: base * innerBoost,
      rightRad: base * outerReduce,
    };
  }
  return {
    leftRad: base * outerReduce,
    rightRad: base * innerBoost,
  };
}

/**
 * Computes wheel angular velocity (rad/s) from vehicle linear speed (km/h).
 */
export function speedKmhToWheelOmega(speedKmh: number): number {
  const metersPerSec = (Math.max(0, speedKmh) * 1000) / 3600;
  return metersPerSec / F1_2026_DIMENSIONS.wheelRadius;
}

/**
 * Generates clean, copyable Three.js integration snippet (with Draco + KTX2) for user's web game.
 */
export function generateGameIntegrationSnippet(
  liveryId: LiveryId,
  compoundId: TireCompoundId,
  lodTier: AssetLodTier = 'game-low',
): string {
  return `import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// Option A: Load exported & compressed .glb (Recommended for multi-car grids)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.175.0/examples/jsm/libs/basis/');
ktx2Loader.detectSupport(renderer);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setKTX2Loader(ktx2Loader);

const gltf = await loader.loadAsync('/assets/f1-2026-${liveryId}-opt.glb');
const car = gltf.scene; // 1 unit = 1m, +Z forward, Y=0 ground contact
scene.add(car);

// Option B: Procedural prefab directly in code (Zero network download)
// createF1Car2026({ livery: '${liveryId}', tireCompound: '${compoundId}', lod: '${lodTier}' })`;
}

export function generateGltfCompressCliCommand(liveryId: LiveryId): string {
  return `# 1. Kompresi Geometri (Meshopt / Draco) + Tekstur GPU (KTX2 BasisU) via gltf-transform
npx @gltf-transform/cli optimize f1-2026-${liveryId}.glb f1-2026-${liveryId}-opt.glb \\
  --compress meshopt \\
  --texture-compress ktx2 \\
  --texture-size 512

# Alternatif Draco + WebP (kompatibel luas tanpa transcoder Basis):
npx @gltf-transform/cli optimize f1-2026-${liveryId}.glb f1-2026-${liveryId}-draco.glb \\
  --compress draco \\
  --texture-compress webp \\
  --texture-size 512`;
}
