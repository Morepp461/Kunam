export type SponsorSlotId =
  | 'slot-1'
  | 'slot-2'
  | 'slot-3'
  | 'slot-4'
  | 'slot-5'
  | 'slot-6'
  | 'slot-7'
  | 'slot-8';

export interface SponsorSlotMeta {
  id: SponsorSlotId;
  index: number;
  name: string;
  meshName: string;
  materialName: string;
}

export interface SponsorSlotConfig {
  id: SponsorSlotId;
  enabled: boolean;
  customText: string;
  logoDataUrl: string | null;
}

export const SPONSOR_SLOTS: readonly SponsorSlotMeta[] = [
  { id: 'slot-1', index: 1, name: 'Nose Tip', meshName: 'sponsor_slot_1_nose_tip', materialName: 'mat_sponsor_slot_1' },
  { id: 'slot-2', index: 2, name: 'Nose Upper', meshName: 'sponsor_slot_2_nose_upper', materialName: 'mat_sponsor_slot_2' },
  { id: 'slot-3', index: 3, name: 'Sidepod Left', meshName: 'sponsor_slot_3_sidepod_L', materialName: 'mat_sponsor_slot_3' },
  { id: 'slot-4', index: 4, name: 'Sidepod Right', meshName: 'sponsor_slot_4_sidepod_R', materialName: 'mat_sponsor_slot_4' },
  { id: 'slot-5', index: 5, name: 'Engine Cover L', meshName: 'sponsor_slot_5_engine_L', materialName: 'mat_sponsor_slot_5' },
  { id: 'slot-6', index: 6, name: 'Engine Cover R', meshName: 'sponsor_slot_6_engine_R', materialName: 'mat_sponsor_slot_6' },
  { id: 'slot-7', index: 7, name: 'Rear Wing Flap', meshName: 'sponsor_slot_7_rear_wing', materialName: 'mat_sponsor_slot_7' },
  { id: 'slot-8', index: 8, name: 'Rear Endplates', meshName: 'sponsor_slot_8_endplates', materialName: 'mat_sponsor_slot_8' },
];

export function createDefaultSponsorSlots(): Record<SponsorSlotId, SponsorSlotConfig> {
  const out = {} as Record<SponsorSlotId, SponsorSlotConfig>;
  SPONSOR_SLOTS.forEach((slot) => {
    out[slot.id] = {
      id: slot.id,
      enabled: true,
      customText: '',
      logoDataUrl: null,
    };
  });
  return out;
}

export interface DecalDesignSpec {
  id: string;
  index: number;
  name: string;
  category: 'aero' | 'geometric' | 'racing' | 'tech' | 'heritage';
}

export interface CrashEffectState {
  decalPeel: number; // 0..1
  frontWingBreak: 'none' | 'left' | 'both';
  rearWingDamaged: boolean;
  suspensionBent: boolean;
  debrisVisible: boolean;
}

