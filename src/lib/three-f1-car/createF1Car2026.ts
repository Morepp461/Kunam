import * as THREE from 'three';
import {
  AeroMode,
  AssetLodTier,
  CHASSIS_MODULES,
  ChassisModuleId,
  F1_2026_DIMENSIONS,
  LiveryId,
  TireCompoundId,
  computeAckermannSteerAngles,
  getAeroFlapAngles,
  getLiveryPreset,
  getLodSegmentBudget,
  getTireCompound,
  speedKmhToWheelOmega,
} from './f1Chassis2026Spec';
import { CrashEffectState, SponsorSlotConfig, SponsorSlotId } from './f1Decals';
import {
  F1AppearanceConfig,
  F1MaterialLibrary,
  appearanceFromPreset,
  createF1MaterialLibrary,
} from './f1Materials';

export interface CreateF1CarOptions {
  livery?: LiveryId;
  tireCompound?: TireCompoundId;
  aeroMode?: AeroMode;
  lod?: AssetLodTier;
  maxAnisotropy?: number;
  appearance?: F1AppearanceConfig;
  crashState?: CrashEffectState;
}

export interface AssetMeshStats {
  meshes: number;
  triangles: number;
  vertices: number;
  subAssemblies: number;
}

export interface F1Car2026Asset {
  group: THREE.Group;
  modules: Record<ChassisModuleId, THREE.Group>;
  materials: F1MaterialLibrary;
  setLivery: (id: LiveryId) => void;
  setAppearance: (cfg: F1AppearanceConfig, onAsyncReady?: () => void) => void;
  setCrashState: (state: CrashEffectState) => void;
  setTireCompound: (id: TireCompoundId) => void;
  setAeroMode: (mode: AeroMode) => void;
  setExplodeFactor: (factor: number) => void;
  setModuleVisibility: (id: ChassisModuleId, visible: boolean) => void;
  updateAnimation: (dt: number, speedKmh: number, steerNormalized: number) => void;
  getStats: () => AssetMeshStats;
  dispose: () => void;
}

interface LoftStation {
  z: number;
  halfWidth: number;
  topY: number;
  bottomY: number;
  topCrown?: number;
  bottomCurve?: number;
  shoulderBias?: number;
  xOffset?: number;
}

function createLoftedBodyGeometry(
  stations: LoftStation[],
  radialSegments = 24,
): THREE.BufferGeometry {
  const sorted = [...stations].sort((a, b) => a.z - b.z);
  const ringCount = sorted.length;
  const ptsPerRing = radialSegments + 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < ringCount; i++) {
    const s = sorted[i];
    const vCoord = i / (ringCount - 1);
    const midY = (s.topY + s.bottomY) * 0.5;
    const halfH = Math.max(0.004, (s.topY - s.bottomY) * 0.5);
    const crown = s.topCrown ?? 0.65;
    const bCurve = s.bottomCurve ?? 0.2;
    const bias = s.shoulderBias ?? 0;
    const xOff = s.xOffset ?? 0;

    for (let j = 0; j <= radialSegments; j++) {
      const uCoord = j / radialSegments;
      const theta = uCoord * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const xShape = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.72);
      const widthMod = 1 + bias * 0.18 * sinT;
      const x = xOff + xShape * s.halfWidth * widthMod;

      let yOffset: number;
      if (sinT >= 0) {
        yOffset = Math.pow(sinT, crown) * halfH;
      } else {
        yOffset = -Math.pow(-sinT, bCurve) * halfH;
      }
      const y = midY + yOffset;

      positions.push(x, y, s.z);
      uvs.push(uCoord, vCoord);
    }
  }

  for (let i = 0; i < ringCount - 1; i++) {
    const row0 = i * ptsPerRing;
    const row1 = (i + 1) * ptsPerRing;
    for (let j = 0; j < radialSegments; j++) {
      const a = row0 + j;
      const b = row0 + j + 1;
      const c = row1 + j;
      const d = row1 + j + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const rearCenterIdx = positions.length / 3;
  const s0 = sorted[0];
  positions.push(s0.xOffset ?? 0, (s0.topY + s0.bottomY) * 0.5, s0.z);
  uvs.push(0.5, 0);
  for (let j = 0; j < radialSegments; j++) {
    indices.push(rearCenterIdx, j + 1, j);
  }

  const frontCenterIdx = positions.length / 3;
  const sLast = sorted[ringCount - 1];
  const lastRow = (ringCount - 1) * ptsPerRing;
  positions.push(sLast.xOffset ?? 0, (sLast.topY + sLast.bottomY) * 0.5, sLast.z);
  uvs.push(0.5, 1);
  for (let j = 0; j < radialSegments; j++) {
    indices.push(frontCenterIdx, lastRow + j, lastRow + j + 1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createAirfoilSpanGeometry(
  chord: number,
  thickness: number,
  span: number,
  camber = 0.03,
  steps = 12,
  bevelSegments = 1,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(chord * 0.5, 0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = chord * (0.5 - t);
    const yt = thickness * 1.45 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * Math.pow(t, 3) - 0.1015 * Math.pow(t, 4));
    const yc = camber * 4 * t * (1 - t);
    shape.lineTo(x, yc + yt);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const t = i / steps;
    const x = chord * (0.5 - t);
    const yt = thickness * 1.45 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * Math.pow(t, 3) - 0.1015 * Math.pow(t, 4));
    const yc = camber * 4 * t * (1 - t);
    shape.lineTo(x, yc - yt * 0.6);
  }
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: span,
    bevelEnabled: bevelSegments > 0,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments,
    curveSegments: Math.max(4, Math.floor(steps * 0.65)),
  });
  geom.translate(0, 0, -span * 0.5);
  geom.rotateY(-Math.PI * 0.5);
  geom.computeVertexNormals();
  return geom;
}

function createStrutMesh(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  radiusX: number,
  radiusY: number,
  material: THREE.Material,
  radialSegments = 8,
): THREE.Mesh {
  const dist = p1.distanceTo(p2);
  const geom = new THREE.CylinderGeometry(radiusX, radiusX, dist, radialSegments, 1);
  geom.scale(1, 1, radiusY / radiusX);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
  const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.castShadow = true;
  return mesh;
}

