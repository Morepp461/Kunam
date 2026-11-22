import { useEffect, useRef, useState } from "react";
import type * as Three from "three";
import type { RaceReplayProjection } from "./lib/race-engine/replay";
import { projectReplayScenePoint } from "./lib/race-engine/replay-scene";
import "./race-replay-3d.css";

type Props = { projection: RaceReplayProjection };
type CameraPreset = "broadcast" | "trackside" | "overview";

const CAMERA_PRESETS: Record<CameraPreset, { position: [number, number, number]; label: string }> = {
  broadcast: { position: [78, 48, 68], label: "BROADCAST" },
  trackside: { position: [0, 18, 82], label: "TRACKSIDE" },
  overview: { position: [0, 112, 8], label: "OVERVIEW" }
};
const VEHICLE_COLORS = [0xb52b35, 0xc6a33a, 0x9da3aa, 0x6d8792, 0x8d6f9b, 0xc07845, 0x6d947b, 0xd0c9b7, 0x536b9a, 0xb17b86];

export default function RaceReplay3D({ projection }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const projectionRef = useRef(projection);
  const cameraTargetRef = useRef<[number, number, number]>(CAMERA_PRESETS.broadcast.position);
  const [preset, setPreset] = useState<CameraPreset>("broadcast");
  const [error, setError] = useState("");
  projectionRef.current = projection;

  useEffect(() => {
    let disposed = false;
    let renderer: Three.WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frame = 0;
    let visibilityHandler: (() => void) | null = null;
    const host = hostRef.current;
    if (!host) return;

    const boot = async () => {
      const geometries = new Set<Three.BufferGeometry>();
      const materials = new Set<Three.Material>();
      try {
        const THREE = await import("three");
        if (disposed) return;
        const probe = document.createElement("canvas");
        let supported = false;
        try { supported = Boolean(probe.getContext("webgl2") || probe.getContext("webgl")); } catch { supported = false; }
        if (!supported) throw new Error("WebGL tidak tersedia atau dinonaktifkan pada browser ini.");

        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power", stencil: false, depth: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15));
        renderer.setSize(width, height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.domElement.className = "race-replay-3d-canvas";
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.setAttribute("aria-label", "3D schematic replay of committed segment-level race positions");
        renderer.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          if (!disposed) setError("Konteks grafis terputus. Gunakan tampilan 2D untuk melanjutkan replay.");
        });
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x11151a);
        scene.fog = new THREE.Fog(0x11151a, 105, 250);
        const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 400);
        const target = new THREE.Vector3(0, 0, 0);
        camera.position.set(...cameraTargetRef.current);
        scene.add(new THREE.HemisphereLight(0xe8e0cf, 0x252b32, 2));
        const keyLight = new THREE.DirectionalLight(0xffe3ad, 2.1);
        keyLight.position.set(-35, 75, 40);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xb7c7df, 0.8);
        fillLight.position.set(45, 35, -45);
        scene.add(fillLight);

        const groundGeometry = new THREE.PlaneGeometry(190, 190);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 1 });
        geometries.add(groundGeometry); materials.add(groundMaterial);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.9;
        scene.add(ground);
        const grid = new THREE.GridHelper(180, 18, 0x3c454c, 0x293139);
        scene.add(grid);
        const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
        gridMaterials.forEach((material) => materials.add(material));

        const currentProjection = projectionRef.current;
        const pathPoints = currentProjection.layout.map((point) => new THREE.Vector3((point.x - 0.5) * 120, 0, (point.y - 0.5) * 120));
        if (pathPoints.length < 2 || pathPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) {
          throw new Error("Geometri lintasan tidak valid untuk visualisasi 3D.");
        }
        const curve = new THREE.CatmullRomCurve3(pathPoints, false, "centripetal");
        const trackGeometry = new THREE.TubeGeometry(curve, Math.max(100, pathPoints.length * 12), 0.34, 8, false);
        const trackMaterial = new THREE.MeshStandardMaterial({ color: 0xb99a52, roughness: 0.72, metalness: 0.12 });
        geometries.add(trackGeometry); materials.add(trackMaterial);
        const track = new THREE.Mesh(trackGeometry, trackMaterial);
        track.position.y = 0.05;
        scene.add(track);

        const markerGeometry = new THREE.SphereGeometry(0.85, 10, 8);
        const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xe7d5a0, emissive: 0x403017 });
        geometries.add(markerGeometry); materials.add(markerMaterial);
        const startMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        startMarker.position.copy(pathPoints[0]);
        startMarker.position.y = 0.9;
        scene.add(startMarker);

        const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
        const bodyGeometry = new THREE.BoxGeometry(0.9, 0.34, 2.25);
        const noseGeometry = new THREE.ConeGeometry(0.34, 1.45, 4);
        const frontWingGeometry = new THREE.BoxGeometry(2.2, 0.1, 0.28);
        const rearWingGeometry = new THREE.BoxGeometry(1.7, 0.16, 0.25);
        const cockpitGeometry = new THREE.SphereGeometry(0.34, 10, 8);
        [wheelGeometry, bodyGeometry, noseGeometry, frontWingGeometry, rearWingGeometry, cockpitGeometry].forEach((geometry) => geometries.add(geometry));
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.95 });
        const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.65, metalness: 0.2 });
        const cockpitMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.28, metalness: 0.25 });
        materials.add(wheelMaterial); materials.add(wingMaterial); materials.add(cockpitMaterial);
        const vehicleGroups: Three.Group[] = [];

        for (let index = 0; index < 10; index += 1) {
          const group = new THREE.Group();
          group.visible = false;
          const paint = new THREE.MeshStandardMaterial({ color: VEHICLE_COLORS[index], roughness: 0.38, metalness: 0.32 });
          materials.add(paint);
          group.add(new THREE.Mesh(bodyGeometry, paint));
          const nose = new THREE.Mesh(noseGeometry, paint);
          nose.rotation.x = Math.PI / 2;
          nose.position.set(0, -0.015, 1.38);
          group.add(nose);
          const frontWing = new THREE.Mesh(frontWingGeometry, wingMaterial);
          frontWing.position.set(0, -0.06, 2.02);
          group.add(frontWing);
          const rearWing = new THREE.Mesh(rearWingGeometry, wingMaterial);
          rearWing.position.set(0, 0.16, -1.08);
          group.add(rearWing);
          const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
          cockpit.scale.set(0.72, 0.55, 1.05);
          cockpit.position.set(0, 0.28, -0.12);
          group.add(cockpit);
          for (const side of [-1, 1]) for (const axle of [-1, 1]) {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * 0.58, -0.08, axle * 0.82);
            group.add(wheel);
          }
          scene.add(group);
          vehicleGroups.push(group);
        }

        const updateVehicles = () => {
          const activeProjection = projectionRef.current;
          for (let index = 0; index < vehicleGroups.length; index += 1) {
            const group = vehicleGroups[index];
            const point = activeProjection.points[index];
            group.visible = Boolean(point);
            if (!point) continue;
            const scenePoint = projectReplayScenePoint(activeProjection.layout, point);
            group.position.set(scenePoint.x, 0.72, scenePoint.z);
            group.rotation.y = scenePoint.headingRadians;
          }
        };
        const resize = () => {
          if (!renderer || disposed) return;
          const nextWidth = Math.max(1, host.clientWidth);
          const nextHeight = Math.max(1, host.clientHeight);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight, false);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        const animate = () => {
          if (disposed || document.hidden) return;
          updateVehicles();
          const desired = new THREE.Vector3(...cameraTargetRef.current);
          camera.position.lerp(desired, 0.055);
          camera.lookAt(target);
          renderer?.render(scene, camera);
          frame = window.requestAnimationFrame(animate);
        };
        visibilityHandler = () => {
          if (document.hidden) window.cancelAnimationFrame(frame);
          else animate();
        };
        document.addEventListener("visibilitychange", visibilityHandler);
        setError("");
        animate();
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "3D replay gagal dimuat.");
      }

      return () => {
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
      };
    };

    let disposeScene: (() => void) | undefined;
    void boot().then((dispose) => { disposeScene = dispose; if (disposed) disposeScene?.(); });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      resizeObserver?.disconnect();
      disposeScene?.();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  const selectPreset = (next: CameraPreset) => {
    cameraTargetRef.current = CAMERA_PRESETS[next].position;
    setPreset(next);
  };

  return <section className="race-replay-3d-shell" aria-label="3D circuit replay">
    <div className="race-replay-3d-toolbar">
      <span>3D SCHEMATIC · {Math.min(10, projection.points.length)} CARS</span>
      <div role="group" aria-label="3D camera">
        {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => <button type="button" key={key} className={preset === key ? "active" : ""} onClick={() => selectPreset(key)}>{CAMERA_PRESETS[key].label}</button>)}
      </div>
    </div>
    <div className="race-replay-3d-stage" ref={hostRef}>
      {error && <div className="race-replay-3d-error" role="status">{error} Pilih 2D MAP untuk tampilan alternatif.</div>}
    </div>
    <p className="race-replay-3d-caption">Skema 3D dari titik tengah lintasan. Lebar, elevasi, dan detail fisik lintasan tidak direpresentasikan sebagai ukuran terukur. Posisi mobil hanya segment-level, bukan GPS kontinu.</p>
  </section>;
}
