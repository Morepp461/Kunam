import { useEffect, useRef, useState } from "react";
import type { RaceReplayProjection } from "./lib/race-engine/replay";
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
  const [preset, setPreset] = useState<CameraPreset>("broadcast");
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let renderer: import("three").WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanup: (() => void) | null = null;
    const host = hostRef.current;
    if (!host) return;

    const boot = async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;
        try {
          const probe = document.createElement("canvas");
          if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
            throw new Error("WebGL tidak tersedia di browser ini.");
          }
        } catch {
          throw new Error("WebGL tidak tersedia atau dinonaktifkan pada browser ini.");
        }

        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power", stencil: false, depth: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15));
        renderer.setSize(width, height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
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
        const desiredCamera = new THREE.Vector3(...CAMERA_PRESETS[preset].position);
        camera.position.copy(desiredCamera);

        scene.add(new THREE.HemisphereLight(0xe8e0cf, 0x252b32, 2.0));
        const keyLight = new THREE.DirectionalLight(0xffe3ad, 2.1);
        keyLight.position.set(-35, 75, 40);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xb7c7df, 0.8);
        fillLight.position.set(45, 35, -45);
        scene.add(fillLight);

        const groundGeometry = new THREE.PlaneGeometry(190, 190);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 1, metalness: 0 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.9;
        scene.add(ground);

        const grid = new THREE.GridHelper(180, 18, 0x3c454c, 0x293139);
        grid.position.y = -0.86;
        scene.add(grid);

        const points = projection.layout.map((point) => new THREE.Vector3((point.x - 0.5) * 120, 0, (point.y - 0.5) * 120));
        if (points.length < 2 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) {
          throw new Error("Geometri lintasan tidak valid untuk visualisasi 3D.");
        }
        const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
        const trackGeometry = new THREE.TubeGeometry(curve, Math.max(100, points.length * 12), 0.34, 8, false);
        const trackMaterial = new THREE.MeshStandardMaterial({ color: 0xb99a52, roughness: 0.72, metalness: 0.12 });
        const track = new THREE.Mesh(trackGeometry, trackMaterial);
        track.position.y = 0.05;
        scene.add(track);

        const startMarkerGeometry = new THREE.SphereGeometry(0.85, 10, 8);
        const startMarkerMaterial = new THREE.MeshStandardMaterial({ color: 0xe7d5a0, emissive: 0x403017 });
        const startMarker = new THREE.Mesh(startMarkerGeometry, startMarkerMaterial);
        startMarker.position.copy(points[0]);
        startMarker.position.y = 0.9;
        scene.add(startMarker);

        const sharedWheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
        const sharedBodyGeometry = new THREE.BoxGeometry(0.9, 0.34, 2.25);
        const sharedNoseGeometry = new THREE.ConeGeometry(0.34, 1.45, 4);
        const sharedWingGeometry = new THREE.BoxGeometry(2.2, 0.1, 0.28);
        const sharedRearWingGeometry = new THREE.BoxGeometry(1.7, 0.16, 0.25);
        const sharedCockpitGeometry = new THREE.SphereGeometry(0.34, 10, 8);
        const sharedWheelMaterial = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.95 });
        const sharedWingMaterial = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.65, metalness: 0.2 });
        const sharedCockpitMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.28, metalness: 0.25 });
        const vehicleGroups: THREE.Group[] = [];
        const ownedMaterials: THREE.Material[] = [];
        const maxCars = Math.min(10, projection.points.length);

        for (let index = 0; index < maxCars; index += 1) {
          const point = projection.points[index];
          const group = new THREE.Group();
          const paint = new THREE.MeshStandardMaterial({ color: VEHICLE_COLORS[index % VEHICLE_COLORS.length], roughness: 0.38, metalness: 0.32 });
          ownedMaterials.push(paint);
          const body = new THREE.Mesh(sharedBodyGeometry, paint);
          group.add(body);

          const nose = new THREE.Mesh(sharedNoseGeometry, paint);
          nose.rotation.x = Math.PI / 2;
          nose.position.set(0, -0.015, 1.38);
          group.add(nose);

          const frontWing = new THREE.Mesh(sharedWingGeometry, sharedWingMaterial);
          frontWing.position.set(0, -0.06, 2.02);
          group.add(frontWing);
          const rearWing = new THREE.Mesh(sharedRearWingGeometry, sharedWingMaterial);
          rearWing.position.set(0, 0.16, -1.08);
          group.add(rearWing);
          const cockpit = new THREE.Mesh(sharedCockpitGeometry, sharedCockpitMaterial);
          cockpit.scale.set(0.72, 0.55, 1.05);
          cockpit.position.set(0, 0.28, -0.12);
          group.add(cockpit);

          for (const side of [-1, 1]) {
            for (const axle of [-1, 1]) {
              const wheel = new THREE.Mesh(sharedWheelGeometry, sharedWheelMaterial);
              wheel.rotation.z = Math.PI / 2;
              wheel.position.set(side * 0.58, -0.08, axle * 0.82);
              group.add(wheel);
            }
          }

          const marker = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xf3e6c5, depthTest: false }));
          marker.scale.set(1.15, 0.55, 1);
          marker.position.set(0, 1.5, 0);
          group.add(marker);
          group.userData.positionLabel = point.position;
          scene.add(group);
          vehicleGroups.push(group);
        }

        const updateVehicles = () => {
          for (let index = 0; index < vehicleGroups.length; index += 1) {
            const point = projection.points[index];
            const current = new THREE.Vector3((point.x - 0.5) * 120, 0, (point.y - 0.5) * 120);
            const nextLayoutIndex = Math.max(0, projection.layout.findIndex((entry) => entry.id === point.segmentId));
            const nextPoint = projection.layout[Math.min(projection.layout.length - 1, nextLayoutIndex + 1)] ?? projection.layout[1];
            const dx = nextPoint.x - point.x;
            const dz = -(nextPoint.y - point.y);
            const heading = Math.atan2(dx, dz);
            const group = vehicleGroups[index];
            group.position.set(current.x, 0.72, current.z);
            group.rotation.y = heading;
          }
        };
        updateVehicles();

        let targetPosition = new THREE.Vector3(...CAMERA_PRESETS[preset].position);
        let frame = 0;
        const animate = () => {
          if (disposed || document.hidden) return;
          camera.position.lerp(targetPosition, 0.045);
          camera.lookAt(target);
          renderer?.render(scene, camera);
          frame = window.requestAnimationFrame(animate);
        };
        const resize = () => {
          if (!host || !renderer) return;
          const nextWidth = Math.max(1, host.clientWidth);
          const nextHeight = Math.max(1, host.clientHeight);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight, false);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        document.addEventListener("visibilitychange", animate);
        animate();

        cleanup = () => {
          window.cancelAnimationFrame(frame);
          document.removeEventListener("visibilitychange", animate);
          resizeObserver?.disconnect();
          scene.traverse((object) => {
            if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
              object.geometry?.dispose?.();
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => {
                if (material !== sharedWheelMaterial && material !== sharedWingMaterial && material !== sharedCockpitMaterial && !ownedMaterials.includes(material)) return;
                material.dispose();
              });
            }
          });
          [groundGeometry, trackGeometry, startMarkerGeometry, sharedWheelGeometry, sharedBodyGeometry, sharedNoseGeometry, sharedWingGeometry, sharedRearWingGeometry, sharedCockpitGeometry].forEach((geometry) => geometry.dispose());
          [groundMaterial, trackMaterial, startMarkerMaterial, sharedWheelMaterial, sharedWingMaterial, sharedCockpitMaterial, ...ownedMaterials].forEach((material) => material.dispose());
          renderer?.dispose();
          renderer?.domElement.remove();
        };

        (host as HTMLDivElement & { setCameraPreset?: (next: CameraPreset) => void }).setCameraPreset = (next) => {
          targetPosition = new THREE.Vector3(...CAMERA_PRESETS[next].position);
        };
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "3D replay gagal dimuat.");
      }
    };

    setError("");
    void boot();
    return () => {
      disposed = true;
      cleanup?.();
      resizeObserver?.disconnect();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [projection, preset]);

  const selectPreset = (next: CameraPreset) => {
    setPreset(next);
    const host = hostRef.current as (HTMLDivElement & { setCameraPreset?: (value: CameraPreset) => void }) | null;
    host?.setCameraPreset?.(next);
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
