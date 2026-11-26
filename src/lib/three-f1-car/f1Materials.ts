import * as THREE from 'three';
import type { LiveryPreset, TireCompoundSpec } from './f1Chassis2026Spec';
import {
  SPONSOR_SLOTS,
  SponsorSlotConfig,
  SponsorSlotId,
  createDefaultSponsorSlots,
  drawBodyLiveryCanvas,
  drawSponsorSlotCanvas,
  normalizeHexColor,
  sanitizeCarNumber,
} from './f1Decals';

export interface F1AppearanceConfig {
  primaryHex: string;
  secondaryHex: string;
  decalHex: string;
  accentHex: string;
  decalId: string;
  carNumber: string;
  sponsorSlots: Record<SponsorSlotId, SponsorSlotConfig>;
  decalPeel: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  rimAccent?: string;
}

export interface F1MaterialLibrary {
  liveryPrimary: THREE.MeshPhysicalMaterial;
  liverySecondary: THREE.MeshPhysicalMaterial;
  liveryAccent: THREE.MeshStandardMaterial;
  carbonWeave: THREE.MeshStandardMaterial;
  carbonMatte: THREE.MeshStandardMaterial;
  titanium: THREE.MeshPhysicalMaterial;
  chromeSteel: THREE.MeshStandardMaterial;
  tireTread: THREE.MeshStandardMaterial;
  tireSidewall: THREE.MeshStandardMaterial;
  wheelCover: THREE.MeshStandardMaterial;
  wheelNutLeft: THREE.MeshStandardMaterial;
  wheelNutRight: THREE.MeshStandardMaterial;
  brakeDisc: THREE.MeshStandardMaterial;
  brakeCaliper: THREE.MeshStandardMaterial;
  visorIridescent: THREE.MeshPhysicalMaterial;
  helmetShell: THREE.MeshPhysicalMaterial;
  steeringDisplay: THREE.MeshStandardMaterial;
  rainLight: THREE.MeshStandardMaterial;
  noseNumberDecal: THREE.MeshStandardMaterial;
  sponsorSlotMaterials: Record<SponsorSlotId, THREE.MeshStandardMaterial>;
  exhaustTip: THREE.MeshPhysicalMaterial;
  textures: THREE.Texture[];
  updateLivery: (livery: LiveryPreset) => void;
  updateAppearance: (cfg: F1AppearanceConfig, onAsyncReady?: () => void) => void;
  updateTireCompound: (compound: TireCompoundSpec) => void;
  dispose: () => void;
}

export function appearanceFromPreset(livery: LiveryPreset): F1AppearanceConfig {
  return {
    primaryHex: livery.primary,
    secondaryHex: livery.secondary,
    decalHex: livery.accent,
    accentHex: livery.rimAccent,
    decalId: 'decal-01',
    carNumber: livery.numberText,
    sponsorSlots: createDefaultSponsorSlots(),
    decalPeel: 0,
    metalness: livery.metalness,
    roughness: livery.roughness,
    clearcoat: livery.clearcoat,
    rimAccent: livery.rimAccent,
  };
}

function createCarbonWeaveTextures(): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 128;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#14171d';
  cCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#606060';
  bCtx.fillRect(0, 0, size, size);

  const cell = 16;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const phase = ((x / cell) + (y / cell)) % 2 === 0;
      const grad = cCtx.createLinearGradient(
        x,
        y,
        phase ? x + cell : x,
        phase ? y : y + cell,
      );
      grad.addColorStop(0, '#0f1116');
      grad.addColorStop(0.5, '#262b35');
      grad.addColorStop(1, '#101318');
      cCtx.fillStyle = grad;
      cCtx.fillRect(x, y, cell - 1, cell - 1);

      const bGrad = bCtx.createLinearGradient(
        x,
        y,
        phase ? x + cell : x,
        phase ? y : y + cell,
      );
      bGrad.addColorStop(0, '#444444');
      bGrad.addColorStop(0.5, '#d8d8d8');
      bGrad.addColorStop(1, '#444444');
      bCtx.fillStyle = bGrad;
      bCtx.fillRect(x, y, cell - 1, cell - 1);
    }
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(14, 14);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(14, 14);

  return { colorMap, bumpMap };
}