const DECAL_CATALOG_RAW: Array<{ name: string; category: DecalDesignSpec['category'] }> = [
  { name: 'Apex Twin Chevron', category: 'aero' },
  { name: 'Monza Speed Spear', category: 'racing' },
  { name: 'Silverstone Slash', category: 'aero' },
  { name: 'Spa Eau Rouge Wave', category: 'aero' },
  { name: 'Suzuka Sunburst Rays', category: 'racing' },
  { name: 'Carbon Hex Matrix', category: 'tech' },
  { name: 'Checkered Velocity Fade', category: 'racing' },
  { name: 'Telemetry Pulse Wave', category: 'tech' },
  { name: 'Tri-Band Heritage', category: 'heritage' },
  { name: 'Vortex Venturi Ribbons', category: 'aero' },
  { name: 'Double Pinstripe Center', category: 'heritage' },
  { name: 'Apex Split Lightning', category: 'racing' },
  { name: 'Stealth Radar Arcs', category: 'tech' },
  { name: 'Diagonal Pit-Lane Stripes', category: 'racing' },
  { name: 'Diamond Grid Mesh', category: 'geometric' },
  { name: 'Shattered Aero Shards', category: 'geometric' },
  { name: 'Tapered Nose Arrow', category: 'aero' },
  { name: 'Circuit Track Outline', category: 'tech' },
  { name: 'Dual Sidepod Boomerang', category: 'aero' },
  { name: 'Retro 1970s Gold Band', category: 'heritage' },
  { name: 'Cyber Circuit Traces', category: 'tech' },
  { name: 'Concentric Speed Rings', category: 'geometric' },
  { name: 'Asymmetric Split Tone', category: 'racing' },
  { name: 'Micro-Dot Aero Gradient', category: 'tech' },
  { name: 'Flank Intake Accent', category: 'aero' },
  { name: 'Z-Mode Wing Stripes', category: 'aero' },
  { name: 'X-Mode Low-Drag Dart', category: 'aero' },
  { name: 'Scuderia Italian Tricolor', category: 'heritage' },
  { name: 'Woking Papaya Blade', category: 'racing' },
  { name: 'Brackley Flow Lines', category: 'aero' },
  { name: 'Stepped Camo Blocks', category: 'geometric' },
  { name: 'Zebra Test Prototype', category: 'tech' },
  { name: 'Dazzle Camo Swirl', category: 'tech' },
  { name: 'Torsion Carbon Ribs', category: 'geometric' },
  { name: 'Overlapping Triangles', category: 'geometric' },
  { name: 'Twin Tapered Rails', category: 'racing' },
  { name: 'Horizon Gradient Bands', category: 'aero' },
  { name: 'Crosshair Target Stripes', category: 'tech' },
  { name: 'Apex Crown Crest', category: 'heritage' },
  { name: 'Spine Fin Hazard Bars', category: 'racing' },
  { name: 'Mach Shockwave Cones', category: 'aero' },
  { name: 'Vector Lattice Mesh', category: 'geometric' },
  { name: 'Heritage Nose Roundel', category: 'heritage' },
  { name: 'Triple Claw Marks', category: 'racing' },
  { name: 'Optical Speed Warp', category: 'tech' },
  { name: 'Segmented Side Flashes', category: 'racing' },
  { name: 'Monocoque Spine Stripe', category: 'heritage' },
  { name: 'Angular Stealth Facets', category: 'geometric' },
  { name: 'MGU-K Energy Conduit', category: 'tech' },
  { name: 'Grand Prix Checkered Sash', category: 'heritage' },
];

export const DECAL_DESIGNS: readonly DecalDesignSpec[] = DECAL_CATALOG_RAW.map((item, idx) => ({
  id: `decal-${String(idx + 1).padStart(2, '0')}`,
  index: idx + 1,
  name: item.name,
  category: item.category,
}));

