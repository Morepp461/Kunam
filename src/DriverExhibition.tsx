import { useEffect, useMemo, useRef, useState } from "react";
import type * as Three from "three";
import type { AraCharacter } from "ara3d";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Crosshair, Gamepad2, Maximize2, Minimize2, Search, UserRound, X } from "lucide-react";
import "./driver-exhibition.css";

type DriverRow = Record<string, any>;
type Props = { drivers: DriverRow[]; gallery?: DriverRow[]; scope: string };
type SceneApi = { reset: () => void; focus: (id: string) => void; move: (key: string, active: boolean) => void; stick: (x: number, y: number) => void };

type PersistentCharacterRecord = { key: string; driverId: string; fingerprint: string; glb?: ArrayBuffer; glbGzip?: ArrayBuffer; originalByteLength?: number; savedAt: number };
const CHARACTER_CACHE_DB = "caleris-driver-model-cache";
const CHARACTER_CACHE_STORE = "models";
const CHARACTER_CACHE_VERSION = 2;
const CHARACTER_MODEL_VERSION = "race-suit-v4";
const characterModelCache = new Map<string, Promise<ArrayBuffer>>();

const openCharacterCache = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!("indexedDB" in window)) { reject(new Error("IndexedDB unavailable")); return; }
  const request = indexedDB.open(CHARACTER_CACHE_DB, CHARACTER_CACHE_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(CHARACTER_CACHE_STORE)) db.createObjectStore(CHARACTER_CACHE_STORE, { keyPath: "key" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Could not open character cache"));
});

const readCharacterCache = async (key: string): Promise<PersistentCharacterRecord | null> => {
  const db = await openCharacterCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(CHARACTER_CACHE_STORE, "readonly").objectStore(CHARACTER_CACHE_STORE).get(key);
      request.onsuccess = () => resolve((request.result as PersistentCharacterRecord | undefined) || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
};

const writeCharacterCache = async (record: PersistentCharacterRecord): Promise<void> => {
  const db = await openCharacterCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHARACTER_CACHE_STORE, "readwrite");
      tx.objectStore(CHARACTER_CACHE_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Character cache write aborted"));
    });
  } finally { db.close(); }
};

const pruneCharacterCache = async (activeCacheKeys: Set<string>): Promise<void> => {
  const db = await openCharacterCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHARACTER_CACHE_STORE, "readwrite");
      const request = tx.objectStore(CHARACTER_CACHE_STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as PersistentCharacterRecord;
        if (!activeCacheKeys.has(record.key)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Character cache cleanup aborted"));
    });
  } finally { db.close(); }
};

const toArrayBuffer = async (value: unknown): Promise<ArrayBuffer | null> => {
  if (value instanceof Blob) return value.arrayBuffer();
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  return null;
};

const hashFingerprint = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) return value;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const transformModelBytes = async (bytes: ArrayBuffer, format: "gzip" | "gunzip"): Promise<ArrayBuffer> => {
  const Constructor = format === "gzip" ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (!Constructor) throw new Error("Browser compression API unavailable");
  const stream = new Blob([bytes]).stream().pipeThrough(new Constructor("gzip"));
  return new Response(stream).arrayBuffer();
};

const compressModelBytes = (bytes: ArrayBuffer): Promise<ArrayBuffer> => transformModelBytes(bytes, "gzip");
const decompressModelBytes = (bytes: ArrayBuffer): Promise<ArrayBuffer> => transformModelBytes(bytes, "gunzip");

const numberFor = (name: string, index: number) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) | 0;
  return String(11 + Math.abs(hash + index * 7) % 88).padStart(2, "0");
};