function createTireSidewallCanvasTexture(compound: TireCompoundSpec): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#17191e';
  ctx.fillRect(0, 0, size, size);

  for (let r = 140; r < 252; r += 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = r % 6 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.save();
  ctx.strokeStyle = compound.stripeColor;
  ctx.lineWidth = 15;
  ctx.lineCap = 'butt';
  const ringR = 198;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0.28, Math.PI - 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, Math.PI + 0.28, Math.PI * 2 - 0.28);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, 166, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = compound.stripeColor;
  ctx.font = '700 22px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P ZERO 26', cx, cy - 198);
  ctx.save();
  ctx.translate(cx, cy + 198);
  ctx.rotate(Math.PI);
  ctx.fillText(`18" · ${compound.label.toUpperCase()}`, 0, 0);
  ctx.restore();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTireTreadCanvasTexture(grooved: boolean): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? '#747474' : '#8b8b8b';
    ctx.fillRect(x, 0, 2, size);
  }

  if (grooved) {
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 8;
    for (let y = -size; y < size * 2; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size * 0.45, y + 26);
      ctx.moveTo(size, y);
      ctx.lineTo(size * 0.55, y + 26);
      ctx.stroke();
    }
    ctx.fillStyle = '#181818';
    ctx.fillRect(size * 0.44, 0, 7, size);
    ctx.fillRect(size * 0.53, 0, 7, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  return tex;
}

function createSteeringDisplayTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, 256, 128);

  const ledColors = [
    '#22c55e', '#22c55e', '#22c55e', '#22c55e',
    '#ef4444', '#ef4444', '#ef4444', '#ef4444',
    '#3b82f6', '#3b82f6', '#3b82f6', '#3b82f6',
  ];
  ledColors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(22 + i * 19, 16, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 54px "Chakra Petch", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('7', 128, 86);

  ctx.fillStyle = '#22d3ee';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ERS 96%', 14, 58);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('Z-AERO', 14, 108);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('-0.184', 242, 58);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('318 KPH', 242, 108);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawNoseNumberCanvas(
  canvas: HTMLCanvasElement,
  numberText: string,
  secondaryHex: string,
  accentHex: string,
  decalPeel: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = secondaryHex;
  ctx.beginPath();
  ctx.moveTo(42, 30);
  ctx.lineTo(224, 30);
  ctx.lineTo(212, 226);
  ctx.lineTo(30, 226);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.stroke();

  const label = sanitizeCarNumber(numberText);
  ctx.fillStyle = '#f8fafc';
  ctx.font = label.length > 1 ? '700 112px "Chakra Petch", sans-serif' : '700 128px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 134);

  if (decalPeel > 0.12) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.68)';
    ctx.beginPath();
    ctx.moveTo(35, 165);
    ctx.lineTo(40 + decalPeel * 165, 145);
    ctx.lineTo(30 + decalPeel * 145, 200);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#14171d';
    ctx.beginPath();
    ctx.moveTo(38, 170);
    ctx.lineTo(38 + decalPeel * 150, 152);
    ctx.lineTo(30 + decalPeel * 132, 195);
    ctx.closePath();
    ctx.fill();
  }
}