export function normalizeHexColor(input: string, fallback = '#d4121f'): string {
  const cleaned = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = cleaned[1];
    const g = cleaned[2];
    const b = cleaned[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function sanitizeCarNumber(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '26';
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return '26';
  return String(Math.min(99, parsed));
}

export function getCrashPreset(
  preset: 'intact' | 'scrape' | 'wing-break' | 'heavy',
): CrashEffectState {
  switch (preset) {
    case 'scrape':
      return {
        decalPeel: 0.65,
        frontWingBreak: 'none',
        rearWingDamaged: false,
        suspensionBent: false,
        debrisVisible: false,
      };
    case 'wing-break':
      return {
        decalPeel: 0.55,
        frontWingBreak: 'left',
        rearWingDamaged: false,
        suspensionBent: false,
        debrisVisible: true,
      };
    case 'heavy':
      return {
        decalPeel: 1.0,
        frontWingBreak: 'both',
        rearWingDamaged: true,
        suspensionBent: true,
        debrisVisible: true,
      };
    case 'intact':
    default:
      return {
        decalPeel: 0,
        frontWingBreak: 'none',
        rearWingDamaged: false,
        suspensionBent: false,
        debrisVisible: false,
      };
  }
}

/**
 * Deterministic pseudo-random helper for repeatable procedural decal & peel patterns.
 */
function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Renders one of the 50 procedural decal designs + peeling crash paint damage onto the bodywork UV canvas.
 * UV convention on lofted bodywork:
 *   x = 0..W wraps around circumference (0.25 = top spine, 0 & 0.5 = left/right flanks, 0.75 = underside)
 *   y = 0..H runs along length (top of canvas = front +Z, bottom = rear -Z because CanvasTexture flipY=true)
 */
export function drawBodyLiveryCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    primaryHex: string;
    secondaryHex: string;
    decalHex: string;
    accentHex: string;
    decalId: string;
    decalPeel: number;
  },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const designIdx = Math.max(
    1,
    DECAL_DESIGNS.find((d) => d.id === opts.decalId)?.index ?? 1,
  );

  // Base metallic/lacquer paint coat
  ctx.fillStyle = opts.primaryHex;
  ctx.fillRect(0, 0, W, H);

  // Subtle lower carbon under-skirt band along bottom flank (around u = 0.68..0.82)
  ctx.fillStyle = opts.secondaryHex;
  ctx.fillRect(W * 0.62, 0, W * 0.26, H);

  // Helper to mirror strokes symmetrically on Left (u ~ 0.12) & Right (u ~ 0.38) around top spine (u = 0.25)
  const drawSymmetric = (fn: (cx: number, dir: number) => void) => {
    ctx.save();
    fn(W * 0.25, 1);
    ctx.restore();
    ctx.save();
    // Wrap seam at u=0 / u=1 for outer +X flank
    fn(W * 0.0, 1);
    fn(W * 1.0, 1);
    ctx.restore();
  };

  ctx.fillStyle = opts.decalHex;
  ctx.strokeStyle = opts.decalHex;

  const variant = (designIdx - 1) % 10;
  const bandStyle = Math.floor((designIdx - 1) / 10); // 0..4 (5 distinct macro styles x 10 variants = 50!)
  const rand = seededRand(designIdx * 97 + 13);

  // Macro Style 0 (Designs 01-10): Aero Chevrons, Spears & Waves
  if (bandStyle === 0) {
    const count = 2 + (variant % 4);
    const widthFactor = 0.035 + (variant % 3) * 0.015;
    drawSymmetric((cx) => {
      for (let i = 0; i < count; i++) {
        const yBase = H * (0.15 + i * (0.65 / count));
        ctx.beginPath();
        ctx.moveTo(cx, yBase - H * 0.06);
        ctx.lineTo(cx + W * (0.14 + i * 0.02), yBase + H * (0.08 + variant * 0.008));
        ctx.lineTo(cx + W * (0.14 + i * 0.02), yBase + H * (0.08 + variant * 0.008) + H * widthFactor);
        ctx.lineTo(cx, yBase - H * 0.06 + H * widthFactor);
        ctx.lineTo(cx - W * (0.14 + i * 0.02), yBase + H * (0.08 + variant * 0.008) + H * widthFactor);
        ctx.lineTo(cx - W * (0.14 + i * 0.02), yBase + H * (0.08 + variant * 0.008));
        ctx.closePath();
        ctx.fill();
      }
    });
    // Accent highlight trim
    ctx.fillStyle = opts.accentHex;
    ctx.fillRect(W * 0.242, H * 0.05, W * 0.016, H * 0.9);
  }
  // Macro Style 1 (Designs 11-20): Pinstripes, Sunbursts, Lightning & Heritage Bands
  else if (bandStyle === 1) {
    const numStripes = 1 + (variant % 5);
    for (let s = 0; s < numStripes; s++) {
      const offset = (s - (numStripes - 1) * 0.5) * W * 0.032;
      ctx.fillStyle = s % 2 === 0 ? opts.decalHex : opts.accentHex;
      ctx.fillRect(W * 0.25 + offset - W * 0.008, 0, W * 0.016, H);
    }
    // Side flank slash
    ctx.fillStyle = opts.decalHex;
    [W * 0.08, W * 0.42].forEach((fx, idx) => {
      const sign = idx === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(fx, H * 0.2);
      ctx.lineTo(fx + sign * W * 0.09, H * (0.45 + variant * 0.02));
      ctx.lineTo(fx + sign * W * 0.05, H * 0.85);
      ctx.lineTo(fx - sign * W * 0.03, H * 0.85);
      ctx.closePath();
      ctx.fill();
    });
  }
  // Macro Style 2 (Designs 21-30): Tech Matrices, Hex, Circuit Traces & Micro-Dots
  else if (bandStyle === 2) {
    const step = W / (8 + (variant % 4) * 2);
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W * 0.55; x += step) {
        if (rand() > 0.42) {
          ctx.fillStyle = rand() > 0.72 ? opts.accentHex : opts.decalHex;
          if (variant % 3 === 0) {
            ctx.beginPath();
            ctx.arc(x + step * 0.5, y + step * 0.5, step * 0.24, 0, Math.PI * 2);
            ctx.fill();
          } else if (variant % 3 === 1) {
            ctx.fillRect(x + 2, y + 2, step * 0.65, step * 0.35);
          } else {
            ctx.beginPath();
            ctx.moveTo(x + step * 0.5, y + 2);
            ctx.lineTo(x + step - 2, y + step * 0.5);
            ctx.lineTo(x + step * 0.5, y + step - 2);
            ctx.lineTo(x + 2, y + step * 0.5);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  }
  // Macro Style 3 (Designs 31-40): Geometric Dazzle, Camo, Zebra & Tri-Split
  else if (bandStyle === 3) {
    const slices = 7 + variant;
    for (let i = 0; i < slices; i++) {
      const y0 = (i / slices) * H;
      const y1 = ((i + 0.55) / slices) * H;
      ctx.fillStyle = i % 3 === 0 ? opts.accentHex : opts.decalHex;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(W * 0.52, y0 + H * (variant % 2 === 0 ? 0.08 : -0.06));
      ctx.lineTo(W * 0.52, y1 + H * (variant % 2 === 0 ? 0.08 : -0.06));
      ctx.lineTo(0, y1);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Macro Style 4 (Designs 41-50): Shockwaves, Checkered Sashes, Claws & Energy Conduits
  else {
    // Checkered / segmented racing sash along flank
    const rows = 12 + variant;
    const cellH = H / rows;
    for (let r = 0; r < rows; r++) {
      if ((r + variant) % 2 === 0) {
        ctx.fillStyle = r % 4 === 0 ? opts.accentHex : opts.decalHex;
        ctx.fillRect(W * 0.14, r * cellH, W * 0.045, cellH * 0.82);
        ctx.fillRect(W * 0.315, r * cellH, W * 0.045, cellH * 0.82);
      }
    }
    // Bold nosecone/spine arc
    ctx.strokeStyle = opts.accentHex;
    ctx.lineWidth = Math.max(4, W * 0.018);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(W * 0.25, H * (0.25 + k * 0.24), W * (0.08 + k * 0.025), 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }

  // =========================================================================
  // REALISTIC CRASH PEELING DECAL & EXPOSED CARBON FIBER SCRATCH LAYER
  // =========================================================================
  if (opts.decalPeel > 0.02) {
    const peel = Math.min(1, opts.decalPeel);
    const pRand = seededRand(404 + Math.round(peel * 10));
    const scratchClusters = Math.round(10 + peel * 28);

    for (let c = 0; c < scratchClusters; c++) {
      const cx = pRand() * W * 0.58;
      const cy = pRand() * H;
      const len = W * (0.06 + pRand() * 0.16 * peel);
      const thick = W * (0.015 + pRand() * 0.04 * peel);

      // 1. White primer / clearcoat delamination halo around torn paint edge
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((pRand() - 0.5) * 0.9);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
      ctx.beginPath();
      ctx.moveTo(-len * 0.55, -thick * 0.6);
      ctx.lineTo(len * 0.52, -thick * 0.45);
      ctx.lineTo(len * 0.6, thick * 0.6);
      ctx.lineTo(-len * 0.48, thick * 0.55);
      ctx.closePath();
      ctx.fill();

      // 2. Exposed raw dark carbon-weave composite underneath
      ctx.fillStyle = '#15181e';
      ctx.beginPath();
      ctx.moveTo(-len * 0.46, -thick * 0.42);
      ctx.lineTo(len * 0.44, -thick * 0.3);
      ctx.lineTo(len * 0.48, thick * 0.42);
      ctx.lineTo(-len * 0.4, thick * 0.38);
      ctx.closePath();
      ctx.fill();

      // 3. Curled / peeling paint flap lip casting micro-shadow
      ctx.fillStyle = opts.decalHex;
      ctx.fillRect(-len * 0.48, thick * 0.36, len * 0.72, thick * 0.22);

      // 4. Tire rubber scuff streaks
      ctx.strokeStyle = 'rgba(15, 17, 22, 0.85)';
      ctx.lineWidth = Math.max(2, W * 0.006);
      ctx.beginPath();
      ctx.moveTo(-len * 0.7, (pRand() - 0.5) * thick);
      ctx.lineTo(len * 0.75, (pRand() - 0.5) * thick);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawSponsorSlotCanvas(
  canvas: HTMLCanvasElement,
  slotMeta: SponsorSlotMeta,
  slotCfg: SponsorSlotConfig,
  opts: {
    bgHex: string;
    accentHex: string;
    customLogoImg?: HTMLImageElement | null;
    decalPeel?: number;
  },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (opts.customLogoImg && opts.customLogoImg.complete && opts.customLogoImg.naturalWidth > 0) {
    const pad = W * 0.06;
    ctx.drawImage(opts.customLogoImg, pad, pad, W - pad * 2, H - pad * 2);
  } else if (slotCfg.customText.trim().length > 0) {
    // User-filled custom sponsor label
    ctx.fillStyle = opts.bgHex;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, H * 0.14);
    ctx.lineTo(W * 0.96, H * 0.14);
    ctx.lineTo(W * 0.93, H * 0.86);
    ctx.lineTo(W * 0.02, H * 0.86);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = opts.accentHex;
    ctx.fillRect(W * 0.04, H * 0.16, W * 0.04, H * 0.68);

    ctx.fillStyle = '#f8fafc';
    const label = slotCfg.customText.trim().toUpperCase().slice(0, 14);
    const fontSize = label.length > 9 ? Math.round(H * 0.28) : Math.round(H * 0.34);
    ctx.font = `700 ${fontSize}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W * 0.52, H * 0.52);
  } else {
    // Clean Empty Sponsor Placeholder Guide Frame (ready to swap in game or UI)
    ctx.fillStyle = 'rgba(12, 15, 22, 0.72)';
    ctx.fillRect(W * 0.03, H * 0.12, W * 0.94, H * 0.76);

    ctx.save();
    ctx.strokeStyle = opts.accentHex;
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 9]);
    ctx.strokeRect(W * 0.04, H * 0.14, W * 0.92, H * 0.72);
    ctx.restore();

    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${Math.round(H * 0.24)}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`SLOT 0${slotMeta.index}`, W * 0.5, H * 0.42);

    ctx.fillStyle = opts.accentHex;
    ctx.font = `600 ${Math.round(H * 0.15)}px "JetBrains Mono", monospace`;
    ctx.fillText(slotMeta.name.toUpperCase(), W * 0.5, H * 0.67);
  }

  // Peel / scrape tear over sponsor slot during crash
  if ((opts.decalPeel ?? 0) > 0.15) {
    const peel = opts.decalPeel ?? 0;
    ctx.fillStyle = '#14171d';
    ctx.beginPath();
    ctx.moveTo(W * 0.15, H * 0.22);
    ctx.lineTo(W * (0.25 + peel * 0.45), H * 0.34);
    ctx.lineTo(W * (0.2 + peel * 0.35), H * 0.74);
    ctx.lineTo(W * 0.08, H * 0.65);
    ctx.closePath();
    ctx.fill();
  }
}