export default function DriverExhibition({ drivers, gallery = drivers, scope }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneCardRef = useRef<HTMLDivElement>(null);
  const stickPointerRef = useRef<number | null>(null);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const apiRef = useRef<SceneApi | null>(null);
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [sceneError, setSceneError] = useState("");
  const [sceneLoading, setSceneLoading] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);
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
    setSceneLoading(drivers.length > 0);
    setLoadingCount(0);

    const boot = async () => {
      try {
        const THREE = await import("three");
        const { createCharacter } = await import("ara3d");
        if (disposed || !host) return;
        const mobile = window.matchMedia("(max-width: 760px)").matches;
        renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.35));
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.94;
        renderer.shadowMap.enabled = !mobile;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.className = "driver-exhibition-canvas";
        renderer.domElement.setAttribute("aria-label", "Interactive 3D Caleris driver exhibition hall. Drag to look around and select a driver.");
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x171411);
        scene.fog = new THREE.FogExp2(0x171411, 0.0021);
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
        const driverMotions: Array<{ character: AraCharacter | null; modelScene: Three.Group; mixer: Three.AnimationMixer; root: Three.Group; clips: Three.AnimationClip[]; elapsed: number; nextClipAt: number; activeAction: Three.AnimationAction | null }> = [];

        const material = (color: number, roughness = 0.62, metalness = 0.12) => {
          const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          disposableMaterials.push(m);
          return m;
        };
        const mesh = (geometry: Three.BufferGeometry, mat: Three.Material, parent: Three.Object3D, position?: [number, number, number], scale?: [number, number, number]) => {
          if (!disposableGeometries.includes(geometry)) disposableGeometries.push(geometry);
          const item = new THREE.Mesh(geometry, mat);
          if (position) item.position.set(...position);
          if (scale) item.scale.set(...scale);
          parent.add(item);
          return item;
        };
        const sharedBoxGeometries = new Map<string, Three.BoxGeometry>();
        const sharedCylinderGeometries = new Map<string, Three.CylinderGeometry>();
        const box = (parent: Three.Object3D, size: [number, number, number], pos: [number, number, number], mat: Three.Material) => {
          const key = size.join(":");
          let geometry = sharedBoxGeometries.get(key);
          if (!geometry) { geometry = new THREE.BoxGeometry(...size); sharedBoxGeometries.set(key, geometry); }
          return mesh(geometry, mat, parent, pos);
        };
        const cylinder = (parent: Three.Object3D, radiusTop: number, radiusBottom: number, height: number, pos: [number, number, number], mat: Three.Material) => {
          const key = [radiusTop, radiusBottom, height].join(":");
          let geometry = sharedCylinderGeometries.get(key);
          if (!geometry) { geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16); sharedCylinderGeometries.set(key, geometry); }
          return mesh(geometry, mat, parent, pos);
        };
        scene.background = new THREE.Color(0x171411);
        scene.fog = new THREE.FogExp2(0x171411, 0.0021);
        renderer.toneMappingExposure = 0.82;
        scene.add(new THREE.HemisphereLight(0xe8d5b5, 0x282019, 0.78));
        const keyLight = new THREE.DirectionalLight(0xffdfb0, 1.45);
        keyLight.position.set(-7, 15, 8);
        keyLight.castShadow = !mobile;
        keyLight.shadow.mapSize.set(1024, 1024);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xc5c9d2, 0.42);
        fillLight.position.set(10, 8, -18);
        scene.add(fillLight);

        const carpetCanvas = document.createElement("canvas");
        carpetCanvas.width = 1024; carpetCanvas.height = 1024;
        const carpetCtx = carpetCanvas.getContext("2d");
        if (carpetCtx) {
          carpetCtx.fillStyle = "#24212a"; carpetCtx.fillRect(0, 0, 1024, 1024);
          let seed = 712367;
          const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
          for (let i = 0; i < 12500; i++) {
            carpetCtx.fillStyle = ["#514b4b", "#71665c", "#393541", "#857c68", "#b0a17d"][Math.floor(rand() * 5)];
            carpetCtx.globalAlpha = 0.2 + rand() * 0.34;
            carpetCtx.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 2.2, 1 + rand() * 2.2);
          }
          carpetCtx.globalAlpha = 0.72; carpetCtx.strokeStyle = "#85834d"; carpetCtx.lineWidth = 4;
          for (let i = 0; i < 7; i++) {
            const offset = i * 19; carpetCtx.beginPath(); carpetCtx.moveTo(-80, 640 + offset);
            carpetCtx.bezierCurveTo(190, 420 - offset, 280, 930 + offset, 520, 680 - offset);
            carpetCtx.bezierCurveTo(760, 420 + offset, 820, 930 - offset, 1110, 590 + offset); carpetCtx.stroke();
          }
          carpetCtx.strokeStyle = "#b2a36d"; carpetCtx.lineWidth = 1.5;
          for (let i = 0; i < 34; i++) {
            const y = 570 + i * 9; carpetCtx.beginPath(); carpetCtx.moveTo(-30, y);
            carpetCtx.bezierCurveTo(180, y - 110, 300, y + 170, 500, y);
            carpetCtx.bezierCurveTo(700, y - 170, 830, y + 120, 1050, y - 35); carpetCtx.stroke();
          }
          carpetCtx.globalAlpha = 0.55; carpetCtx.strokeStyle = "#b8aa79"; carpetCtx.lineWidth = 2;
          for (let x = 40; x < 1024; x += 128) for (let y = 40; y < 1024; y += 128) {
            carpetCtx.beginPath(); carpetCtx.ellipse(x, y, 22, 10, Math.PI / 4, 0, Math.PI * 2); carpetCtx.stroke();
            carpetCtx.beginPath(); carpetCtx.arc(x, y, 5, 0, Math.PI * 2); carpetCtx.stroke();
          }
          carpetCtx.globalAlpha = 1;
        }
        const carpetTexture = new THREE.CanvasTexture(carpetCanvas);
        carpetTexture.colorSpace = THREE.SRGBColorSpace;
        carpetTexture.wrapS = THREE.RepeatWrapping; carpetTexture.wrapT = THREE.RepeatWrapping;
        carpetTexture.repeat.set(5, 7);
        carpetTexture.anisotropy = Math.min(4, renderer!.capabilities.getMaxAnisotropy());
        textures.push(carpetTexture);
        const floorMat = material(0xffffff, 0.88, 0.02);
        floorMat.map = carpetTexture;
        const wallMat = material(0x292521, 0.7, 0.12);
        const darkMetal = material(0x262321, 0.3, 0.78);
        const redMetal = material(0x651d25, 0.42, 0.48);
        const goldMetal = material(0x8b7045, 0.3, 0.68);
        const woodMat = material(0x302319, 0.38, 0.12);
        const ledMat = new THREE.MeshStandardMaterial({ color: 0xc39a5a, emissive: 0x9a6730, emissiveIntensity: 1.65, roughness: 0.28, metalness: 0.25 });
        disposableMaterials.push(ledMat);
        const floor = mesh(new THREE.PlaneGeometry(100, 150), floorMat, scene, [0, 0, -35]);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = !mobile;
        // Deep walnut side walls with repeated bronze pilasters and restrained wall washers.
        box(scene, [2, 12, 105], [-24, 6, -38], wallMat);
        box(scene, [2, 12, 105], [24, 6, -38], wallMat);
        box(scene, [48, 2, 2], [0, 1, -88], wallMat);
        for (const x of [-23.05, 23.05]) {
          for (let z = 2; z >= -82; z -= 9) {
            box(scene, [0.16, 10.4, 0.34], [x, 5.4, z], goldMetal);
            box(scene, [0.42, 0.16, 0.62], [x * 0.985, 8.4, z], darkMetal);
            const sconce = new THREE.PointLight(0xffbd73, 1.15, 8, 2);
            sconce.position.set(x * 0.96, 8.1, z);
            scene.add(sconce);
          }
        }
        // Curved vaulted ceiling: dark walnut shell panels, bronze ribs and warm indirect LED lines.
        for (let z = 6; z >= -84; z -= 8) {
          const shell = new THREE.Shape();
          shell.moveTo(-22, 10.2);
          shell.quadraticCurveTo(0, 20.1, 22, 10.2);
          shell.lineTo(22, 9.65);
          shell.quadraticCurveTo(0, 19.35, -22, 9.65);
          shell.closePath();
          const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shell, { depth: 8, bevelEnabled: false, steps: 1 }), woodMat);
          roof.position.z = z - 8;
          roof.receiveShadow = !mobile;
          scene.add(roof);
          disposableGeometries.push(roof.geometry);
          const points = Array.from({ length: 49 }, (_, i) => {
            const x = -21.8 + (43.6 * i) / 48;
            return new THREE.Vector3(x, 10.0 + 9.35 * Math.sqrt(Math.max(0, 1 - (x / 22) ** 2)), z - 0.12);
          });
          const arch = new THREE.CatmullRomCurve3(points);
          const rib = new THREE.Mesh(new THREE.TubeGeometry(arch, 64, 0.12, 8, false), goldMetal);
          scene.add(rib);
          disposableGeometries.push(rib.geometry);
          const ledPoints = points.map((p) => new THREE.Vector3(p.x, p.y + 0.2, p.z));
          const ledCurve = new THREE.CatmullRomCurve3(ledPoints);
          const led = new THREE.Mesh(new THREE.TubeGeometry(ledCurve, 64, 0.035, 6, false), ledMat);
          scene.add(led);
          disposableGeometries.push(led.geometry);
        }
        // Recessed ceiling coffers and subtle gold floor inlays. No banquet furniture.
        for (let z = 2; z >= -82; z -= 8) {
          box(scene, [0.08, 0.025, 7.2], [0, 0.025, z], goldMetal);
        }
        box(scene, [14, 0.2, 0.35], [0, 10.65, 2], redMetal);
        box(scene, [8, 0.12, 0.25], [0, 10.4, 2], goldMetal);

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

        // Ara 3D Gen: CC0 MakeHuman anatomy, photo-based skin textures, fitted clothing,
        // facial blendshapes and a game-ready rig with motion clips.
        const hairStyles = ["short02", "short04", "buzz", "cornrows", "box_braids"];
        const createDriver = async (driver: DriverRow, index: number) => {
          const root = new THREE.Group();
          const column = index % 4;
          const row = Math.floor(index / 4);
          root.position.set((column - 1.5) * 10.2, 0, -row * 11.2 - 1);
          root.userData.driverId = driver.id;
          const trim = material(0x20242a, 0.52, 0.28);
          const podium = new THREE.Group();
          root.add(podium);
          cylinder(podium, 1.1, 1.25, 0.32, [0, 0.16, 0], darkMetal);
          cylinder(podium, 0.94, 0.94, 0.055, [0, 0.34, 0], goldMetal);
          box(podium, [1.75, 0.7, 0.08], [0, 0.72, 1.08], trim);
          const plaque = mesh(new THREE.PlaneGeometry(1.66, 0.62), createLabel(driver.character_name || "Driver", driver.team?.name || "Independent", numberFor(driver.character_name || "Driver", index)), podium, [0, 0.72, 1.13]);
          plaque.rotation.x = -0.08;

          const genderLabel = String(driver.gender ?? driver.character_gender ?? "").toLowerCase();
          const isFemale = driver.gender === 0 || /female|woman|perempuan/.test(genderLabel);
          const seed = Math.abs((index + 1) * 7919 + String(driver.id || driver.character_name || index).split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7)) % 1000000000;
          const stableDriverId = String(driver.id || driver.character_name || seed);
          const stableVariant = [...stableDriverId].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
          const ethnicity = stableVariant % 3;
          const characterInput = {
            kind: "ara-character",
            version: 1,
            preset: isFemale ? "Athletic woman" : "Athletic man",
            params: {
              name: driver.character_name || `Caleris Driver ${index + 1}`,
              seed,
              age: 0.48 + (stableVariant % 9) * 0.012,
              gender: isFemale ? 0 : 1,
              muscle: 0.58 + (stableVariant % 4) * 0.09,
              weight: 0.38 + (stableVariant % 5) * 0.055,
              height: 0.42 + (stableVariant % 4) * 0.045,
              african: ethnicity === 0 ? 0.85 : ethnicity === 1 ? 0.12 : 0.08,
              asian: ethnicity === 1 ? 0.78 : ethnicity === 2 ? 0.72 : 0.08,
              caucasian: ethnicity === 2 ? 0.2 : ethnicity === 0 ? 0.07 : 0.1,
              skin: "auto",
              hair: hairStyles[stableVariant % hairStyles.length],
              hairColor: ["#211812", "#34251d", "#171717", "#3b2922"][stableVariant % 4],
              facialHair: isFemale ? "none" : (stableVariant % 3 === 0 ? "stubble" : "none"),
              outfit: "none",
              top: "techwear_jacket",
              jacket: "none",
              bottom: "techwear_pants",
              underwear: true,
              garmentStyles: {
                techwear_jacket: { pattern: "solid", color: "#8b202b", color2: "#17191d" },
                techwear_pants: { pattern: "solid", color: "#24272c", color2: "#8b202b" },
              },
              outfitTint: "#8b202b",
              shoes: "combat_boots",
              rig: "game",
              faceBones: true,
              faceShapes: true,
              speechShapes: true,
              restPose: "A",
              expression: "neutral",
            },
          };
          const detail = mobile ? "low" : "high";
          const cacheKey = stableDriverId + ":" + detail + ":" + CHARACTER_MODEL_VERSION;
          const fingerprintSource = JSON.stringify({ generator: "ara3d@0.7.4", pipeline: CHARACTER_MODEL_VERSION, detail, characterInput });
          const fingerprint = await hashFingerprint(fingerprintSource);
          const memoryCacheKey = cacheKey + ":" + fingerprint;
          let cachedBytes = characterModelCache.get(memoryCacheKey);
          if (!cachedBytes) {
            cachedBytes = (async () => {
              const saved = await readCharacterCache(cacheKey).catch(() => null);
              if (saved?.fingerprint === fingerprint) {
                if (saved.glbGzip?.byteLength) {
                  const restored = await decompressModelBytes(saved.glbGzip).catch(() => null);
                  if (restored?.byteLength) return restored;
                }
                if (saved.glb?.byteLength) return saved.glb;
              }
              const character = await createCharacter(characterInput, { detail, animations: ["idle", "look_around", "talk_gestures", "wave"] });
              const bytes = await toArrayBuffer((character as AraCharacter & { glb?: unknown }).glb);
              if (!bytes) { character.dispose(); throw new Error("Ara3D did not return a reusable GLB model"); }
              const compressed = await compressModelBytes(bytes).catch(() => null);
              await writeCharacterCache({ key: cacheKey, driverId: stableDriverId, fingerprint, glbGzip: compressed || undefined, glb: compressed ? undefined : bytes, originalByteLength: bytes.byteLength, savedAt: Date.now() }).catch((error) => console.warn("Could not persist driver model cache:", error));
              character.dispose();
              return bytes;
            })();
            characterModelCache.set(memoryCacheKey, cachedBytes);
            cachedBytes.catch(() => { if (characterModelCache.get(memoryCacheKey) === cachedBytes) characterModelCache.delete(memoryCacheKey); });
          }
          const glbBytes = await cachedBytes;
          if (disposed) return;
          const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
          const loader = new GLTFLoader();
          const gltf = await loader.parseAsync(glbBytes.slice(0), "");
          if (disposed) return;
          const figure = new THREE.Group();
          figure.position.y = 0.36;
          root.add(figure);
          const modelScene = gltf.scene;
          modelScene.scale.setScalar(1);
          modelScene.position.set(0, 0, 0);
          figure.add(modelScene);
          modelScene.traverse((obj) => { obj.userData.araCharacterModel = true; });
          const mixer = new THREE.AnimationMixer(modelScene);
          const clips = gltf.animations || [];
          const preferredIdle = clips.find((clip) => /idle/i.test(clip.name)) || clips[0];
          const initialAction = preferredIdle ? mixer.clipAction(preferredIdle) : null;
          initialAction?.play();
          driverMotions.push({ character: null, modelScene, mixer, root, clips, elapsed: 0, nextClipAt: 5 + (index % 4) * 1.4, activeAction: initialAction });
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

        driverObjects.forEach((root, id) => { root.visible = visibleIdsRef.current.has(id); });
        const onFilter = (event: Event) => {
          const visible = new Set((event as CustomEvent<string[]>).detail || []);
          driverObjects.forEach((root, id) => { root.visible = visible.has(id); });
        };
        window.addEventListener("caleris-driver-filter", onFilter);
        const lightCount = Math.max(4, Math.min(8, Math.ceil(drivers.length / 4)));
        for (let i = 0; i < lightCount; i++) {
          const light = new THREE.SpotLight(0xffd39a, 12, 22, Math.PI / 5, 0.78, 1.5);
          light.position.set((i % 4 - 1.5) * 10.2, 9.5, -Math.floor(i / 4) * 22 - 2);
          light.target.position.set(light.position.x, 0, light.position.z - 1);
          scene.add(light, light.target);
        }

        // Warm luminous fixtures and downlights mounted along the crown of the vaulted ceiling.
        for (let z = 2; z >= -82; z -= 16) {
          const fixture = new THREE.Group();
          fixture.position.set(0, 18.25, z);
          scene.add(fixture);
          const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.16, 20), darkMetal);
          fixture.add(housing);
          const diffuserMat = new THREE.MeshStandardMaterial({ color: 0xffe0ad, emissive: 0xffb95f, emissiveIntensity: 2.2, roughness: 0.25 });
          disposableMaterials.push(diffuserMat);
          const diffuser = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.42, 0.055, 20), diffuserMat);
          diffuser.position.y = -0.11; fixture.add(diffuser);
          const down = new THREE.PointLight(0xffd39a, mobile ? 15 : 24, 30, 1.7);
          down.position.set(0, -0.4, 0); fixture.add(down);
          const sideGlow = new THREE.PointLight(0xffbd75, 7, 18, 2);
          sideGlow.position.set(-5, -0.7, 0); fixture.add(sideGlow);
        }

        // Premium paddock wall: framed driver and team-owner portraits, motorsport memorabilia and brand plaques.
        const galleryItems = gallery.filter((item) => item && (item.character_name || item.name));
        const photoFrame = (item: DriverRow, index: number) => {
          const side = index % 2 === 0 ? -1 : 1;
          const row = Math.floor(index / 2);
          const z = 1 - row * 7.2;
          if (z < -82) return;
          const frame = new THREE.Group();
          frame.position.set(side * 22.72, 4.3, z);
          frame.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          scene.add(frame);
          box(frame, [2.2, 2.85, 0.16], [0, 0, 0], goldMetal);
          box(frame, [2.02, 2.67, 0.06], [0, 0, 0.1], darkMetal);
          const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 680;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const grad = ctx.createLinearGradient(0, 0, 0, 680); grad.addColorStop(0, "#3c4147"); grad.addColorStop(1, "#101317");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 680);
            ctx.fillStyle = "#a52a34"; ctx.fillRect(0, 0, 14, 680);
            ctx.fillStyle = "#d9c28a"; ctx.font = "700 25px Arial"; ctx.fillText(item.role === "Owner" ? "TEAM PRINCIPAL" : "CALERIS DRIVER", 34, 48);
            ctx.fillStyle = "#f4f0e8"; ctx.font = "900 37px Arial"; ctx.fillText(String(item.character_name || item.name || "MEMBER").toUpperCase().slice(0, 22), 34, 625);
            ctx.fillStyle = "#d9c28a"; ctx.font = "700 22px Arial"; ctx.fillText(String(item.team?.name || "CALERIS MASTERS").toUpperCase().slice(0, 26), 34, 660);
          }
          const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; textures.push(tex);
          const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); disposableMaterials.push(mat);
          const image = mesh(new THREE.PlaneGeometry(1.92, 2.55), mat, frame, [0, 0, 0.145]);
          if (item.avatar_url) new THREE.TextureLoader().load(item.avatar_url, (loaded) => {
            if (disposed) { loaded.dispose(); return; }
            loaded.colorSpace = THREE.SRGBColorSpace; image.material = new THREE.MeshBasicMaterial({ map: loaded, side: THREE.DoubleSide });
            textures.push(loaded); disposableMaterials.push(image.material as Three.Material);
          });
        };
        galleryItems.forEach(photoFrame);
        // Official brand artwork from repository assets. Never recreate brand marks in code.
        const loadWallLogo = (src: string, width: number, height: number, position: [number, number, number], rotationY = 0) => {
          new THREE.TextureLoader().load(src, (texture) => {
            if (disposed) { texture.dispose(); return; }
            texture.colorSpace = THREE.SRGBColorSpace;
            const logoMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
            const logo = new THREE.Mesh(new THREE.PlaneGeometry(width, height), logoMaterial);
            logo.position.set(...position);
            logo.rotation.y = rotationY;
            scene.add(logo);
            textures.push(texture);
            disposableMaterials.push(logoMaterial);
            disposableGeometries.push(logo.geometry);
          }, undefined, (error) => console.warn("Official wall logo failed to load:", src, error));
        };
        loadWallLogo("/assets/Add%20a%20heading_20260907_003952_0000.png", 12.5, 4.8, [0, 8.0, -46.85]);
        loadWallLogo("/assets/Untitled%20design_20261103_142659_0000.png", 6.2, 3.8, [-23.0, 7.8, -28], Math.PI / 2);
        for (let z = -8; z >= -78; z -= 18) {
          const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.16, 12, 28), darkMetal);
          tyre.position.set(-22.8, 2.1, z); tyre.rotation.y = Math.PI / 2; scene.add(tyre);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.045, 8, 24), goldMetal);
          rim.position.copy(tyre.position); rim.rotation.copy(tyre.rotation); scene.add(rim);
          disposableGeometries.push(tyre.geometry, rim.geometry);
        }

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let downX = 0;
        let downY = 0;
        let dragged = false;
        let focused = false;
        let stickX = 0;
        let stickY = 0;
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
        const onVisibilityChange = () => { if (!document.hidden && !disposed) { last = 0; if (!frame) frame = requestAnimationFrame(animate); } };
        document.addEventListener("visibilitychange", onVisibilityChange);
        const animate = (time: number) => {
          frame = 0;
          if (disposed || !renderer) return;
          if (document.hidden) return;
          frame = requestAnimationFrame(animate);
          const delta = Math.min((time - last) / 1000 || 0.016, 0.04);
          last = time;
          driverMotions.forEach((motion, motionIndex) => {
            if (!motion.root.visible || camera.position.distanceTo(motion.root.position) > 42) return;
            motion.mixer.update(delta);
            if (motion.character) motion.character.update(delta);
            else {
              motion.elapsed += delta;
              if (motion.elapsed >= motion.nextClipAt && motion.clips.length > 1) {
                const candidates = motion.clips.filter((clip) => clip !== motion.activeAction?.getClip());
                const nextClip = candidates[(motionIndex + Math.floor(motion.elapsed)) % Math.max(1, candidates.length)];
                if (nextClip) {
                  const nextAction = motion.mixer.clipAction(nextClip);
                  nextAction.reset().fadeIn(0.65).play();
                  motion.activeAction?.fadeOut(0.65);
                  motion.activeAction = nextAction;
                }
                motion.nextClipAt = motion.elapsed + 4 + ((motionIndex * 7) % 5);
              }
            }
          });
          yaw += (targetYaw - yaw) * Math.min(1, delta * 7);
          pitch += (targetPitch - pitch) * Math.min(1, delta * 7);
          const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
          const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          const speed = (keys.has("shift") ? 11 : 6) * delta;
          desiredPosition.addScaledVector(right, stickX * speed);
          desiredPosition.addScaledVector(forward, -stickY * speed);
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
        frame = document.hidden ? 0 : requestAnimationFrame(animate);
        const loadDriversProgressively = async () => {
          for (const [index, driver] of drivers.entries()) {
            if (disposed) return;
            try { await createDriver(driver, index); }
            catch (error) {
              console.error("Could not build realistic driver model:", driver.character_name, error);
              if (!disposed) setSceneError("Sebagian model 3D tidak berhasil dimuat. Periksa koneksi lalu muat ulang halaman.");
            }
            if (!disposed) setLoadingCount(index + 1);
          }
          if (!disposed) setSceneLoading(false);
          const activeCacheKeys = new Set(drivers.flatMap((driver) => {
            const id = String(driver.id || driver.character_name || "");
            return [id + ":low:" + CHARACTER_MODEL_VERSION, id + ":high:" + CHARACTER_MODEL_VERSION];
          }));
          void pruneCharacterCache(activeCacheKeys).catch((error) => console.warn("Could not prune removed or outdated driver cache entries:", error));
          if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
          driverObjects.forEach((root, id) => { root.visible = visibleIdsRef.current.has(id); });
        };
        void loadDriversProgressively();
        cleanup = () => {
          renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer?.domElement.removeEventListener("pointermove", onPointerMove);
          renderer?.domElement.removeEventListener("pointerup", onPointerUp);
          renderer?.domElement.removeEventListener("wheel", onWheel);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("caleris-driver-filter", onFilter);
          resizeObserver?.disconnect();
          cancelAnimationFrame(frame);
          scene.traverse((obj) => {
            if ((obj as Three.Mesh).isMesh && !obj.userData.araCharacterModel) (obj as Three.Mesh).geometry.dispose();
          });
          driverMotions.forEach((motion) => {
            motion.mixer.stopAllAction();
            motion.modelScene.removeFromParent();
            if (motion.character) motion.character.dispose();
            else motion.modelScene.traverse((obj) => {
              const mesh = obj as Three.Mesh;
              if (!mesh.isMesh) return;
              mesh.geometry.dispose();
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              materials.forEach((mat) => {
                Object.values(mat).forEach((value) => { if (value && typeof value === "object" && "isTexture" in value) (value as Three.Texture).dispose(); });
                mat.dispose();
              });
            });
          });
          disposableGeometries.forEach((g) => g.dispose());
          disposableMaterials.forEach((m) => m.dispose());
          textures.forEach((t) => t.dispose());
          renderer?.dispose();
          renderer?.domElement.remove();
          apiRef.current = null;
        };
      } catch (error) {
        if (!disposed) { setSceneLoading(false); setSceneError(error instanceof Error ? error.message : "WebGL tidak tersedia pada perangkat ini."); }
      }
    };
    void boot();
    return () => {
      disposed = true;
      setSceneLoading(false);
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
  const move = (key: string, active: boolean) => apiRef.current?.move(key, active);
  const updateStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.34);
    const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.34);
    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;
    const x = dx * scale; const y = dy * scale;
    setStickPosition({ x: x * 34, y: y * 34 });
    apiRef.current?.stick(x, y);
  };
  const resetStick = () => { stickPointerRef.current = null; setStickPosition({ x: 0, y: 0 }); apiRef.current?.stick(0, 0); };
  useEffect(() => {
    const sync = () => { const native = document.fullscreenElement === sceneCardRef.current; setIsFullscreen(native || fullscreenFallback); };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = async () => {
    const node = sceneCardRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) { await document.exitFullscreen(); return; }
    if (fullscreenFallback) { setFullscreenFallback(false); setIsFullscreen(false); return; }
    try { if (node.requestFullscreen) { await node.requestFullscreen(); return; } } catch { /* Embedded Android browsers may reject native fullscreen. */ }
    setFullscreenFallback(true); setIsFullscreen(true);
  };
  const scopeLabel = scope === "caleris-premio" ? "PREMIO" : scope === "caleris-zwei" ? "ZWEI" : "GLOBAL";

  return <section className="driver-exhibition">
    <div className={`driver-exhibition-scene${fullscreenFallback ? " driver-exhibition-fullscreen-fallback" : ""}`} ref={sceneCardRef}>
      <div className="driver-exhibition-webgl" ref={mountRef} />
      {sceneLoading && <div className="driver-scene-loading"><strong>BUILDING DRIVER MODELS</strong><span>{loadingCount} / {drivers.length} · REALISTIC 3D CHARACTERS</span><div><i style={{ width: `${drivers.length ? loadingCount / drivers.length * 100 : 0}%` }}/></div></div>}
      {sceneError && <div className="driver-scene-fallback"><strong>3D VIEW UNAVAILABLE</strong><span>{sceneError}</span><p>Gunakan browser/perangkat dengan dukungan WebGL untuk menjelajahi Driver Exhibition.</p></div>}
      <div className="driver-exhibition-vignette" />
      <header className="driver-exhibition-top">
        <div className="driver-exhibition-brand"><span>CALERIS MASTERS</span><strong>DRIVER EXHIBITION</strong></div>
        <div className="driver-exhibition-top-actions"><div className="driver-exhibition-count"><span>REGISTERED DRIVERS</span><strong>{filteredDrivers.length.toString().padStart(2, "0")} <small>/ {drivers.length.toString().padStart(2, "0")}</small></strong></div><button type="button" className="driver-fullscreen-button" onClick={(event) => { event.stopPropagation(); void toggleFullscreen(); }} style={{ pointerEvents: "auto", touchAction: "manipulation" }} aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}</button></div>
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
        <div className="driver-camera-hint"><span><Camera size={14}/> DRAG TO LOOK</span><span className="driver-desktop-hint">WASD TO MOVE</span><span>SCROLL TO ZOOM</span></div>
        <div className="driver-mobile-joystick" onPointerDown={(e) => { e.stopPropagation(); stickPointerRef.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); updateStick(e); }} onPointerMove={(e) => { if (stickPointerRef.current === e.pointerId) updateStick(e); }} onPointerUp={(e) => { if (stickPointerRef.current === e.pointerId) resetStick(); }} onPointerCancel={resetStick} onLostPointerCapture={resetStick} role="application" aria-label="Analog camera movement joystick"><div className="driver-joystick-base"><div className="driver-joystick-knob" style={{ transform: `translate(${stickPosition.x}px, ${stickPosition.y}px)` }}><Gamepad2 size={18}/></div></div><span>MOVE</span></div>
        <button className="driver-reset-camera" onClick={resetCamera}><Maximize2 size={15}/> RESET CAMERA</button>
      </div>
      {selected && <aside className="driver-selected-panel">
        <button className="driver-panel-close" onClick={() => setSelected(null)} aria-label="Close driver information"><X size={17}/></button>
        <span className="driver-panel-eyebrow"><Crosshair size={13}/> SELECTED DRIVER</span>
        <div className="driver-panel-identity"><div className="driver-panel-avatar">{(selected.avatar_url || selected.profile?.avatar_url || selected.avatarUrl) ? <img src={selected.avatar_url || selected.profile?.avatar_url || selected.avatarUrl} alt={`Foto ${selected.character_name || "driver"}`} loading="eager" referrerPolicy="no-referrer"/> : <UserRound size={27}/>}</div><div><h2>{selected.character_name || "Driver"}</h2><p>{selected.team?.name || "Independent"} · {String(selected.team?.division_key || "Unassigned").toUpperCase()}</p></div></div>
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
