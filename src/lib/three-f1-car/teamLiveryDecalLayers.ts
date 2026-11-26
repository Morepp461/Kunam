import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { drawTeamLiveryDecal, type TeamLiveryDecal } from "../team-livery-decals";

type DecalLayer = {
  geometry: THREE.BufferGeometry;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
};

const TARGET_NAMES: Record<TeamLiveryDecal["surface"], string[]> = {
  sidepod: ["sidepod_L", "sidepod_R"],
  nose: ["monocoque_nosecone"],
  frontWing: ["front_flap_1_L", "front_flap_1_R"],
  rearWing: ["rear_wing_mainplane"],
};

function makeDecalTexture(decal: TeamLiveryDecal): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) drawTeamLiveryDecal(ctx, decal, 128, 128, 224, 184);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function normalized(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 100) / 100;
}

function addProjectedDecal(
  root: THREE.Group,
  target: THREE.Mesh,
  decal: TeamLiveryDecal,
  position: THREE.Vector3,
  orientation: THREE.Euler,
  size: THREE.Vector3,
): DecalLayer | null {
  try {
    target.updateWorldMatrix(true, false);
    const geometry = new DecalGeometry(target, position, orientation, size);
    if (!geometry.attributes.position || geometry.attributes.position.count < 3) {
      geometry.dispose();
      return null;
    }
    const texture = makeDecalTexture(decal);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `team_livery_decal_${decal.id}_${decal.surface}`;
    mesh.renderOrder = 4;
    root.add(mesh);
    return { geometry, texture, mesh };
  } catch {
    return null;
  }
}

export function createTeamLiveryDecalLayers(
  root: THREE.Group,
  decals: readonly TeamLiveryDecal[],
): { dispose: () => void; count: number } {
  const layers: DecalLayer[] = [];
  root.updateWorldMatrix(true, true);

  const meshes = new Map<string, THREE.Mesh>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && TARGET_NAMES.sidepod.concat(TARGET_NAMES.nose, TARGET_NAMES.frontWing, TARGET_NAMES.rearWing).includes(mesh.name)) {
      meshes.set(mesh.name, mesh);
    }
  });

  for (const decal of decals.slice(0, 50)) {
    const targets = TARGET_NAMES[decal.surface]
      .map((name) => meshes.get(name))
      .filter((mesh): mesh is THREE.Mesh => Boolean(mesh));
    if (!targets.length) continue;

    const scale = THREE.MathUtils.clamp(Number(decal.scale) || 1, 0.2, 2);
    const x = normalized(decal.x);
    const y = normalized(decal.y);
    const rotation = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(decal.rotation, -180, 180));

    if (decal.surface === "sidepod") {
      for (const target of targets) {
        const bounds = new THREE.Box3().setFromObject(target);
        const side = target.name.endsWith("_L") ? 1 : -1;
        const position = new THREE.Vector3(
          side > 0 ? bounds.max.x + 0.006 : bounds.min.x - 0.006,
          THREE.MathUtils.lerp(bounds.max.y, bounds.min.y, y),
          THREE.MathUtils.lerp(bounds.max.z, bounds.min.z, x),
        );
        const size = new THREE.Vector3(
          Math.max(0.11, (bounds.max.z - bounds.min.z) * 0.32 * scale),
          Math.max(0.055, (bounds.max.y - bounds.min.y) * 0.38 * scale),
          0.095,
        );
        const layer = addProjectedDecal(
          root,
          target,
          decal,
          position,
          new THREE.Euler(rotation, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0),
          size,
        );
        if (layer) layers.push(layer);
      }
      continue;
    }

    const target = targets[0];
    const bounds = new THREE.Box3().setFromObject(target);
    const width = Math.max(0.07, bounds.max.x - bounds.min.x);
    const depth = Math.max(0.07, bounds.max.z - bounds.min.z);
    const position = new THREE.Vector3(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, x),
      bounds.max.y + 0.008,
      THREE.MathUtils.lerp(bounds.max.z, bounds.min.z, y),
    );
    const size = new THREE.Vector3(
      Math.max(0.055, width * (decal.surface === "nose" ? 0.34 : 0.32) * scale),
      Math.max(0.045, depth * (decal.surface === "nose" ? 0.28 : 0.55) * scale),
      decal.surface === "nose" ? 0.12 : 0.09,
    );
    const layer = addProjectedDecal(
      root,
      target,
      decal,
      position,
      new THREE.Euler(-Math.PI / 2, 0, rotation),
      size,
    );
    if (layer) layers.push(layer);
  }

  return {
    count: layers.length,
    dispose() {
      for (const layer of layers) {
        root.remove(layer.mesh);
        layer.geometry.dispose();
        layer.texture.dispose();
        const material = layer.mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      }
    },
  };
}