export function createF1Car2026(options: CreateF1CarOptions = {}): F1Car2026Asset {
  const lod = getLodSegmentBudget(options.lod ?? 'game-low');
  const liveryPreset = getLiveryPreset(options.livery ?? 'rosso-corsa');
  const tireSpec = getTireCompound(options.tireCompound ?? 'soft');
  const initialAppearance = options.appearance ?? appearanceFromPreset(liveryPreset);
  const materials = createF1MaterialLibrary(
    liveryPreset,
    tireSpec,
    options.maxAnisotropy ?? 4,
    initialAppearance,
  );

  const rootGroup = new THREE.Group();
  rootGroup.name = 'F1_2026_Chassis';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometriesToDispose.push(g);
    return g;
  };

  const modules: Record<ChassisModuleId, THREE.Group> = {
    front_wing: new THREE.Group(),
    nose_monocoque: new THREE.Group(),
    halo_cockpit: new THREE.Group(),
    sidepods_engine_cover: new THREE.Group(),
    floor_diffuser: new THREE.Group(),
    rear_wing: new THREE.Group(),
    suspension_system: new THREE.Group(),
    wheels_tires: new THREE.Group(),
  };

  (Object.keys(modules) as ChassisModuleId[]).forEach((key) => {
    modules[key].name = key;
    rootGroup.add(modules[key]);
  });

  // Track 8 distinct sponsor slot meshes (independently toggleable & swappable)
  const sponsorSlotMeshes: Record<SponsorSlotId, THREE.Mesh[]> = {
    'slot-1': [],
    'slot-2': [],
    'slot-3': [],
    'slot-4': [],
    'slot-5': [],
    'slot-6': [],
    'slot-7': [],
    'slot-8': [],
  };

  // =========================================================================
  // 1. FRONT WING (2026 1800mm Narrower Active Wing + Breakaway Crash Pivots)
  // =========================================================================
  const frontWing = modules.front_wing;
  const fwSpan = F1_2026_DIMENSIONS.frontWingSpan;
  const fwBreakX = 0.21;
  const fwOuterSpan = fwSpan * 0.5 - fwBreakX;
  const fwCenterSpan = fwBreakX * 2;

  const applyFrontWingSweep = (geom: THREE.BufferGeometry, worldXOffset: number) => {
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + worldXOffset;
      const normX = Math.abs(x) / (fwSpan * 0.5);
      const sweepZ = -0.14 * normX * normX;
      const spoonY = 0.022 * Math.min(1, normX * 2.2);
      pos.setZ(i, pos.getZ(i) + sweepZ);
      pos.setY(i, pos.getY(i) + spoonY);
    }
    geom.computeVertexNormals();
  };

  // Center wing section attached beneath nose
  const fwCenterGeo = trackGeo(
    createAirfoilSpanGeometry(0.24, 0.026, fwCenterSpan, 0.018, lod.airfoilSteps, lod.bevelSegments),
  );
  applyFrontWingSweep(fwCenterGeo, 0);
  const fwCenter = new THREE.Mesh(fwCenterGeo, materials.carbonWeave);
  fwCenter.name = 'front_wing_mainplane_center';
  fwCenter.position.set(0, 0.088, 2.45);
  fwCenter.castShadow = true;
  fwCenter.receiveShadow = true;
  frontWing.add(fwCenter);

  const frontFlap1Pivots: THREE.Group[] = [];
  const frontFlap2Pivots: THREE.Group[] = [];
  const fwHalf = fwSpan * 0.5 - 0.14;

  let fwLeftBreakPivot!: THREE.Group;
  let fwRightBreakPivot!: THREE.Group;
  let fwLeftFractureStub!: THREE.Mesh;
  let fwRightFractureStub!: THREE.Mesh;

  [-1, 1].forEach((side) => {
    const breakPivot = new THREE.Group();
    breakPivot.name = side > 0 ? 'front_wing_break_L' : 'front_wing_break_R';
    breakPivot.position.set(side * fwBreakX, 0.088, 2.40);
    frontWing.add(breakPivot);

    if (side > 0) fwLeftBreakPivot = breakPivot;
    else fwRightBreakPivot = breakPivot;

    // Jagged fracture stub exposed when broken
    const stubGeo = trackGeo(new THREE.ConeGeometry(0.032, 0.12, 5));
    stubGeo.rotateZ(side * Math.PI * 0.5);
    const stubMesh = new THREE.Mesh(stubGeo, materials.carbonMatte);
    stubMesh.name = side > 0 ? 'front_wing_fracture_L' : 'front_wing_fracture_R';
    stubMesh.position.set(0, 0.015, 0.02);
    stubMesh.visible = false;
    breakPivot.add(stubMesh);
    if (side > 0) fwLeftFractureStub = stubMesh;
    else fwRightFractureStub = stubMesh;

    // Outer Mainplane segment
    const outerCenterWorldX = side * (fwBreakX + fwOuterSpan * 0.5);
    const fwOuterGeo = trackGeo(
      createAirfoilSpanGeometry(0.24, 0.026, fwOuterSpan, 0.018, lod.airfoilSteps, lod.bevelSegments),
    );
    applyFrontWingSweep(fwOuterGeo, outerCenterWorldX);
    const fwOuter = new THREE.Mesh(fwOuterGeo, materials.carbonWeave);
    fwOuter.name = side > 0 ? 'front_wing_mainplane_L' : 'front_wing_mainplane_R';
    fwOuter.position.set(outerCenterWorldX - side * fwBreakX, 0, 0.05);
    fwOuter.castShadow = true;
    fwOuter.receiveShadow = true;
    breakPivot.add(fwOuter);

    // Active Aero Front Flaps relative to breakPivot
    const flap1Pivot = new THREE.Group();
    flap1Pivot.name = side < 0 ? 'front_flap_1_R' : 'front_flap_1_L';
    flap1Pivot.position.set(side * (fwHalf * 0.5 + 0.09 - fwBreakX), 0.122 - 0.088, 2.31 - 2.40);
    flap1Pivot.rotation.y = side * -0.09;
    flap1Pivot.rotation.z = side * 0.04;

    const f1Geo = trackGeo(createAirfoilSpanGeometry(0.14, 0.016, fwHalf, 0.014, lod.airfoilSteps, lod.bevelSegments));
    const f1Mesh = new THREE.Mesh(f1Geo, materials.liveryPrimary);
    f1Mesh.rotation.x = 0.22;
    f1Mesh.position.set(0, 0.01, -0.04);
    f1Mesh.castShadow = true;
    flap1Pivot.add(f1Mesh);
    breakPivot.add(flap1Pivot);
    frontFlap1Pivots.push(flap1Pivot);

    const flap2Pivot = new THREE.Group();
    flap2Pivot.name = side < 0 ? 'front_flap_2_R' : 'front_flap_2_L';
    flap2Pivot.position.set(side * (fwHalf * 0.5 + 0.1 - fwBreakX), 0.155 - 0.088, 2.2 - 2.40);
    flap2Pivot.rotation.y = side * -0.11;
    flap2Pivot.rotation.z = side * 0.05;

    const f2Geo = trackGeo(createAirfoilSpanGeometry(0.125, 0.014, fwHalf * 0.96, 0.012, lod.airfoilSteps, lod.bevelSegments));
    const f2Mesh = new THREE.Mesh(f2Geo, materials.liveryAccent);
    f2Mesh.rotation.x = 0.36;
    f2Mesh.position.set(0, 0.014, -0.04);
    f2Mesh.castShadow = true;
    flap2Pivot.add(f2Mesh);
    breakPivot.add(flap2Pivot);
    frontFlap2Pivots.push(flap2Pivot);

    // Swept Front Wing Endplate + Footplate
    const epShape = new THREE.Shape();
    epShape.moveTo(0.28, 0.0);
    epShape.quadraticCurveTo(0.32, 0.11, 0.22, 0.21);
    epShape.lineTo(-0.24, 0.26);
    epShape.quadraticCurveTo(-0.34, 0.16, -0.32, 0.0);
    epShape.closePath();

    const epGeo = trackGeo(
      new THREE.ExtrudeGeometry(epShape, {
        depth: 0.016,
        bevelEnabled: lod.bevelSegments > 0,
        bevelThickness: 0.004,
        bevelSize: 0.004,
        bevelSegments: lod.bevelSegments,
        curveSegments: Math.max(4, Math.floor(lod.airfoilSteps * 0.7)),
      }),
    );
    epGeo.translate(0, 0, -0.008);
    epGeo.rotateY(-Math.PI * 0.5);
    const epMesh = new THREE.Mesh(epGeo, materials.liveryPrimary);
    epMesh.name = side < 0 ? 'front_endplate_R' : 'front_endplate_L';
    epMesh.position.set(side * (fwSpan * 0.5 - fwBreakX), 0.082 - 0.088, 2.28 - 2.40);
    epMesh.rotation.y = side * -0.06;
    epMesh.castShadow = true;
    breakPivot.add(epMesh);

    const fpGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.01, 0.52));
    const fpMesh = new THREE.Mesh(fpGeo, materials.carbonMatte);
    fpMesh.position.set(side * (fwSpan * 0.5 - 0.03 - fwBreakX), 0.08 - 0.088, 2.28 - 2.40);
    breakPivot.add(fpMesh);
  });

  // =========================================================================
  // 2. NOSECONE & SURVIVAL CELL MONOCOQUE
  // =========================================================================
  const noseMonocoque = modules.nose_monocoque;

  const monocoqueStations: LoftStation[] = [
    { z: -0.38, halfWidth: 0.28, topY: 0.64, bottomY: 0.12, topCrown: 0.55, bottomCurve: 0.2, shoulderBias: 0.2 },
    { z: 0.12, halfWidth: 0.275, topY: 0.62, bottomY: 0.11, topCrown: 0.45, bottomCurve: 0.2, shoulderBias: 0.25 },
    { z: 0.65, halfWidth: 0.255, topY: 0.6, bottomY: 0.12, topCrown: 0.55, bottomCurve: 0.25, shoulderBias: 0.2 },
    { z: 1.15, halfWidth: 0.22, topY: 0.54, bottomY: 0.14, topCrown: 0.65, bottomCurve: 0.3, shoulderBias: 0.1 },
    { z: 1.62, halfWidth: 0.175, topY: 0.43, bottomY: 0.145, topCrown: 0.7, bottomCurve: 0.35, shoulderBias: 0.0 },
    { z: 2.05, halfWidth: 0.135, topY: 0.31, bottomY: 0.135, topCrown: 0.75, bottomCurve: 0.35, shoulderBias: -0.1 },
    { z: 2.42, halfWidth: 0.095, topY: 0.195, bottomY: 0.11, topCrown: 0.8, bottomCurve: 0.4, shoulderBias: -0.15 },
    { z: 2.64, halfWidth: 0.055, topY: 0.145, bottomY: 0.092, topCrown: 0.85, bottomCurve: 0.5, shoulderBias: -0.15 },
  ];
  const monoGeo = trackGeo(createLoftedBodyGeometry(monocoqueStations, lod.loftRadial));
  const monoMesh = new THREE.Mesh(monoGeo, materials.liveryPrimary);
  monoMesh.name = 'monocoque_nosecone';
  monoMesh.castShadow = true;
  monoMesh.receiveShadow = true;
  noseMonocoque.add(monoMesh);

  const noseTipGeo = trackGeo(
    createLoftedBodyGeometry(
      [
        { z: 2.45, halfWidth: 0.09, topY: 0.188, bottomY: 0.108, topCrown: 0.8, bottomCurve: 0.4 },
        { z: 2.66, halfWidth: 0.048, topY: 0.14, bottomY: 0.09, topCrown: 0.85, bottomCurve: 0.5 },
      ],
      lod.loftRadial,
    ),
  );
  const noseTipMesh = new THREE.Mesh(noseTipGeo, materials.carbonWeave);
  noseTipMesh.name = 'nose_crash_tip';
  noseMonocoque.add(noseTipMesh);

  // Nose Racing Number Plate Decal
  const numberPlaneGeo = trackGeo(new THREE.PlaneGeometry(0.175, 0.175));
  const numberPlane = new THREE.Mesh(numberPlaneGeo, materials.noseNumberDecal);
  numberPlane.name = 'nose_number_decal';
  numberPlane.position.set(0, 0.39, 1.85);
  numberPlane.rotation.x = -Math.PI * 0.5 + 0.275;
  noseMonocoque.add(numberPlane);

  // Sponsor Slot 1: Front Nose Tip
  const noseTipSponsorMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.135, 0.045)),
    materials.sponsorSlotMaterials['slot-1'],
  );
  noseTipSponsorMesh.name = 'sponsor_slot_1_nose_tip';
  noseTipSponsorMesh.position.set(0, 0.274, 2.24);
  noseTipSponsorMesh.rotation.x = -Math.PI * 0.5 + 0.3;
  noseMonocoque.add(noseTipSponsorMesh);
  sponsorSlotMeshes['slot-1'].push(noseTipSponsorMesh);

  // Sponsor Slot 2: Nose Upper Monocoque (ahead of Halo)
  const noseUpperSponsorMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.21, 0.068)),
    materials.sponsorSlotMaterials['slot-2'],
  );
  noseUpperSponsorMesh.name = 'sponsor_slot_2_nose_upper';
  noseUpperSponsorMesh.position.set(0, 0.538, 1.24);
  noseUpperSponsorMesh.rotation.x = -Math.PI * 0.5 + 0.23;
  noseMonocoque.add(noseUpperSponsorMesh);
  sponsorSlotMeshes['slot-2'].push(noseUpperSponsorMesh);

  [-1, 1].forEach((side) => {
    const camGeo = trackGeo(new THREE.BoxGeometry(0.055, 0.014, 0.09));
    const camPod = new THREE.Mesh(camGeo, materials.carbonWeave);
    camPod.position.set(side * 0.145, 0.25, 2.02);
    noseMonocoque.add(camPod);
  });
  const pitot = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.004, 0.005, 0.14, 8)),
    materials.chromeSteel,
  );
  pitot.rotation.x = Math.PI * 0.5 - 0.15;
  pitot.position.set(0, 0.51, 1.48);
  noseMonocoque.add(pitot);

  // =========================================================================
  // 3. HALO, COCKPIT, STEERING WHEEL, DRIVER HELMET & AIRBOX
  // =========================================================================
  const haloCockpit = modules.halo_cockpit;

  const cockpitWell = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.38, 0.06, 0.72)),
    materials.carbonMatte,
  );
  cockpitWell.position.set(0, 0.59, 0.15);
  haloCockpit.add(cockpitWell);

  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.23, 0.63, -0.22),
    new THREE.Vector3(-0.25, 0.74, 0.12),
    new THREE.Vector3(-0.17, 0.76, 0.44),
    new THREE.Vector3(0.0, 0.735, 0.62),
    new THREE.Vector3(0.17, 0.76, 0.44),
    new THREE.Vector3(0.25, 0.74, 0.12),
    new THREE.Vector3(0.23, 0.63, -0.22),
  ]);
  const haloTubeGeo = trackGeo(new THREE.TubeGeometry(haloCurve, lod.haloTubular, 0.024, lod.haloRadial, false));
  const haloMesh = new THREE.Mesh(haloTubeGeo, materials.carbonWeave);
  haloMesh.name = 'halo_titanium_loop';
  haloMesh.castShadow = true;
  haloCockpit.add(haloMesh);

  const haloStrutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.57, 0.74),
    new THREE.Vector3(0, 0.66, 0.68),
    new THREE.Vector3(0, 0.735, 0.61),
  ]);
  const haloStrutGeo = trackGeo(new THREE.TubeGeometry(haloStrutCurve, Math.max(6, Math.floor(lod.haloTubular * 0.35)), 0.02, lod.haloRadial, false));
  const haloStrut = new THREE.Mesh(haloStrutGeo, materials.titanium);
  haloStrut.name = 'halo_front_pylon';
  haloStrut.castShadow = true;
  haloCockpit.add(haloStrut);

  const airboxGeo = trackGeo(
    createLoftedBodyGeometry(
      [
        { z: -0.58, halfWidth: 0.14, topY: 0.96, bottomY: 0.62, topCrown: 0.85, bottomCurve: 0.2 },
        { z: -0.34, halfWidth: 0.125, topY: 0.98, bottomY: 0.62, topCrown: 0.9, bottomCurve: 0.2 },
        { z: -0.18, halfWidth: 0.1, topY: 0.94, bottomY: 0.63, topCrown: 0.9, bottomCurve: 0.2 },
      ],
      lod.loftRadial,
    ),
  );
  const airboxMesh = new THREE.Mesh(airboxGeo, materials.liveryPrimary);
  airboxMesh.name = 'roll_hoop_airbox';
  airboxMesh.castShadow = true;
  haloCockpit.add(airboxMesh);

  const intakeMouth = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.082, lod.loftRadial)),
    materials.carbonMatte,
  );
  intakeMouth.position.set(0, 0.82, -0.178);
  haloCockpit.add(intakeMouth);

  const tCamStem = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.028, 0.075, 0.08)),
    materials.carbonWeave,
  );
  tCamStem.position.set(0, 1.0, -0.34);
  haloCockpit.add(tCamStem);

  const tCamBar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.24, 0.022, 0.042)),
    materials.liveryAccent,
  );
  tCamBar.position.set(0, 1.045, -0.34);
  haloCockpit.add(tCamBar);

  const helmetGroup = new THREE.Group();
  helmetGroup.name = 'driver_helmet';
  helmetGroup.position.set(0, 0.64, 0.03);

  const helmetSphere = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.118, lod.tireRadial, Math.max(10, Math.floor(lod.tireRadial * 0.7)))),
    materials.helmetShell,
  );
  helmetSphere.scale.set(0.95, 1.0, 1.12);
  helmetSphere.castShadow = true;
  helmetGroup.add(helmetSphere);

  const visorGeo = trackGeo(
    new THREE.CylinderGeometry(0.117, 0.116, 0.068, lod.loftRadial, 1, true, -Math.PI * 0.34, Math.PI * 0.68),
  );
  const visorMesh = new THREE.Mesh(visorGeo, materials.visorIridescent);
  visorMesh.position.set(0, 0.012, 0.024);
  helmetGroup.add(visorMesh);

  const hansCollar = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.125, 0.028, lod.haloRadial, lod.loftRadial, Math.PI * 1.3)),
    materials.carbonMatte,
  );
  hansCollar.rotation.x = Math.PI * 0.5;
  hansCollar.rotation.z = -Math.PI * 0.15;
  hansCollar.position.set(0, -0.085, -0.01);
  helmetGroup.add(hansCollar);
  haloCockpit.add(helmetGroup);

  const steeringWheelGroup = new THREE.Group();
  steeringWheelGroup.name = 'steering_wheel';
  steeringWheelGroup.position.set(0, 0.555, 0.42);
  steeringWheelGroup.rotation.x = -0.36;

  const swBody = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.255, 0.145, 0.022)),
    materials.carbonWeave,
  );
  steeringWheelGroup.add(swBody);

  const swScreen = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.12, 0.062)),
    materials.steeringDisplay,
  );
  swScreen.position.set(0, 0.015, -0.012);
  swScreen.rotation.y = Math.PI;
  steeringWheelGroup.add(swScreen);

  [-1, 1].forEach((side) => {
    const grip = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.018, 0.08, 4, lod.haloRadial)),
      materials.carbonMatte,
    );
    grip.position.set(side * 0.122, -0.008, 0);
    steeringWheelGroup.add(grip);
  });
  haloCockpit.add(steeringWheelGroup);

  [-1, 1].forEach((side) => {
    const stalk = createStrutMesh(
      new THREE.Vector3(side * 0.25, 0.58, 0.48),
      new THREE.Vector3(side * 0.46, 0.64, 0.46),
      0.008,
      0.02,
      materials.carbonWeave,
      lod.strutRadial,
    );
    haloCockpit.add(stalk);

    const mirrorHousing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.13, 0.048, 0.085)),
      materials.liveryPrimary,
    );
    mirrorHousing.position.set(side * 0.49, 0.65, 0.46);
    mirrorHousing.rotation.y = side * -0.15;
    mirrorHousing.castShadow = true;
    haloCockpit.add(mirrorHousing);
  });

  // =========================================================================
  // 4. SIDEPODS, ENGINE COVER, SHARK FIN, SIDE NUMBERS & SPONSOR BADGES
  // =========================================================================
  const sidepodsCover = modules.sidepods_engine_cover;

  const engineCoverStations: LoftStation[] = [
    { z: -1.78, halfWidth: 0.095, topY: 0.46, bottomY: 0.18, topCrown: 0.85, bottomCurve: 0.4 },
    { z: -1.42, halfWidth: 0.145, topY: 0.58, bottomY: 0.15, topCrown: 0.8, bottomCurve: 0.3 },
    { z: -1.0, halfWidth: 0.22, topY: 0.72, bottomY: 0.12, topCrown: 0.75, bottomCurve: 0.2 },
    { z: -0.52, halfWidth: 0.26, topY: 0.86, bottomY: 0.12, topCrown: 0.7, bottomCurve: 0.2 },
    { z: -0.32, halfWidth: 0.28, topY: 0.78, bottomY: 0.12, topCrown: 0.65, bottomCurve: 0.2 },
  ];
  const engineCoverGeo = trackGeo(createLoftedBodyGeometry(engineCoverStations, lod.loftRadial));
  const engineCoverMesh = new THREE.Mesh(engineCoverGeo, materials.liveryPrimary);
  engineCoverMesh.name = 'engine_cover';
  engineCoverMesh.castShadow = true;
  engineCoverMesh.receiveShadow = true;
  sidepodsCover.add(engineCoverMesh);

  const finShape = new THREE.Shape();
  finShape.moveTo(-0.42, 0.88);
  finShape.lineTo(-1.35, 0.68);
  finShape.lineTo(-1.62, 0.52);
  finShape.lineTo(-1.55, 0.44);
  finShape.lineTo(-0.42, 0.68);
  finShape.closePath();

  const finGeo = trackGeo(
    new THREE.ExtrudeGeometry(finShape, {
      depth: 0.012,
      bevelEnabled: false,
    }),
  );
  finGeo.translate(0, 0, -0.006);
  finGeo.rotateY(-Math.PI * 0.5);
  const finMesh = new THREE.Mesh(finGeo, materials.liverySecondary);
  finMesh.name = 'dorsal_shark_fin';
  finMesh.castShadow = true;
  sidepodsCover.add(finMesh);

  // Engine Cover Side Car Numbers + Engine Cover Sponsor Slots (5/6) + Sidepod Slots (3/4)
  [-1, 1].forEach((side) => {
    const sideNumMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(0.15, 0.15)),
      materials.noseNumberDecal,
    );
    sideNumMesh.name = side > 0 ? 'fin_number_L' : 'fin_number_R';
    sideNumMesh.position.set(side * 0.252, 0.65, -0.58);
    sideNumMesh.rotation.y = side > 0 ? Math.PI * 0.5 + 0.12 : -Math.PI * 0.5 - 0.12;
    sidepodsCover.add(sideNumMesh);

    const engSlotId: SponsorSlotId = side > 0 ? 'slot-5' : 'slot-6';
    const engSponsor = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(0.4, 0.125)),
      materials.sponsorSlotMaterials[engSlotId],
    );
    engSponsor.name = side > 0 ? 'sponsor_slot_5_engine_L' : 'sponsor_slot_6_engine_R';
    engSponsor.position.set(side * 0.228, 0.58, -1.02);
    engSponsor.rotation.y = side > 0 ? Math.PI * 0.5 + 0.16 : -Math.PI * 0.5 - 0.16;
    sidepodsCover.add(engSponsor);
    sponsorSlotMeshes[engSlotId].push(engSponsor);

    const spStations: LoftStation[] = [
      { z: -1.48, halfWidth: 0.05, topY: 0.34, bottomY: 0.24, xOffset: side * 0.18, topCrown: 0.8, bottomCurve: 0.7 },
      { z: -1.05, halfWidth: 0.16, topY: 0.46, bottomY: 0.22, xOffset: side * 0.3, topCrown: 0.65, bottomCurve: 0.65, shoulderBias: 0.25 },
      { z: -0.45, halfWidth: 0.28, topY: 0.56, bottomY: 0.18, xOffset: side * 0.42, topCrown: 0.55, bottomCurve: 0.75, shoulderBias: 0.35 },
      { z: 0.15, halfWidth: 0.31, topY: 0.58, bottomY: 0.22, xOffset: side * 0.45, topCrown: 0.5, bottomCurve: 0.8, shoulderBias: 0.45 },
      { z: 0.54, halfWidth: 0.25, topY: 0.57, bottomY: 0.34, xOffset: side * 0.43, topCrown: 0.45, bottomCurve: 0.7, shoulderBias: 0.5 },
    ];
    const spGeo = trackGeo(createLoftedBodyGeometry(spStations, lod.loftRadial));
    const spMesh = new THREE.Mesh(spGeo, materials.liveryPrimary);
    spMesh.name = side < 0 ? 'sidepod_R' : 'sidepod_L';
    spMesh.castShadow = true;
    spMesh.receiveShadow = true;
    sidepodsCover.add(spMesh);

    // Sidepod Outer Flank Sponsor Slot (Slot 3 Left, Slot 4 Right)
    const spSlotId: SponsorSlotId = side > 0 ? 'slot-3' : 'slot-4';
    const spSponsor = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(0.5, 0.155)),
      materials.sponsorSlotMaterials[spSlotId],
    );
    spSponsor.name = side > 0 ? 'sponsor_slot_3_sidepod_L' : 'sponsor_slot_4_sidepod_R';
    spSponsor.position.set(side * 0.764, 0.43, -0.15);
    spSponsor.rotation.y = side > 0 ? Math.PI * 0.5 + 0.04 : -Math.PI * 0.5 - 0.04;
    sidepodsCover.add(spSponsor);
    sponsorSlotMeshes[spSlotId].push(spSponsor);

    const inletGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.14, 0.05));
    const inletMesh = new THREE.Mesh(inletGeo, materials.carbonMatte);
    inletMesh.position.set(side * 0.44, 0.47, 0.53);
    inletMesh.rotation.y = side * -0.14;
    sidepodsCover.add(inletMesh);

    const louverStrip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11, 0.014, 0.55)),
      materials.liverySecondary,
    );
    louverStrip.position.set(side * 0.36, 0.555, -0.35);
    louverStrip.rotation.z = side * -0.24;
    louverStrip.rotation.x = 0.16;
    sidepodsCover.add(louverStrip);
  });

  const mainExhaust = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.052, 0.056, 0.22, 18, 1, true)),
    materials.exhaustTip,
  );
  mainExhaust.rotation.x = Math.PI * 0.5;
  mainExhaust.position.set(0, 0.34, -1.86);
  sidepodsCover.add(mainExhaust);

  [-1, 1].forEach((side) => {
    const wg = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.02, 0.022, 0.18, 12, 1, true)),
      materials.exhaustTip,
    );
    wg.rotation.x = Math.PI * 0.5;
    wg.position.set(side * 0.075, 0.31, -1.84);
    sidepodsCover.add(wg);
  });

  // =========================================================================
  // 5. VENTURI FLOOR, FLOOR EDGE WINGS, TEA-TRAY BIB & MULTI-VANE DIFFUSER
  // =========================================================================
  const floorDiffuser = modules.floor_diffuser;

  const floorShape = new THREE.Shape();
  floorShape.moveTo(0, 1.05);
  floorShape.lineTo(0.24, 0.92);
  floorShape.lineTo(0.28, 0.65);
  floorShape.lineTo(0.84, 0.45);
  floorShape.lineTo(0.88, -0.25);
  floorShape.lineTo(0.84, -1.18);
  floorShape.lineTo(0.56, -1.35);
  floorShape.lineTo(0.52, -1.85);
  floorShape.lineTo(-0.52, -1.85);
  floorShape.lineTo(-0.56, -1.35);
  floorShape.lineTo(-0.84, -1.18);
  floorShape.lineTo(-0.88, -0.25);
  floorShape.lineTo(-0.84, 0.45);
  floorShape.lineTo(-0.28, 0.65);
  floorShape.lineTo(-0.24, 0.92);
  floorShape.closePath();

  const floorGeo = trackGeo(
    new THREE.ExtrudeGeometry(floorShape, {
      depth: 0.024,
      bevelEnabled: lod.bevelSegments > 0,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: lod.bevelSegments,
    }),
  );
  floorGeo.rotateX(-Math.PI * 0.5);
  const floorMesh = new THREE.Mesh(floorGeo, materials.carbonMatte);
  floorMesh.name = 'venturi_floor_plank';
  floorMesh.position.y = F1_2026_DIMENSIONS.floorRideHeight;
  floorMesh.receiveShadow = true;
  floorMesh.castShadow = true;
  floorDiffuser.add(floorMesh);

  [-1, 1].forEach((side) => {
    const edgeWing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.055, 0.018, 1.45)),
      materials.carbonWeave,
    );
    edgeWing.position.set(side * 0.89, 0.068, -0.35);
    edgeWing.rotation.z = side * 0.14;
    floorDiffuser.add(edgeWing);

    [0.48, 0.64].forEach((xVal, idx) => {
      const strake = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.01, 0.068 - idx * 0.014, 0.28)),
        materials.carbonWeave,
      );
      strake.position.set(side * xVal, 0.088, 0.42);
      strake.rotation.y = side * -0.22;
      floorDiffuser.add(strake);
    });
  });

  const diffRampGeo = trackGeo(new THREE.BoxGeometry(0.96, 0.022, 0.52));
  const diffRamp = new THREE.Mesh(diffRampGeo, materials.carbonWeave);
  diffRamp.position.set(0, 0.15, -1.88);
  diffRamp.rotation.x = 0.34;
  floorDiffuser.add(diffRamp);

  [-0.36, -0.14, 0.14, 0.36].forEach((xPos) => {
    const vane = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.012, 0.16, 0.48)),
      materials.carbonWeave,
    );
    vane.position.set(xPos, 0.125, -1.9);
    floorDiffuser.add(vane);
  });

  const crashStruct = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.14, 0.12, 0.38)),
    materials.carbonWeave,
  );
  crashStruct.position.set(0, 0.22, -2.02);
  floorDiffuser.add(crashStruct);

  const rainLightMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.085, 0.055, 0.025)),
    materials.rainLight,
  );
  rainLightMesh.name = 'fia_rain_light';
  rainLightMesh.position.set(0, 0.22, -2.21);
  floorDiffuser.add(rainLightMesh);

  // =========================================================================
  // 6. REAR WING (Active Flap + Sponsor Banner + Crash Damage Pivot)
  // =========================================================================
  const rearWing = modules.rear_wing;
  const rwSpan = F1_2026_DIMENSIONS.rearWingSpan;

  const beamLower = new THREE.Mesh(
    trackGeo(createAirfoilSpanGeometry(0.14, 0.018, 0.78, 0.018, lod.airfoilSteps, lod.bevelSegments)),
    materials.carbonWeave,
  );
  beamLower.position.set(0, 0.42, -2.06);
  beamLower.rotation.x = 0.25;
  rearWing.add(beamLower);

  const pylonShape = new THREE.Shape();
  pylonShape.moveTo(-1.82, 0.35);
  pylonShape.lineTo(-2.08, 0.48);
  pylonShape.quadraticCurveTo(-2.14, 0.88, -2.06, 0.94);
  pylonShape.lineTo(-2.22, 0.88);
  pylonShape.lineTo(-2.24, 0.76);
  pylonShape.quadraticCurveTo(-2.18, 0.48, -2.02, 0.28);
  pylonShape.closePath();

  const pylonGeo = trackGeo(
    new THREE.ExtrudeGeometry(pylonShape, {
      depth: 0.024,
      bevelEnabled: false,
      curveSegments: Math.max(4, Math.floor(lod.airfoilSteps * 0.7)),
    }),
  );
  pylonGeo.translate(0, 0, -0.012);
  pylonGeo.rotateY(-Math.PI * 0.5);
  const pylonMesh = new THREE.Mesh(pylonGeo, materials.carbonWeave);
  pylonMesh.name = 'rear_swan_neck_pylon';
  pylonMesh.castShadow = true;
  rearWing.add(pylonMesh);

  // Pivot for rear-wing crash damage centered at pylon attachment
  const rearWingDamagePivot = new THREE.Group();
  rearWingDamagePivot.name = 'rear_wing_assembly';
  rearWingDamagePivot.position.set(0, 0.78, -2.14);
  rearWing.add(rearWingDamagePivot);

  const rwMain = new THREE.Mesh(
    trackGeo(createAirfoilSpanGeometry(0.24, 0.028, rwSpan, 0.026, lod.airfoilSteps, lod.bevelSegments)),
    materials.liverySecondary,
  );
  rwMain.name = 'rear_wing_mainplane';
  rwMain.position.set(0, 0.79 - 0.78, 0);
  rwMain.rotation.x = 0.14;
  rwMain.castShadow = true;
  rearWingDamagePivot.add(rwMain);

  const rearFlapPivot = new THREE.Group();
  rearFlapPivot.name = 'rear_wing_active_flap_pivot';
  rearFlapPivot.position.set(0, 0.915 - 0.78, -2.26 - -2.14);

  const rwFlap1 = new THREE.Mesh(
    trackGeo(createAirfoilSpanGeometry(0.16, 0.018, rwSpan * 0.96, 0.016, lod.airfoilSteps, lod.bevelSegments)),
    materials.liveryPrimary,
  );
  rwFlap1.position.set(0, -0.02, 0.03);
  rwFlap1.rotation.x = 0.56;
  rwFlap1.castShadow = true;
  rearFlapPivot.add(rwFlap1);

  const rwFlap2 = new THREE.Mesh(
    trackGeo(createAirfoilSpanGeometry(0.09, 0.012, rwSpan * 0.94, 0.01, lod.airfoilSteps, lod.bevelSegments)),
    materials.liveryAccent,
  );
  rwFlap2.position.set(0, 0.04, -0.04);
  rwFlap2.rotation.x = 0.72;
  rwFlap2.castShadow = true;
  rearFlapPivot.add(rwFlap2);

  // Sponsor Slot 7: Rear Wing Rear-Facing Banner
  const rwBackSponsor = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(0.68, 0.14)),
    materials.sponsorSlotMaterials['slot-7'],
  );
  rwBackSponsor.name = 'sponsor_slot_7_rear_wing';
  rwBackSponsor.position.set(0, 0.005, -0.055);
  rwBackSponsor.rotation.set(-0.32, Math.PI, 0);
  rearFlapPivot.add(rwBackSponsor);
  sponsorSlotMeshes['slot-7'].push(rwBackSponsor);

  rearWingDamagePivot.add(rearFlapPivot);

  let rwEndplateRight!: THREE.Mesh;
  [-1, 1].forEach((side) => {
    const rwEpShape = new THREE.Shape();
    rwEpShape.moveTo(-1.95 - -2.14, 0.44 - 0.78);
    rwEpShape.quadraticCurveTo(-2.02 - -2.14, 0.88 - 0.78, -2.06 - -2.14, 0.95 - 0.78);
    rwEpShape.lineTo(-2.36 - -2.14, 0.99 - 0.78);
    rwEpShape.quadraticCurveTo(-2.38 - -2.14, 0.65 - 0.78, -2.2 - -2.14, 0.36 - 0.78);
    rwEpShape.lineTo(-1.98 - -2.14, 0.36 - 0.78);
    rwEpShape.closePath();

    const rwEpGeo = trackGeo(
      new THREE.ExtrudeGeometry(rwEpShape, {
        depth: 0.016,
        bevelEnabled: lod.bevelSegments > 0,
        bevelThickness: 0.004,
        bevelSize: 0.004,
        bevelSegments: lod.bevelSegments,
        curveSegments: Math.max(4, Math.floor(lod.airfoilSteps * 0.7)),
      }),
    );
    rwEpGeo.translate(0, 0, -0.008);
    rwEpGeo.rotateY(-Math.PI * 0.5);
    const rwEpMesh = new THREE.Mesh(rwEpGeo, materials.liveryPrimary);
    rwEpMesh.name = side < 0 ? 'rear_endplate_R' : 'rear_endplate_L';
    rwEpMesh.position.x = side * (rwSpan * 0.5 + 0.008);
    rwEpMesh.castShadow = true;
    rearWingDamagePivot.add(rwEpMesh);

    if (side < 0) rwEndplateRight = rwEpMesh;

    // Sponsor Slot 8: Rear Endplate Outer Panels
    const rwEpSponsor = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(0.28, 0.095)),
      materials.sponsorSlotMaterials['slot-8'],
    );
    rwEpSponsor.name = side > 0 ? 'sponsor_slot_8_endplate_L' : 'sponsor_slot_8_endplate_R';
    rwEpSponsor.position.set(side * 0.019, -0.1, -0.02);
    rwEpSponsor.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    rwEpMesh.add(rwEpSponsor);
    sponsorSlotMeshes['slot-8'].push(rwEpSponsor);
  });

  // =========================================================================
  // 7. SUSPENSION SYSTEM (With Front-Left Buckled Crash Group)
  // =========================================================================
  const suspension = modules.suspension_system;
  const fZ = F1_2026_DIMENSIONS.frontAxleZ;
  const rZ = F1_2026_DIMENSIONS.rearAxleZ;
  const wY = F1_2026_DIMENSIONS.wheelRadius;
  const fX = F1_2026_DIMENSIONS.frontTrackHalf;
  const rX = F1_2026_DIMENSIONS.rearTrackHalf;

  const frontLeftSuspPivot = new THREE.Group();
  frontLeftSuspPivot.name = 'front_left_suspension_corner';
  frontLeftSuspPivot.position.set(0.2, 0.3, fZ);
  suspension.add(frontLeftSuspPivot);

  [-1, 1].forEach((side) => {
    const targetSuspGroup = side > 0 ? frontLeftSuspPivot : suspension;
    const offX = side > 0 ? 0.2 : 0;
    const offY = side > 0 ? 0.3 : 0;
    const offZ = side > 0 ? fZ : 0;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x - offX, y - offY, z - offZ);

    const fHubX = side * (fX - 0.14);
    targetSuspGroup.add(
      createStrutMesh(v(side * 0.18, 0.42, fZ + 0.14), v(fHubX, wY + 0.09, fZ), 0.01, 0.022, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(v(side * 0.21, 0.41, fZ - 0.18), v(fHubX, wY + 0.09, fZ), 0.01, 0.022, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(v(side * 0.16, 0.19, fZ + 0.16), v(fHubX, wY - 0.09, fZ), 0.011, 0.024, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(v(side * 0.19, 0.18, fZ - 0.2), v(fHubX, wY - 0.09, fZ), 0.011, 0.024, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(v(side * 0.18, 0.44, fZ - 0.04), v(fHubX, wY - 0.07, fZ + 0.02), 0.008, 0.016, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(v(side * 0.17, 0.26, fZ - 0.08), v(fHubX, wY - 0.02, fZ - 0.08), 0.007, 0.012, materials.titanium, lod.strutRadial),
    );

    const rHubX = side * (rX - 0.18);
    suspension.add(
      createStrutMesh(new THREE.Vector3(side * 0.12, 0.42, rZ + 0.18), new THREE.Vector3(rHubX, wY + 0.09, rZ), 0.011, 0.024, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(new THREE.Vector3(side * 0.09, 0.41, rZ - 0.16), new THREE.Vector3(rHubX, wY + 0.09, rZ), 0.011, 0.024, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(new THREE.Vector3(side * 0.14, 0.2, rZ + 0.2), new THREE.Vector3(rHubX, wY - 0.09, rZ), 0.012, 0.026, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(new THREE.Vector3(side * 0.1, 0.19, rZ - 0.18), new THREE.Vector3(rHubX, wY - 0.09, rZ), 0.012, 0.026, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(new THREE.Vector3(side * 0.12, 0.21, rZ + 0.04), new THREE.Vector3(rHubX, wY + 0.08, rZ + 0.02), 0.009, 0.018, materials.carbonWeave, lod.strutRadial),
      createStrutMesh(new THREE.Vector3(side * 0.09, wY, rZ), new THREE.Vector3(rHubX, wY, rZ), 0.014, 0.014, materials.titanium, lod.strutRadial),
    );

    // Front brake assembly
    {
      const bx = side * (fX - 0.12) - offX;
      const by = wY - offY;
      const bz = fZ - offZ;
      const disc = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.165, 0.165, 0.03, lod.discRadial)),
        materials.brakeDisc,
      );
      disc.rotation.z = Math.PI * 0.5;
      disc.position.set(bx, by, bz);
      targetSuspGroup.add(disc);

      const caliper = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.055, 0.14, 0.085)),
        materials.brakeCaliper,
      );
      caliper.position.set(bx, by - 0.05, bz - 0.09);
      targetSuspGroup.add(caliper);

      const duct = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.04, 0.19, 0.14)),
        materials.carbonMatte,
      );
      duct.position.set(bx - side * 0.03, by + 0.01, bz + 0.04);
      targetSuspGroup.add(duct);
    }

    // Rear brake assembly
    {
      const rxPos = side * (rX - 0.16);
      const disc = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.165, 0.165, 0.03, lod.discRadial)),
        materials.brakeDisc,
      );
      disc.rotation.z = Math.PI * 0.5;
      disc.position.set(rxPos, wY, rZ);
      suspension.add(disc);

      const caliper = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.055, 0.14, 0.085)),
        materials.brakeCaliper,
      );
      caliper.position.set(rxPos, wY - 0.05, rZ - 0.09);
      suspension.add(caliper);

      const duct = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.04, 0.19, 0.14)),
        materials.carbonMatte,
      );
      duct.position.set(rxPos - side * 0.03, wY + 0.01, rZ + 0.04);
      suspension.add(duct);
    }
  });

  // =========================================================================
  // 8. 2026 18" WHEELS, TIRES & AERO WHEEL COVERS
  // =========================================================================
  const wheelsGroup = modules.wheels_tires;

  function buildWheelAssembly(
    name: string,
    side: -1 | 1,
    tireWidth: number,
  ): { steerPivot: THREE.Group; spinPivot: THREE.Group } {
    const steerPivot = new THREE.Group();
    steerPivot.name = `${name}_steer`;

    const spinPivot = new THREE.Group();
    spinPivot.name = `${name}_spin`;
    steerPivot.add(spinPivot);

    const R = F1_2026_DIMENSIONS.wheelRadius;
    const rimR = F1_2026_DIMENSIONS.rimRadius;
    const hw = tireWidth * 0.5;

    const lathePts = [
      new THREE.Vector2(rimR, -hw * 0.92),
      new THREE.Vector2(rimR + 0.04, -hw),
      new THREE.Vector2(R - 0.018, -hw * 0.96),
      new THREE.Vector2(R, -hw * 0.78),
      new THREE.Vector2(R, hw * 0.78),
      new THREE.Vector2(R - 0.018, hw * 0.96),
      new THREE.Vector2(rimR + 0.04, hw),
      new THREE.Vector2(rimR, hw * 0.92),
    ];
    const tireGeo = trackGeo(new THREE.LatheGeometry(lathePts, lod.tireRadial));
    tireGeo.rotateZ(Math.PI * 0.5);
    const tireMesh = new THREE.Mesh(tireGeo, materials.tireTread);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    spinPivot.add(tireMesh);

    const swRingGeo = trackGeo(new THREE.RingGeometry(rimR * 0.96, R * 0.955, lod.tireRadial));
    const swOuter = new THREE.Mesh(swRingGeo, materials.tireSidewall);
    swOuter.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    swOuter.position.x = side * (hw + 0.002);
    spinPivot.add(swOuter);

    const coverGeo = trackGeo(new THREE.CylinderGeometry(rimR, rimR * 0.96, tireWidth * 0.72, lod.tireRadial));
    coverGeo.rotateZ(Math.PI * 0.5);
    const coverMesh = new THREE.Mesh(coverGeo, materials.wheelCover);
    coverMesh.position.x = side * 0.025;
    spinPivot.add(coverMesh);

    for (let s = 0; s < 5; s++) {
      const ang = (s / 5) * Math.PI * 2;
      const fin = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.012, 0.022, rimR * 0.72)),
        materials.carbonWeave,
      );
      fin.position.set(
        side * (hw * 0.78),
        Math.cos(ang) * rimR * 0.52,
        Math.sin(ang) * rimR * 0.52,
      );
      fin.rotation.x = ang;
      spinPivot.add(fin);
    }

    const nutMesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.036, 0.044, 0.045, 6)),
      side > 0 ? materials.wheelNutLeft : materials.wheelNutRight,
    );
    nutMesh.rotation.z = Math.PI * 0.5;
    nutMesh.position.x = side * (hw * 0.85);
    spinPivot.add(nutMesh);

    return { steerPivot, spinPivot };
  }

  const wheelFL = buildWheelAssembly('wheel_fl', 1, F1_2026_DIMENSIONS.frontTireWidth);
  wheelFL.steerPivot.position.set(fX, wY, fZ);
  wheelsGroup.add(wheelFL.steerPivot);

  const wheelFR = buildWheelAssembly('wheel_fr', -1, F1_2026_DIMENSIONS.frontTireWidth);
  wheelFR.steerPivot.position.set(-fX, wY, fZ);
  wheelsGroup.add(wheelFR.steerPivot);

  const wheelRL = buildWheelAssembly('wheel_rl', 1, F1_2026_DIMENSIONS.rearTireWidth);
  wheelRL.steerPivot.position.set(rX, wY, rZ);
  wheelsGroup.add(wheelRL.steerPivot);

  const wheelRR = buildWheelAssembly('wheel_rr', -1, F1_2026_DIMENSIONS.rearTireWidth);
  wheelRR.steerPivot.position.set(-rX, wY, rZ);
  wheelsGroup.add(wheelRR.steerPivot);

  // =========================================================================
  // 9. REALISTIC 3D CRASH DEBRIS SHARDS ASSET GROUP
  // =========================================================================
  const debrisGroup = new THREE.Group();
  debrisGroup.name = 'crash_debris_shards';
  debrisGroup.visible = false;

  const debrisSpecs: Array<{
    pos: [number, number, number];
    rot: [number, number, number];
    scale: [number, number, number];
    kind: 'carbon' | 'livery' | 'accent' | 'rubber';
  }> = [
    { pos: [0.68, 0.014, 2.58], rot: [0.08, 0.72, 0.05], scale: [0.18, 0.015, 0.09], kind: 'carbon' },
    { pos: [0.95, 0.016, 2.24], rot: [0.04, 1.35, -0.06], scale: [0.14, 0.016, 0.11], kind: 'livery' },
    { pos: [-0.52, 0.013, 2.74], rot: [-0.05, 0.42, 0.08], scale: [0.16, 0.014, 0.08], kind: 'carbon' },
    { pos: [-0.88, 0.018, 2.48], rot: [0.11, -0.85, 0.04], scale: [0.15, 0.016, 0.12], kind: 'accent' },
    { pos: [0.24, 0.012, 2.86], rot: [0.02, 2.1, 0.02], scale: [0.11, 0.014, 0.07], kind: 'carbon' },
    { pos: [1.14, 0.018, 1.88], rot: [0.09, 0.9, -0.04], scale: [0.13, 0.018, 0.09], kind: 'livery' },
    { pos: [1.22, 0.022, 1.38], rot: [0.12, -0.5, 0.09], scale: [0.09, 0.028, 0.06], kind: 'rubber' },
    { pos: [0.98, 0.019, 1.05], rot: [-0.08, 1.8, 0.05], scale: [0.07, 0.024, 0.05], kind: 'rubber' },
    { pos: [-1.12, 0.015, 2.02], rot: [0.04, 1.15, -0.05], scale: [0.12, 0.014, 0.07], kind: 'carbon' },
    { pos: [0.55, 0.014, 1.92], rot: [-0.06, -1.2, 0.04], scale: [0.1, 0.014, 0.08], kind: 'accent' },
    { pos: [-0.28, 0.015, -2.38], rot: [0.06, 0.65, -0.05], scale: [0.15, 0.015, 0.09], kind: 'carbon' },
    { pos: [0.42, 0.015, -2.44], rot: [-0.04, 2.25, 0.07], scale: [0.12, 0.014, 0.08], kind: 'livery' },
  ];

  const shardBaseGeo = trackGeo(new THREE.TetrahedronGeometry(0.65, 0));
  const rubberBaseGeo = trackGeo(new THREE.DodecahedronGeometry(0.55, 0));

  debrisSpecs.forEach((d, idx) => {
    const mat =
      d.kind === 'livery'
        ? materials.liverySecondary
        : d.kind === 'accent'
          ? materials.liveryAccent
          : d.kind === 'rubber'
            ? materials.tireTread
            : materials.carbonMatte;
    const mesh = new THREE.Mesh(d.kind === 'rubber' ? rubberBaseGeo : shardBaseGeo, mat);
    mesh.name = `crash_debris_${idx + 1}`;
    mesh.position.set(...d.pos);
    mesh.rotation.set(...d.rot);
    mesh.scale.set(...d.scale);
    mesh.castShadow = true;
    debrisGroup.add(mesh);
  });
  rootGroup.add(debrisGroup);

  // =========================================================================
  // KINEMATICS, EXPLODED VIEW, SPONSOR SLOTS & CRASH DAMAGE CONTROLLER
  // =========================================================================
  let targetAeroMode: AeroMode = options.aeroMode ?? 'z-mode';
  let aeroBlend = targetAeroMode === 'x-mode' ? 1 : 0;
  let targetExplode = 0;
  let currentExplode = 0;
  let currentCrashState: CrashEffectState = options.crashState ?? {
    decalPeel: 0,
    frontWingBreak: 'none',
    rearWingDamaged: false,
    suspensionBent: false,
    debrisVisible: false,
  };

  const baseModulePositions = new Map<ChassisModuleId, THREE.Vector3>();
  (Object.keys(modules) as ChassisModuleId[]).forEach((id) => {
    baseModulePositions.set(id, modules[id].position.clone());
  });

  function applySponsorSlotsVisibility(slots: Record<SponsorSlotId, SponsorSlotConfig>) {
    (Object.keys(sponsorSlotMeshes) as SponsorSlotId[]).forEach((slotId) => {
      const visible = slots[slotId]?.enabled ?? true;
      sponsorSlotMeshes[slotId].forEach((m) => {
        m.visible = visible;
      });
    });
  }

  function applyCrashGeometry(state: CrashEffectState) {
    currentCrashState = state;

    // 1. Broken / Drooping Front Wing Left & Right Halves
    const leftBroken = state.frontWingBreak === 'left' || state.frontWingBreak === 'both';
    const rightBroken = state.frontWingBreak === 'both';

    fwLeftBreakPivot.position.set(
      fwBreakX,
      leftBroken ? 0.044 : 0.088,
      leftBroken ? 2.33 : 2.40,
    );
    fwLeftBreakPivot.rotation.set(
      leftBroken ? 0.19 : 0,
      leftBroken ? 0.18 : 0,
      leftBroken ? -0.27 : 0,
    );
    fwLeftFractureStub.visible = leftBroken;

    fwRightBreakPivot.position.set(
      -fwBreakX,
      rightBroken ? 0.049 : 0.088,
      rightBroken ? 2.29 : 2.40,
    );
    fwRightBreakPivot.rotation.set(
      rightBroken ? 0.24 : 0,
      rightBroken ? -0.25 : 0,
      rightBroken ? 0.32 : 0,
    );
    fwRightFractureStub.visible = rightBroken;

    // 2. Damaged / Crooked Rear Wing Assembly
    if (state.rearWingDamaged) {
      rearWingDamagePivot.position.set(0.04, 0.725, -2.16);
      rearWingDamagePivot.rotation.set(-0.16, 0.14, 0.22);
      rwEndplateRight.rotation.z = 0.24;
    } else {
      rearWingDamagePivot.position.set(0, 0.78, -2.14);
      rearWingDamagePivot.rotation.set(0, 0, 0);
      rwEndplateRight.rotation.z = 0;
    }

    // 3. Bent Front-Left Suspension & Collapsed Wheel Camber
    if (state.suspensionBent) {
      frontLeftSuspPivot.rotation.set(0.08, -0.18, -0.24);
      wheelFL.steerPivot.position.set(fX - 0.04, wY - 0.025, fZ - 0.05);
      wheelFL.steerPivot.rotation.z = 0.32;
    } else {
      frontLeftSuspPivot.rotation.set(0, 0, 0);
      wheelFL.steerPivot.position.set(fX, wY, fZ);
      wheelFL.steerPivot.rotation.z = 0;
    }

    // 4. 3D Carbon Debris Shards on Track Surface
    debrisGroup.visible = state.debrisVisible;
  }

  function applyAeroBlend(t: number) {
    const zAngles = getAeroFlapAngles('z-mode');
    const xAngles = getAeroFlapAngles('x-mode');
    const f1Pitch = THREE.MathUtils.lerp(zAngles.frontFlap1Pitch, xAngles.frontFlap1Pitch, t);
    const f2Pitch = THREE.MathUtils.lerp(zAngles.frontFlap2Pitch, xAngles.frontFlap2Pitch, t);
    const rPitch = THREE.MathUtils.lerp(zAngles.rearFlapPitch, xAngles.rearFlapPitch, t);

    frontFlap1Pivots.forEach((p) => {
      p.rotation.x = f1Pitch;
    });
    frontFlap2Pivots.forEach((p) => {
      p.rotation.x = f2Pitch;
    });
    rearFlapPivot.rotation.x = rPitch;
  }

  function applyExplodeFactor(factor: number) {
    CHASSIS_MODULES.forEach((meta) => {
      const grp = modules[meta.id];
      const base = baseModulePositions.get(meta.id)!;
      grp.position.set(
        base.x + meta.explodeOffset[0] * factor,
        base.y + meta.explodeOffset[1] * factor,
        base.z + meta.explodeOffset[2] * factor,
      );
    });
  }

  applyAeroBlend(aeroBlend);
  applySponsorSlotsVisibility(initialAppearance.sponsorSlots);
  applyCrashGeometry(currentCrashState);

  return {
    group: rootGroup,
    modules,
    materials,
    setLivery(id: LiveryId) {
      const preset = getLiveryPreset(id);
      const app = appearanceFromPreset(preset);
      materials.updateAppearance(app);
      applySponsorSlotsVisibility(app.sponsorSlots);
    },
    setAppearance(cfg: F1AppearanceConfig, onAsyncReady?: () => void) {
      materials.updateAppearance(cfg, onAsyncReady);
      applySponsorSlotsVisibility(cfg.sponsorSlots);
    },
    setCrashState(state: CrashEffectState) {
      applyCrashGeometry(state);
    },
    setTireCompound(id: TireCompoundId) {
      materials.updateTireCompound(getTireCompound(id));
    },
    setAeroMode(mode: AeroMode) {
      targetAeroMode = mode;
    },
    setExplodeFactor(factor: number) {
      targetExplode = THREE.MathUtils.clamp(factor, 0, 1);
    },
    setModuleVisibility(id: ChassisModuleId, visible: boolean) {
      modules[id].visible = visible;
    },
    updateAnimation(dt: number, speedKmh: number, steerNormalized: number) {
      const aeroTarget = targetAeroMode === 'x-mode' ? 1 : 0;
      aeroBlend = THREE.MathUtils.damp(aeroBlend, aeroTarget, 10, dt);
      applyAeroBlend(aeroBlend);

      currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 8, dt);
      applyExplodeFactor(currentExplode);

      const { leftRad, rightRad } = computeAckermannSteerAngles(steerNormalized);
      const bentToeOffset = currentCrashState.suspensionBent ? 0.32 : 0;
      wheelFL.steerPivot.rotation.y = THREE.MathUtils.damp(
        wheelFL.steerPivot.rotation.y,
        leftRad + bentToeOffset,
        12,
        dt,
      );
      wheelFR.steerPivot.rotation.y = THREE.MathUtils.damp(
        wheelFR.steerPivot.rotation.y,
        rightRad,
        12,
        dt,
      );
      steeringWheelGroup.rotation.z = THREE.MathUtils.damp(
        steeringWheelGroup.rotation.z,
        steerNormalized * 0.85,
        12,
        dt,
      );

      const omega = speedKmhToWheelOmega(speedKmh);
      if (omega > 0.001) {
        const deltaSpin = omega * dt;
        wheelFL.spinPivot.rotation.x += deltaSpin;
        wheelFR.spinPivot.rotation.x += deltaSpin;
        wheelRL.spinPivot.rotation.x += deltaSpin;
        wheelRR.spinPivot.rotation.x += deltaSpin;
      }
    },
    getStats(): AssetMeshStats {
      let meshes = 0;
      let triangles = 0;
      let vertices = 0;
      rootGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          meshes += 1;
          const pos = m.geometry.attributes.position;
          if (pos) vertices += pos.count;
          if (m.geometry.index) {
            triangles += m.geometry.index.count / 3;
          } else if (pos) {
            triangles += pos.count / 3;
          }
        }
      });
      return {
        meshes,
        triangles: Math.round(triangles),
        vertices,
        subAssemblies: CHASSIS_MODULES.length,
      };
    },
    dispose() {
      geometriesToDispose.forEach((g) => g.dispose());
      materials.dispose();
    },
  };
}
