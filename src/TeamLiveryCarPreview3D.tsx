import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createF1Car2026, type F1Car2026Asset } from "./lib/three-f1-car/createF1Car2026";
import { buildF1Appearance, type TeamCarLiveryDesign, type TeamCarSponsor } from "./lib/team-livery-car";

type Props = {
  design: TeamCarLiveryDesign;
  sponsors: readonly TeamCarSponsor[];
};

export function F1Car2026Preview({ design, sponsors }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<F1Car2026Asset | null>(null);
  const appearance = useMemo(() => buildF1Appearance(design, sponsors), [design, sponsors]);
  const appearanceRef = useRef(appearance);
  const [error, setError] = useState("");

  appearanceRef.current = appearance;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let lastFrameTime = 0;
    let contextLost = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let car: F1Car2026Asset | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let environmentTarget: THREE.WebGLRenderTarget | null = null;
    let floorGeometry: THREE.BufferGeometry | null = null;
    let floorMaterial: THREE.Material | null = null;
    let visibilityHandler: (() => void) | null = null;

    try {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
        stencil: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = false;
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", "Interactive 2026 single-seater team livery preview");
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#111419");

      const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
      camera.position.set(6.8, 4.4, 7.2);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environmentTarget = pmrem.fromScene(room, 0.04);
      scene.environment = environmentTarget.texture;
      room.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose();
      });
      pmrem.dispose();

      scene.add(new THREE.HemisphereLight(0xffffff, 0x202630, 1.7));
      const keyLight = new THREE.DirectionalLight(0xffe6c5, 2.8);
      keyLight.position.set(-4, 8, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xb7c8dd, 1.15);
      fillLight.position.set(5, 4, -5);
      scene.add(fillLight);

      floorGeometry = new THREE.CircleGeometry(4.6, 48);
      floorMaterial = new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.96, metalness: 0 });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.025;
      scene.add(floor);

      car = createF1Car2026({
        lod: "game-low",
        livery: "rosso-corsa",
        tireCompound: "medium",
        maxAnisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
        appearance: appearanceRef.current,
      });
      car.group.name = "CALERIS_2026_TEAM_CHASSIS";
      scene.add(car.group);
      carRef.current = car;

      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.48, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.enablePan = false;
      controls.minDistance = 5.8;
      controls.maxDistance = 14.5;
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.update();

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

      const onContextLost = (event: Event) => {
        event.preventDefault();
        contextLost = true;
        window.cancelAnimationFrame(frame);
        if (!disposed) setError("Konteks grafis terputus. Muat ulang preview atau gunakan perangkat dengan WebGL aktif.");
      };
      const onContextRestored = () => {
        contextLost = false;
        if (!disposed) {
          setError("");
          lastFrameTime = 0;
          render();
        }
      };
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);
      renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

      const render = () => {
        if (disposed || document.hidden || contextLost) return;
        const now = performance.now();
        if (lastFrameTime && now - lastFrameTime < 1000 / 30) {
          frame = window.requestAnimationFrame(render);
          return;
        }
        const delta = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 1 / 30;
        lastFrameTime = now;
        controls?.update();
        car?.updateAnimation(delta, 0, 0);
        renderer?.render(scene, camera);
        frame = window.requestAnimationFrame(render);
      };
      visibilityHandler = () => {
        if (document.hidden) {
          window.cancelAnimationFrame(frame);
        } else if (!contextLost) {
          lastFrameTime = 0;
          render();
        }
      };
      document.addEventListener("visibilitychange", visibilityHandler);
      setError("");
      render();

      const cleanupContextEvents = () => {
        renderer?.domElement.removeEventListener("webglcontextlost", onContextLost);
        renderer?.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      };
      host.dataset.previewReady = "true";
      (host as HTMLDivElement & { __cleanupContextEvents?: () => void }).__cleanupContextEvents = cleanupContextEvents;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "3D chassis gagal dimuat.");
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      resizeObserver?.disconnect();
      (host as HTMLDivElement & { __cleanupContextEvents?: () => void }).__cleanupContextEvents?.();
      delete (host as HTMLDivElement & { __cleanupContextEvents?: () => void }).__cleanupContextEvents;
      controls?.dispose();
      car?.dispose();
      carRef.current = null;
      floorGeometry?.dispose();
      floorMaterial?.dispose();
      environmentTarget?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      delete host.dataset.previewReady;
    };
  }, []);

  useEffect(() => {
    carRef.current?.setAppearance(appearance);
  }, [appearance]);

  return (
    <div className="team-livery-3d" ref={hostRef}>
      <span>2026 CHASSIS · GAME LOD · DRAG TO ORBIT · SCROLL TO ZOOM</span>
      {error && <div className="team-livery-3d-error" role="status">{error}</div>}
    </div>
  );
}
