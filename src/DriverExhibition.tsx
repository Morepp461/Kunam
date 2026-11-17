import { useEffect, useMemo, useRef, useState } from "react";
import type * as Three from "three";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Crosshair, Gamepad2, Maximize2, Minimize2, Search, UserRound, X } from "lucide-react";
import "./driver-exhibition.css";

type DriverRow = Record<string, any>;
type Props = { drivers: DriverRow[]; scope: string };
type SceneApi = { reset: () => void; focus: (id: string) => void; move: (key: string, active: boolean) => void; stick: (x: number, y: number) => void };

const teamColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const palette = [0x9d2630, 0x9e8a56, 0x566a78, 0x6b3438, 0x9a633d, 0x56634f, 0x77716a, 0x314b68];
  return palette[Math.abs(hash) % palette.length];
};
const numberFor = (name: string, index: number) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) | 0;
  return String(11 + Math.abs(hash + index * 7) % 88).padStart(2, "0");
};

export default function DriverExhibition({ drivers, scope }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneCardRef = useRef<HTMLDivElement>(null);
  const stickPointerRef = useRef<number | null>(null);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const apiRef = useRef<SceneApi | null>(null);
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [sceneError, setSceneError] = useState("");
  const selectedRef = useRef<DriverRow | null>(null);
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const filteredDrivers = useMemo(() => drivers.filter((d) => {
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [d.character_name, d.team?.name, d.license].some((v) => String(v || "").toLowerCase().includes(term));
    return matchesQuery && (teamFilter === "all" || d.team?.name === teamFilter);
  }), [drivers, query, teamFilter]);
  const teams = useMemo(() => [...new Set(drivers.map((d) => d.team?.name).filter(Boolean))].sort(), [drivers]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer: Three.WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanup: (() => void) | null = null;
    const host = mountRef.current;
    if (!host) return;
    setSceneError("");

    const boot = async () => {
      try {
        const THREE = await import("three");
        if (disposed || !host) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        const mobile = window.matchMedia("(max-width: 760px)").matches;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.65));
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.32;
        renderer.shadowMap.enabled = !mobile;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.className = "driver-exhibition-canvas";
        renderer.domElement.setAttribute("aria-label", "Interactive 3D Caleris driver exhibition hall. Drag to look around and select a driver.");
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080a0d);
        scene.fog = new THREE.FogExp2(0x080a0d, 0.012);
        const camera = new THREE.PerspectiveCamera(56, host.clientWidth / host.clientHeight, 0.1, 180);
        camera.position.set(0, 3.8, 15);
        let yaw = 0;
        let pitch = -0.08;
        let targetYaw = yaw;
        let targetPitch = pitch;
        const lookTarget = new THREE.Vector3(0, 1.5, -4);
        const desiredPosition = camera.position.clone();
        const keys = new Set<string>();
        const driverObjects = new Map<string, Three.Group>();
        const selectable: Three.Object3D[] = [];
        const disposableGeometries: Three.BufferGeometry[] = [];
        const disposableMaterials: Three.Material[] = [];
        const textures: Three.Texture[] = [];

        const material = (color: number, roughness = 0.62, metalness = 0.12) => {
          const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          disposableMaterials.push(m);
          return m;
        };
        const mesh = (geometry: Three.BufferGeometry, mat: Three.Material, parent: Three.Object3D, position?: [number, number, number], scale?: [number, number, number]) => {
          disposableGeometries.push(geometry);
          const item = new THREE.Mesh(geometry, mat);
          if (position) item.position.set(...position);
          if (scale) item.scale.set(...scale);
          parent.add(item);
          return item;
        };
        const box = (parent: Three.Object3D, size: [number, number, number], pos: [number, number, number], mat: Three.Material) =>
          mesh(new THREE.BoxGeometry(...size), mat, parent, pos);
        const cylinder = (parent: Three.Object3D, radiusTop: number, radiusBottom: number, height: number, pos: [number, number, number], mat: Three.Material) =>
          mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16), mat, parent, pos);
        const sphere = (parent: Three.Object3D, pos: [number, number, number], scale: [number, number, number], mat: Three.Material) =>
          mesh(new THREE.SphereGeometry(1, 20, 14), mat, parent, pos, scale);

        scene.add(new THREE.HemisphereLight(0xdce5ef, 0x34302a, 2.15));
        const keyLight = new THREE.DirectionalLight(0xffead0, 3.1);
        keyLight.position.set(-8, 16, 10);
        keyLight.castShadow = !mobile;
        keyLight.shadow.mapSize.set(1024, 1024);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xa9c6e5, 1.45);
        fillLight.position.set(12, 8, -18);
        scene.add(fillLight);

        const floorMat = material(0x292d32, 0.3, 0.48);
        const wallMat = material(0x252a30, 0.72, 0.3);
        const darkMetal = material(0x454a50, 0.36, 0.68);
        const redMetal = material(0x8e2932, 0.34, 0.55);
        const goldMetal = material(0xb49a61, 0.3, 0.62);
        const floor = mesh(new THREE.PlaneGeometry(100, 150), floorMat, scene, [0, 0, -35]);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = !mobile;
        box(scene, [48, 12, 2], [0, 6, -48], wallMat);
        box(scene, [2, 12, 105], [-24, 6, -38], wallMat);
        box(scene, [2, 12, 105], [24, 6, -38], wallMat);
        box(scene, [48, 1, 105], [0, 12, -38], wallMat);
        for (let z = 5; z >= -84; z -= 12) {
          box(scene, [0.12, 0.025, 10], [0, 0.025, z], goldMetal);
          for (const x of [-22.8, 22.8]) {
            box(scene, [1.8, 0.3, 0.8], [x, 0.16, z], redMetal);
          }
        }
        for (const x of [-21, 21]) {
          for (let z = 2; z >= -78; z -= 18) {
            box(scene, [1.1, 11, 1.1], [x, 5.5, z], darkMetal);
            box(scene, [1.35, 0.12, 1.35], [x, 10.9, z], goldMetal);
          }
        }
        for (let z = 2; z >= -82; z -= 10) {
          box(scene, [48, 0.18, 0.28], [0, 11.35, z], darkMetal);
        }
        box(scene, [14, 0.2, 0.35], [0, 10.8, 2], redMetal);
        box(scene, [8, 0.12, 0.25], [0, 10.55, 2], goldMetal);

        const createLabel = (name: string, team: string, number: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 192;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#101317";
            ctx.fillRect(0, 0, 512, 192);
            ctx.fillStyle = "#b52d37";
            ctx.fillRect(0, 0, 9, 192);
            ctx.fillStyle = "#d8bd79";
            ctx.font = "700 28px Arial";
            ctx.fillText("DRIVER  " + number, 28, 42);
            ctx.fillStyle = "#f2f0e9";
            ctx.font = "700 38px Arial";
            ctx.fillText(name.toUpperCase().slice(0, 21), 28, 92);
            ctx.fillStyle = "#b6b8ba";
            ctx.font = "500 24px Arial";
            ctx.fillText(team.toUpperCase().slice(0, 30), 28, 143);
          }
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          textures.push(texture);
          const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide });
          disposableMaterials.push(mat);
          return mat;
        };

        const createDriver = (driver: DriverRow, index: number) => {
          const root = new THREE.Group();
          const column = index % 4;
          const row = Math.floor(index / 4);
          root.position.set((column - 1.5) * 10.2, 0, -row * 11.2 - 1);
          root.userData.driverId = driver.id;
          const suit = material(teamColor(driver.team?.name || "Caleris"), 0.76, 0.04);
          const trim = material(0x20242a, 0.52, 0.28);
          const helmet = material(0xd4d0c6, 0.26, 0.62);
          const visor = material(0x141b23, 0.18, 0.78);
          const glove = material(0x171a1e, 0.82, 0.02);
          const boot = material(0x101216, 0.74, 0.12);
          const podium = new THREE.Group();
          root.add(podium);
          cylinder(podium, 1.1, 1.25, 0.32, [0, 0.16, 0], darkMetal);
          cylinder(podium, 0.94, 0.94, 0.055, [0, 0.34, 0], goldMetal);
          box(podium, [1.75, 0.7, 0.08], [0, 0.72, 1.08], trim);
          const plaque = mesh(new THREE.PlaneGeometry(1.66, 0.62), createLabel(driver.character_name || "Driver", driver.team?.name || "Independent", numberFor(driver.character_name || "Driver", index)), podium, [0, 0.72, 1.13]);
          plaque.rotation.x = -0.08;
          const figure = new THREE.Group();
          root.add(figure);
          // Anatomical driver silhouette: exposed human face, neck, shoulders and fitted race suit.
          const pelvis = mesh(new THREE.SphereGeometry(0.34, 32, 24), suit, figure, [0, 0.78, 0]);
          pelvis.scale.set(1.05, 0.75, 0.8);
          const torso = mesh(new THREE.CapsuleGeometry(0.34, 0.72, 8, 24), suit, figure, [0, 1.38, 0]);
          torso.scale.set(1.28, 1.05, 0.82);
          sphere(figure, [0, 1.84, 0], [0.48, 0.28, 0.38], suit);
          cylinder(figure, 0.12, 0.14, 0.24, [0, 1.99, 0], skin);
          // Tailored suit seams and front zip.
          box(figure, [0.035, 0.68, 0.018], [0, 1.42, 0.31], trim);
          box(figure, [0.32, 0.055, 0.035], [0, 1.64, 0.34], goldMetal);
          box(figure, [0.34, 0.08, 0.04], [0, 1.17, 0.32], redMetal);
          for (const side of [-1, 1]) {
            const arm = mesh(new THREE.CapsuleGeometry(0.135, 0.62, 8, 18), suit, figure, [side * 0.53, 1.35, 0]);
            arm.rotation.z = side * -0.18;
            sphere(figure, [side * 0.65, 0.91, 0.015], [0.135, 0.16, 0.13], glove);
            const leg = mesh(new THREE.CapsuleGeometry(0.16, 0.66, 8, 18), suit, figure, [side * 0.2, 0.48, 0]);
            leg.rotation.z = side * 0.035;
            box(figure, [0.29, 0.17, 0.48], [side * 0.2, 0.1, 0.13], boot);
            // Gloves, cuff rings and knee reinforcement.
            cylinder(figure, 0.14, 0.14, 0.09, [side * 0.65, 0.82, 0.015], goldMetal);
            box(figure, [0.26, 0.19, 0.035], [side * 0.2, 0.47, 0.15], trim);
          }
          // Real human head with jaw, ears, eyes, nose, mouth and hair rather than a helmet-shaped capsule.
          sphere(figure, [0, 2.28, 0], [0.235, 0.31, 0.22], skin);
          sphere(figure, [0, 2.16, 0.055], [0.19, 0.16, 0.19], skinLight);
          for (const side of [-1, 1]) {
            sphere(figure, [side * 0.235, 2.29, 0], [0.055, 0.09, 0.065], skin);
            sphere(figure, [side * 0.09, 2.32, 0.187], [0.052, 0.035, 0.025], eyeWhite);
            sphere(figure, [side * 0.09, 2.32, 0.208], [0.022, 0.025, 0.012], iris);
            sphere(figure, [side * 0.09, 2.38, 0.184], [0.062, 0.018, 0.025], hair);
          }
          sphere(figure, [0, 2.25, 0.218], [0.045, 0.075, 0.045], skinLight);
          sphere(figure, [0, 2.105, 0.205], [0.075, 0.018, 0.018], visor);
          sphere(figure, [0, 2.49, -0.005], [0.238, 0.13, 0.225], hair);
          sphere(figure, [0, 2.42, -0.105], [0.22, 0.12, 0.16], hair);
          // Helmet carried at the driver's side as a separate race accessory.
          const helmetShell = material(0xd8d5cc, 0.24, 0.56);
          sphere(figure, [0.88, 0.72, 0.02], [0.22, 0.25, 0.22], helmetShell);
          sphere(figure, [0.88, 0.72, 0.2], [0.17, 0.09, 0.06], visor);
          root.traverse((obj) => {
            if ((obj as Three.Mesh).isMesh) {
              obj.userData.driverId = driver.id;
              (obj as Three.Mesh).castShadow = !mobile;
              (obj as Three.Mesh).receiveShadow = false;
            }
          });
          scene.add(root);
          driverObjects.set(driver.id, root);
          selectable.push(root);
        };

        drivers.forEach(createDriver);
        driverObjects.forEach((root, id) => { root.visible = visibleIdsRef.current.has(id); });
        const onFilter = (event: Event) => {
          const visible = new Set((event as CustomEvent<string[]>).detail || []);
          driverObjects.forEach((root, id) => { root.visible = visible.has(id); });
        };
        window.addEventListener("caleris-driver-filter", onFilter);
        const lightCount = Math.max(4, Math.min(8, Math.ceil(drivers.length / 4)));
        for (let i = 0; i < lightCount; i++) {
          const light = new THREE.SpotLight(0xffe2b6, 125, 25, Math.PI / 5, 0.7, 1.4);
          light.position.set((i % 4 - 1.5) * 10.2, 9.5, -Math.floor(i / 4) * 22 - 2);
          light.target.position.set(light.position.x, 0, light.position.z - 1);
          scene.add(light, light.target);
        }

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let downX = 0;
        let downY = 0;
        let dragged = false;
        let focused = false;\n        let stickX = 0;\n        let stickY = 0;
        const onPointerDown = (event: PointerEvent) => {
          downX = event.clientX;
          downY = event.clientY;
          dragged = false;
          renderer?.domElement.setPointerCapture?.(event.pointerId);
        };
        const onPointerMove = (event: PointerEvent) => {
          if (event.buttons === 0) return;
          const dx = event.clientX - downX;
          const dy = event.clientY - downY;
          if (Math.abs(dx) + Math.abs(dy) > 4) dragged = true;
          targetYaw -= dx * 0.0042;
          targetPitch = THREE.MathUtils.clamp(targetPitch - dy * 0.003, -0.9, 0.38);
          downX = event.clientX;
          downY = event.clientY;
          focused = false;
        };
        const onPointerUp = (event: PointerEvent) => {
          if (dragged) return;
          const rect = renderer!.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(selectable, true).find((item) => item.object.userData.driverId);
          const id = hit?.object.userData.driverId as string | undefined;
          if (id) apiRef.current?.focus(id);
        };
        const onWheel = (event: WheelEvent) => {
          event.preventDefault();
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          desiredPosition.addScaledVector(forward, event.deltaY * 0.008);
          desiredPosition.y = THREE.MathUtils.clamp(desiredPosition.y, 1.5, 9);
          focused = false;
        };
        const onKeyDown = (event: KeyboardEvent) => {
          if (["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName || "")) return;
          const key = event.key.toLowerCase();
          if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
            keys.add(key);
            event.preventDefault();
          }
        };
        const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
        const onBlur = () => keys.clear();
        const reset = () => {
          desiredPosition.set(0, 3.8, 15);
          lookTarget.set(0, 1.5, -4);
          targetYaw = 0;
          targetPitch = -0.08;
          focused = false;
        };
        const focus = (id: string) => {
          const driver = drivers.find((d) => d.id === id);
          const object = driverObjects.get(id);
          if (!driver || !object) return;
          const pos = object.position;
          desiredPosition.set(pos.x, 3.1, pos.z + 5.5);
          lookTarget.set(pos.x, 1.5, pos.z);
          targetYaw = 0;
          targetPitch = -0.08;
          focused = true;
          selectedRef.current = driver;
          window.dispatchEvent(new CustomEvent("caleris-driver-select", { detail: driver }));
        };
        apiRef.current = { reset, focus, move: (key, active) => active ? keys.add(key) : keys.delete(key), stick: (x, y) => { stickX = x; stickY = y; } };
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        const resize = () => {
          if (!host || !renderer) return;
          const width = host.clientWidth;
          const height = host.clientHeight;
          camera.aspect = width / Math.max(1, height);
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        let last = 0;
        const animate = (time: number) => {
          if (disposed || !renderer) return;
          frame = requestAnimationFrame(animate);
          const delta = Math.min((time - last) / 1000 || 0.016, 0.04);
          last = time;
          yaw += (targetYaw - yaw) * Math.min(1, delta * 7);
          pitch += (targetPitch - pitch) * Math.min(1, delta * 7);
          const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
          const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          const speed = (keys.has("shift") ? 11 : 6) * delta;\n          desiredPosition.addScaledVector(right, stickX * speed);\n          desiredPosition.addScaledVector(forward, -stickY * speed);
          if (keys.has("w") || keys.has("arrowup")) desiredPosition.addScaledVector(forward, speed);
          if (keys.has("s") || keys.has("arrowdown")) desiredPosition.addScaledVector(forward, -speed);
          if (keys.has("a") || keys.has("arrowleft")) desiredPosition.addScaledVector(right, -speed);
          if (keys.has("d") || keys.has("arrowright")) desiredPosition.addScaledVector(right, speed);
          desiredPosition.x = THREE.MathUtils.clamp(desiredPosition.x, -19, 19);
          desiredPosition.z = THREE.MathUtils.clamp(desiredPosition.z, -95, 16);
          desiredPosition.y = THREE.MathUtils.clamp(desiredPosition.y, 1.4, 9);
          camera.position.lerp(desiredPosition, Math.min(1, delta * (focused ? 2.8 : 5)));
          const direction = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
          const orbitTarget = camera.position.clone().addScaledVector(direction, 9);
          if (focused) orbitTarget.lerp(lookTarget, 0.12);
          camera.lookAt(orbitTarget);
          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(animate);
        cleanup = () => {
          renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer?.domElement.removeEventListener("pointermove", onPointerMove);
          renderer?.domElement.removeEventListener("pointerup", onPointerUp);
          renderer?.domElement.removeEventListener("wheel", onWheel);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("caleris-driver-filter", onFilter);
          resizeObserver?.disconnect();
          cancelAnimationFrame(frame);
          scene.traverse((obj) => {
            if ((obj as Three.Mesh).isMesh) {
              const m = obj as Three.Mesh;
              m.geometry.dispose();
            }
          });
          disposableGeometries.forEach((g) => g.dispose());
          disposableMaterials.forEach((m) => m.dispose());
          textures.forEach((t) => t.dispose());
          renderer?.dispose();
          renderer?.domElement.remove();
          apiRef.current = null;
        };
      } catch (error) {
        if (!disposed) setSceneError(error instanceof Error ? error.message : "WebGL tidak tersedia pada perangkat ini.");
      }
    };
    void boot();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [drivers]);

  useEffect(() => {
    const handle = (event: Event) => {
      const driver = (event as CustomEvent<DriverRow>).detail;
      if (!driver) return;
      selectedRef.current = driver;
      setSelected(driver);
    };
    window.addEventListener("caleris-driver-select", handle);
    return () => window.removeEventListener("caleris-driver-select", handle);
  }, []);

  useEffect(() => {
    const visible = new Set<string>(filteredDrivers.map((d) => d.id));
    visibleIdsRef.current = visible;
    window.dispatchEvent(new CustomEvent("caleris-driver-filter", { detail: [...visible] }));
  }, [filteredDrivers]);

  const resetCamera = () => { apiRef.current?.reset(); setSelected(null); selectedRef.current = null; };
  const move = (key: string, active: boolean) => apiRef.current?.move(key, active);\n  const updateStick = (event: ReactPointerEvent<HTMLDivElement>) => {\n    const rect = event.currentTarget.getBoundingClientRect();\n    const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.34);\n    const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.34);\n    const length = Math.hypot(dx, dy);\n    const scale = length > 1 ? 1 / length : 1;\n    const x = dx * scale; const y = dy * scale;\n    setStickPosition({ x: x * 34, y: y * 34 });\n    apiRef.current?.stick(x, y);\n  };\n  const resetStick = () => { stickPointerRef.current = null; setStickPosition({ x: 0, y: 0 }); apiRef.current?.stick(0, 0); };\n  useEffect(() => {\n    const sync = () => setIsFullscreen(document.fullscreenElement === sceneCardRef.current);\n    document.addEventListener("fullscreenchange", sync);\n    return () => document.removeEventListener("fullscreenchange", sync);\n  }, []);\n  const toggleFullscreen = async () => {\n    const node = sceneCardRef.current;\n    if (!node) return;\n    try { if (document.fullscreenElement === node) await document.exitFullscreen(); else if (node.requestFullscreen) await node.requestFullscreen(); } catch { /* Fullscreen can be unavailable in embedded browsers. */ }\n  };
  const scopeLabel = scope === "caleris-premio" ? "PREMIO" : scope === "caleris-zwei" ? "ZWEI" : "GLOBAL";

  return <section className="driver-exhibition">
    <div className="driver-exhibition-scene" ref={sceneCardRef}>\n      <div className="driver-exhibition-webgl" ref={mountRef} />
      {sceneError && <div className="driver-scene-fallback"><strong>3D VIEW UNAVAILABLE</strong><span>{sceneError}</span><p>Gunakan browser/perangkat dengan dukungan WebGL untuk menjelajahi Driver Exhibition.</p></div>}
      <div className="driver-exhibition-vignette" />
      <header className="driver-exhibition-top">
        <div className="driver-exhibition-brand"><span>CALERIS MASTERS</span><strong>DRIVER EXHIBITION</strong></div>
        <div className="driver-exhibition-top-actions"><div className="driver-exhibition-count"><span>REGISTERED DRIVERS</span><strong>{filteredDrivers.length.toString().padStart(2, "0")} <small>/ {drivers.length.toString().padStart(2, "0")}</small></strong></div><button className="driver-fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button></div>
      </header>
      <div className="driver-exhibition-heading">
        <span>THE PEOPLE BEHIND THE GRID · {scopeLabel}</span>
        <h1>MEET THE<br/><em>DRIVERS.</em></h1>
        <p>Explore the Caleris Masters driver line-up.</p>
      </div>
      <div className="driver-exhibition-filters">
        <label><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search driver..." aria-label="Search driver"/></label>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Filter team">
          <option value="all">ALL TEAMS</option>
          {teams.map((team) => <option key={team} value={team}>{team}</option>)}
        </select>
      </div>
      <div className="driver-exhibition-controls">
        <div className="driver-control-pad" aria-label="Camera movement controls">
          <button onPointerDown={() => move("w", true)} onPointerUp={() => move("w", false)} onPointerLeave={() => move("w", false)} aria-label="Move forward"><ArrowUp/></button>
          <button onPointerDown={() => move("a", true)} onPointerUp={() => move("a", false)} onPointerLeave={() => move("a", false)} aria-label="Move left"><ArrowLeft/></button>
          <button onPointerDown={() => move("s", true)} onPointerUp={() => move("s", false)} onPointerLeave={() => move("s", false)} aria-label="Move backward"><ArrowDown/></button>
          <button onPointerDown={() => move("d", true)} onPointerUp={() => move("d", false)} onPointerLeave={() => move("d", false)} aria-label="Move right"><ArrowRight/></button>
        </div>
        <div className="driver-camera-hint"><span><Camera size={14}/> DRAG TO LOOK</span><span className="driver-desktop-hint">WASD TO MOVE</span><span>SCROLL TO ZOOM</span></div>\n        <div className="driver-mobile-joystick" onPointerDown={(e) => { e.stopPropagation(); stickPointerRef.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); updateStick(e); }} onPointerMove={(e) => { if (stickPointerRef.current === e.pointerId) updateStick(e); }} onPointerUp={(e) => { if (stickPointerRef.current === e.pointerId) resetStick(); }} onPointerCancel={resetStick} onLostPointerCapture={resetStick} role="application" aria-label="Analog camera movement joystick"><div className="driver-joystick-base"><div className="driver-joystick-knob" style={{ transform: `translate(${stickPosition.x}px, ${stickPosition.y}px)` }}><Gamepad2 size={18}/></div></div><span>MOVE</span></div>
        <button className="driver-reset-camera" onClick={resetCamera}><Maximize2 size={15}/> RESET CAMERA</button>
      </div>
      {selected && <aside className="driver-selected-panel">
        <button className="driver-panel-close" onClick={() => setSelected(null)} aria-label="Close driver information"><X size={17}/></button>
        <span className="driver-panel-eyebrow"><Crosshair size={13}/> SELECTED DRIVER</span>
        <div className="driver-panel-identity"><div className="driver-panel-avatar"><UserRound size={27}/></div><div><h2>{selected.character_name || "Driver"}</h2><p>{selected.team?.name || "Independent"} · {String(selected.team?.division_key || "Unassigned").toUpperCase()}</p></div></div>
        <div className="driver-panel-license"><span>LICENSE</span><strong>{selected.license || "UNASSIGNED"}</strong></div>
        <div className="driver-panel-stats">
          <div><span>POINTS</span><strong>{Number(selected.points || 0).toLocaleString("id-ID")}</strong></div>
          <div><span>WINS</span><strong>{Number(selected.wins || 0)}</strong></div>
          <div><span>POLES</span><strong>{Number(selected.poles || 0)}</strong></div>
        </div>
        <p className="driver-panel-note">Driver statistics reflect published Caleris Masters records.</p>
      </aside>}
      <div className="driver-exhibition-footer"><span>CALERIS MASTERS · OFFICIAL DRIVER REGISTER</span><span>3D PADDOCK EXPERIENCE</span></div>
    </div>
    {filteredDrivers.length === 0 && <div className="driver-no-results">{drivers.length === 0 ? "No drivers are registered in this division yet." : "No drivers match your search."}</div>}
  </section>;
}