export function createF1MaterialLibrary(
  initialLivery: LiveryPreset,
  initialCompound: TireCompoundSpec,
  maxAnisotropy = 4,
  initialAppearance?: F1AppearanceConfig,
): F1MaterialLibrary {
  const textures: THREE.Texture[] = [];
  const { colorMap: carbonMap, bumpMap: carbonBump } = createCarbonWeaveTextures();
  carbonMap.anisotropy = maxAnisotropy;
  carbonBump.anisotropy = maxAnisotropy;
  textures.push(carbonMap, carbonBump);

  let sidewallTex = createTireSidewallCanvasTexture(initialCompound);
  sidewallTex.anisotropy = maxAnisotropy;
  textures.push(sidewallTex);

  let treadBumpTex = createTireTreadCanvasTexture(initialCompound.treadGrooves);
  treadBumpTex.anisotropy = maxAnisotropy;
  textures.push(treadBumpTex);

  const steeringTex = createSteeringDisplayTexture();
  steeringTex.anisotropy = maxAnisotropy;
  textures.push(steeringTex);

  const cfg0 = initialAppearance ?? appearanceFromPreset(initialLivery);

  // Dynamic Bodywork + 50 Decals + Peeling Crash Canvas (512x512)
  const bodyLiveryCanvas = document.createElement('canvas');
  bodyLiveryCanvas.width = 512;
  bodyLiveryCanvas.height = 512;
  drawBodyLiveryCanvas(bodyLiveryCanvas, {
    primaryHex: normalizeHexColor(cfg0.primaryHex, initialLivery.primary),
    secondaryHex: normalizeHexColor(cfg0.secondaryHex, initialLivery.secondary),
    decalHex: normalizeHexColor(cfg0.decalHex, initialLivery.accent),
    accentHex: normalizeHexColor(cfg0.accentHex, initialLivery.rimAccent),
    decalId: cfg0.decalId,
    decalPeel: cfg0.decalPeel,
  });
  const bodyLiveryTex = new THREE.CanvasTexture(bodyLiveryCanvas);
  bodyLiveryTex.colorSpace = THREE.SRGBColorSpace;
  bodyLiveryTex.wrapS = THREE.RepeatWrapping;
  bodyLiveryTex.wrapT = THREE.ClampToEdgeWrapping;
  bodyLiveryTex.anisotropy = maxAnisotropy;
  textures.push(bodyLiveryTex);

  // Dynamic Car Number Canvas (256x256)
  const numberCanvas = document.createElement('canvas');
  numberCanvas.width = 256;
  numberCanvas.height = 256;
  drawNoseNumberCanvas(
    numberCanvas,
    cfg0.carNumber,
    normalizeHexColor(cfg0.secondaryHex, initialLivery.secondary),
    normalizeHexColor(cfg0.accentHex, initialLivery.accent),
    cfg0.decalPeel,
  );
  const numberTex = new THREE.CanvasTexture(numberCanvas);
  numberTex.colorSpace = THREE.SRGBColorSpace;
  numberTex.anisotropy = maxAnisotropy;
  textures.push(numberTex);

  // Dynamic Sponsor Slots (8 independent named meshes & textures)
  const sponsorSlotCanvases = {} as Record<SponsorSlotId, HTMLCanvasElement>;
  const sponsorSlotTextures = {} as Record<SponsorSlotId, THREE.CanvasTexture>;
  const sponsorSlotMaterials = {} as Record<SponsorSlotId, THREE.MeshStandardMaterial>;
  const cachedLogoUrls: Partial<Record<SponsorSlotId, string | null>> = {};
  const cachedLogoImgs: Partial<Record<SponsorSlotId, HTMLImageElement | null>> = {};

  SPONSOR_SLOTS.forEach((slotMeta) => {
    const sc = document.createElement('canvas');
    sc.width = 512;
    sc.height = 160;
    const slotCfg = cfg0.sponsorSlots[slotMeta.id];
    drawSponsorSlotCanvas(sc, slotMeta, slotCfg, {
      bgHex: normalizeHexColor(cfg0.secondaryHex, '#11151d'),
      accentHex: normalizeHexColor(cfg0.accentHex, initialLivery.accent),
      decalPeel: cfg0.decalPeel,
    });
    const st = new THREE.CanvasTexture(sc);
    st.colorSpace = THREE.SRGBColorSpace;
    st.anisotropy = maxAnisotropy;
    textures.push(st);
    sponsorSlotCanvases[slotMeta.id] = sc;
    sponsorSlotTextures[slotMeta.id] = st;

    sponsorSlotMaterials[slotMeta.id] = new THREE.MeshStandardMaterial({
      name: slotMeta.materialName,
      color: 0xffffff,
      map: st,
      transparent: true,
      roughness: 0.26,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  });

  const liveryPrimary = new THREE.MeshPhysicalMaterial({
    name: 'mat_livery_primary',
    color: 0xffffff,
    map: bodyLiveryTex,
    metalness: cfg0.metalness,
    roughness: cfg0.roughness,
    clearcoat: cfg0.clearcoat,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.25,
  });

  const liverySecondary = new THREE.MeshPhysicalMaterial({
    name: 'mat_livery_secondary',
    color: new THREE.Color(normalizeHexColor(cfg0.secondaryHex, initialLivery.secondary)),
    metalness: 0.25,
    roughness: 0.34,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
  });

  const liveryAccent = new THREE.MeshStandardMaterial({
    name: 'mat_livery_accent',
    color: new THREE.Color(normalizeHexColor(cfg0.decalHex, initialLivery.accent)),
    metalness: 0.4,
    roughness: 0.22,
  });

  const carbonWeave = new THREE.MeshStandardMaterial({
    name: 'mat_carbon_weave',
    color: 0xffffff,
    map: carbonMap,
    bumpMap: carbonBump,
    bumpScale: 0.004,
    roughness: 0.48,
    metalness: 0.22,
  });

  const carbonMatte = new THREE.MeshStandardMaterial({
    name: 'mat_carbon_matte',
    color: 0x16191f,
    bumpMap: carbonBump,
    bumpScale: 0.0025,
    roughness: 0.78,
    metalness: 0.08,
  });

  const titanium = new THREE.MeshPhysicalMaterial({
    name: 'mat_titanium',
    color: 0xaab4c0,
    metalness: 0.94,
    roughness: 0.22,
    anisotropy: 0.75,
    clearcoat: 0.2,
  });

  const chromeSteel = new THREE.MeshStandardMaterial({
    name: 'mat_chrome_steel',
    color: 0xd4dbe3,
    metalness: 0.96,
    roughness: 0.14,
  });

  const tireTread = new THREE.MeshStandardMaterial({
    name: 'mat_tire_tread',
    color: 0x191b20,
    bumpMap: treadBumpTex,
    bumpScale: initialCompound.treadGrooves ? 0.015 : 0.003,
    roughness: 0.88,
    metalness: 0.02,
  });

  const tireSidewall = new THREE.MeshStandardMaterial({
    name: 'mat_tire_sidewall',
    color: 0xffffff,
    map: sidewallTex,
    roughness: 0.76,
    metalness: 0.04,
  });

  const wheelCover = new THREE.MeshStandardMaterial({
    name: 'mat_wheel_cover',
    color: 0x181b22,
    roughness: 0.36,
    metalness: 0.45,
  });

  const wheelNutLeft = new THREE.MeshStandardMaterial({
    name: 'mat_wheel_nut_left',
    color: 0xdc2626,
    metalness: 0.85,
    roughness: 0.2,
  });

  const wheelNutRight = new THREE.MeshStandardMaterial({
    name: 'mat_wheel_nut_right',
    color: 0x2563eb,
    metalness: 0.85,
    roughness: 0.2,
  });

  const brakeDisc = new THREE.MeshStandardMaterial({
    name: 'mat_brake_disc',
    color: 0x3b3f47,
    metalness: 0.65,
    roughness: 0.42,
  });

  const brakeCaliper = new THREE.MeshStandardMaterial({
    name: 'mat_brake_caliper',
    color: new THREE.Color(normalizeHexColor(cfg0.rimAccent ?? cfg0.accentHex, initialLivery.rimAccent)),
    metalness: 0.82,
    roughness: 0.24,
  });

  const visorIridescent = new THREE.MeshPhysicalMaterial({
    name: 'mat_visor_iridescent',
    color: 0x0b172a,
    metalness: 0.88,
    roughness: 0.06,
    clearcoat: 1.0,
    iridescence: 1.0,
    iridescenceIOR: 1.38,
    iridescenceThicknessMinimum: 180,
    iridescenceThicknessMaximum: 420,
  });

  const helmetShell = new THREE.MeshPhysicalMaterial({
    name: 'mat_helmet_shell',
    color: new THREE.Color(normalizeHexColor(cfg0.accentHex, initialLivery.accent)),
    metalness: 0.55,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const steeringDisplay = new THREE.MeshStandardMaterial({
    name: 'mat_steering_display',
    color: 0xffffff,
    map: steeringTex,
    emissive: 0xffffff,
    emissiveMap: steeringTex,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.1,
  });

  const rainLight = new THREE.MeshStandardMaterial({
    name: 'mat_rain_light',
    color: 0xff1a1a,
    emissive: 0xff1a1a,
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.1,
  });

  const noseNumberDecal = new THREE.MeshStandardMaterial({
    name: 'mat_nose_number',
    color: 0xffffff,
    map: numberTex,
    transparent: true,
    roughness: 0.25,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const exhaustTip = new THREE.MeshPhysicalMaterial({
    name: 'mat_exhaust_titanium',
    color: 0x8b7e74,
    metalness: 0.92,
    roughness: 0.24,
    iridescence: 0.65,
    iridescenceIOR: 1.45,
    iridescenceThicknessMinimum: 140,
    iridescenceThicknessMaximum: 380,
  });

  const allMaterials: THREE.Material[] = [
    liveryPrimary,
    liverySecondary,
    liveryAccent,
    carbonWeave,
    carbonMatte,
    titanium,
    chromeSteel,
    tireTread,
    tireSidewall,
    wheelCover,
    wheelNutLeft,
    wheelNutRight,
    brakeDisc,
    brakeCaliper,
    visorIridescent,
    helmetShell,
    steeringDisplay,
    rainLight,
    noseNumberDecal,
    ...Object.values(sponsorSlotMaterials),
    exhaustTip,
  ];

  function applyAppearanceInternal(cfg: F1AppearanceConfig, onAsyncReady?: () => void) {
    const primary = normalizeHexColor(cfg.primaryHex, '#d4121f');
    const secondary = normalizeHexColor(cfg.secondaryHex, '#14171f');
    const decal = normalizeHexColor(cfg.decalHex, '#f8fafc');
    const accent = normalizeHexColor(cfg.accentHex, '#f59e0b');
    const rim = normalizeHexColor(cfg.rimAccent ?? cfg.accentHex, accent);

    liveryPrimary.metalness = cfg.metalness;
    liveryPrimary.roughness = Math.min(0.85, cfg.roughness + cfg.decalPeel * 0.18);
    liveryPrimary.clearcoat = Math.max(0.05, cfg.clearcoat * (1 - cfg.decalPeel * 0.55));

    liverySecondary.color.set(secondary);
    liveryAccent.color.set(decal);
    brakeCaliper.color.set(rim);
    helmetShell.color.set(accent);

    drawBodyLiveryCanvas(bodyLiveryCanvas, {
      primaryHex: primary,
      secondaryHex: secondary,
      decalHex: decal,
      accentHex: accent,
      decalId: cfg.decalId,
      decalPeel: cfg.decalPeel,
    });
    bodyLiveryTex.needsUpdate = true;

    drawNoseNumberCanvas(numberCanvas, cfg.carNumber, secondary, accent, cfg.decalPeel);
    numberTex.needsUpdate = true;

    SPONSOR_SLOTS.forEach((slotMeta) => {
      const slotCfg = cfg.sponsorSlots[slotMeta.id];
      const sc = sponsorSlotCanvases[slotMeta.id];
      const st = sponsorSlotTextures[slotMeta.id];

      if (slotCfg.logoDataUrl) {
        if (cachedLogoUrls[slotMeta.id] !== slotCfg.logoDataUrl) {
          cachedLogoUrls[slotMeta.id] = slotCfg.logoDataUrl;
          cachedLogoImgs[slotMeta.id] = null;
          const img = new Image();
          img.onload = () => {
            if (cachedLogoUrls[slotMeta.id] !== slotCfg.logoDataUrl) return;
            cachedLogoImgs[slotMeta.id] = img;
            drawSponsorSlotCanvas(sc, slotMeta, slotCfg, {
              bgHex: secondary,
              accentHex: accent,
              customLogoImg: img,
              decalPeel: cfg.decalPeel,
            });
            st.needsUpdate = true;
            onAsyncReady?.();
          };
          img.src = slotCfg.logoDataUrl;
        }
      } else {
        cachedLogoUrls[slotMeta.id] = null;
        cachedLogoImgs[slotMeta.id] = null;
      }

      drawSponsorSlotCanvas(sc, slotMeta, slotCfg, {
        bgHex: secondary,
        accentHex: accent,
        customLogoImg: cachedLogoImgs[slotMeta.id] ?? null,
        decalPeel: cfg.decalPeel,
      });
      st.needsUpdate = true;
    });
  }

  return {
    liveryPrimary,
    liverySecondary,
    liveryAccent,
    carbonWeave,
    carbonMatte,
    titanium,
    chromeSteel,
    tireTread,
    tireSidewall,
    wheelCover,
    wheelNutLeft,
    wheelNutRight,
    brakeDisc,
    brakeCaliper,
    visorIridescent,
    helmetShell,
    steeringDisplay,
    rainLight,
    noseNumberDecal,
    sponsorSlotMaterials,
    exhaustTip,
    textures,
    updateLivery(livery: LiveryPreset) {
      applyAppearanceInternal(appearanceFromPreset(livery));
    },
    updateAppearance: applyAppearanceInternal,
    updateTireCompound(compound: TireCompoundSpec) {
      const oldSidewall = sidewallTex;
      sidewallTex = createTireSidewallCanvasTexture(compound);
      sidewallTex.anisotropy = maxAnisotropy;
      tireSidewall.map = sidewallTex;
      tireSidewall.needsUpdate = true;
      textures.push(sidewallTex);
      oldSidewall.dispose();

      const oldTread = treadBumpTex;
      treadBumpTex = createTireTreadCanvasTexture(compound.treadGrooves);
      treadBumpTex.anisotropy = maxAnisotropy;
      tireTread.bumpMap = treadBumpTex;
      tireTread.bumpScale = compound.treadGrooves ? 0.015 : 0.003;
      tireTread.needsUpdate = true;
      textures.push(treadBumpTex);
      oldTread.dispose();
    },
    dispose() {
      allMaterials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

export function createStudioFloorTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  const bgGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 512);
  bgGrad.addColorStop(0, '#181c24');
  bgGrad.addColorStop(0.55, '#11141b');
  bgGrad.addColorStop(1, '#0b0d12');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const step = 64;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  [160, 260, 360, 460].forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = idx === 1 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(255, 255, 255, 0.075)';
    ctx.lineWidth = idx === 1 ? 2 : 1;
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 380);
  ctx.lineTo(cx, cy + 380);
  ctx.moveTo(cx - 380, cy);
  ctx.lineTo(cx + 380, cy);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
