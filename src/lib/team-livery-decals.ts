export type TeamLiveryDecal = { id: string; name: string; category: string };

export const TEAM_LIVERY_DECALS: TeamLiveryDecal[] = [
  {
    "id": "decal-01",
    "name": "Arrowhead",
    "category": "Aero"
  },
  {
    "id": "decal-02",
    "name": "Aero Slash",
    "category": "Aero"
  },
  {
    "id": "decal-03",
    "name": "Apex Chevron",
    "category": "Aero"
  },
  {
    "id": "decal-04",
    "name": "Twin Vortex",
    "category": "Aero"
  },
  {
    "id": "decal-05",
    "name": "Velocity Cut",
    "category": "Aero"
  },
  {
    "id": "decal-06",
    "name": "Lightning Bolt",
    "category": "Energy"
  },
  {
    "id": "decal-07",
    "name": "Split Spark",
    "category": "Energy"
  },
  {
    "id": "decal-08",
    "name": "Thunder Mark",
    "category": "Energy"
  },
  {
    "id": "decal-09",
    "name": "Pulse Strike",
    "category": "Energy"
  },
  {
    "id": "decal-10",
    "name": "Flashline",
    "category": "Energy"
  },
  {
    "id": "decal-11",
    "name": "Racing Wing",
    "category": "Wing"
  },
  {
    "id": "decal-12",
    "name": "Downforce Arc",
    "category": "Wing"
  },
  {
    "id": "decal-13",
    "name": "Winglet Sweep",
    "category": "Wing"
  },
  {
    "id": "decal-14",
    "name": "Airflow Crest",
    "category": "Wing"
  },
  {
    "id": "decal-15",
    "name": "Aero Feather",
    "category": "Wing"
  },
  {
    "id": "decal-16",
    "name": "Flame Vector",
    "category": "Flame"
  },
  {
    "id": "decal-17",
    "name": "Ignition Trail",
    "category": "Flame"
  },
  {
    "id": "decal-18",
    "name": "Heatwave",
    "category": "Flame"
  },
  {
    "id": "decal-19",
    "name": "Afterburn",
    "category": "Flame"
  },
  {
    "id": "decal-20",
    "name": "Fireline",
    "category": "Flame"
  },
  {
    "id": "decal-21",
    "name": "Carbon Weave",
    "category": "Carbon"
  },
  {
    "id": "decal-22",
    "name": "Carbon Crest",
    "category": "Carbon"
  },
  {
    "id": "decal-23",
    "name": "Twill Matrix",
    "category": "Carbon"
  },
  {
    "id": "decal-24",
    "name": "Forged Grid",
    "category": "Carbon"
  },
  {
    "id": "decal-25",
    "name": "Fiber Shift",
    "category": "Carbon"
  },
  {
    "id": "decal-26",
    "name": "Speed Stripes",
    "category": "Stripe"
  },
  {
    "id": "decal-27",
    "name": "Triple Streak",
    "category": "Stripe"
  },
  {
    "id": "decal-28",
    "name": "Offset Bands",
    "category": "Stripe"
  },
  {
    "id": "decal-29",
    "name": "Diagonal Rush",
    "category": "Stripe"
  },
  {
    "id": "decal-30",
    "name": "Pinstripe Flow",
    "category": "Stripe"
  },
  {
    "id": "decal-31",
    "name": "Geometric Diamond",
    "category": "Geometry"
  },
  {
    "id": "decal-32",
    "name": "Prism Cut",
    "category": "Geometry"
  },
  {
    "id": "decal-33",
    "name": "Facet Shield",
    "category": "Geometry"
  },
  {
    "id": "decal-34",
    "name": "Hex Pulse",
    "category": "Geometry"
  },
  {
    "id": "decal-35",
    "name": "Crystal Edge",
    "category": "Geometry"
  },
  {
    "id": "decal-36",
    "name": "Contour Wave",
    "category": "Wave"
  },
  {
    "id": "decal-37",
    "name": "Sonic Ripple",
    "category": "Wave"
  },
  {
    "id": "decal-38",
    "name": "Flow Ribbon",
    "category": "Wave"
  },
  {
    "id": "decal-39",
    "name": "Wave Crest",
    "category": "Wave"
  },
  {
    "id": "decal-40",
    "name": "Tidal Sweep",
    "category": "Wave"
  },
  {
    "id": "decal-41",
    "name": "Target Ring",
    "category": "Racing"
  },
  {
    "id": "decal-42",
    "name": "Apex Orbit",
    "category": "Racing"
  },
  {
    "id": "decal-43",
    "name": "Radial Pulse",
    "category": "Racing"
  },
  {
    "id": "decal-44",
    "name": "Compass Mark",
    "category": "Racing"
  },
  {
    "id": "decal-45",
    "name": "Orbit Trace",
    "category": "Racing"
  },
  {
    "id": "decal-46",
    "name": "Number Frame",
    "category": "Badge"
  },
  {
    "id": "decal-47",
    "name": "Shield Badge",
    "category": "Badge"
  },
  {
    "id": "decal-48",
    "name": "Chevron Stack",
    "category": "Badge"
  },
  {
    "id": "decal-49",
    "name": "Circuit Trace",
    "category": "Badge"
  },
  {
    "id": "decal-50",
    "name": "Caleris Crest",
    "category": "Badge"
  }
];

/** Draws one of fifty distinct vector decal families. Color is supplied at runtime. */
export function drawTeamLiveryDecal(ctx: CanvasRenderingContext2D, id: string, color: string, x: number, y: number, width: number, height: number) {
  const index = TEAM_LIVERY_DECALS.findIndex(item => item.id === id);
  if (index < 0) return;
  const family = Math.floor(index / 5);
  const variant = index % 5;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const unit = Math.min(width, height) * (0.38 + variant * 0.035);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate((variant - 2) * 0.08); ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, unit * 0.07); ctx.lineJoin = "round"; ctx.lineCap = "round";
  const polygon = (points: number[][]) => { ctx.beginPath(); points.forEach(([px,py],i)=>i?ctx.lineTo(px*unit,py*unit):ctx.moveTo(px*unit,py*unit)); ctx.closePath(); ctx.fill(); };
  switch (family) {
    case 0: polygon([[-1,-.35],[.25,-.35],[1,-.8],[.58,0],[1,.8],[.25,.35],[-1,.35],[-.35,0]]); break;
    case 1: polygon([[-.95,-.2],[.2,-.2],[.05,-.75],[.95,0],[.05,.75],[.2,.2],[-.95,.2]]); break;
    case 2: polygon([[-1,-.65],[-.2,-.3],[.05,-.95],[1,0],[.05,.95],[-.2,.3],[-1,.65],[-.35,0]]); break;
    case 3: ctx.beginPath(); ctx.arc(0,0,unit*(.42+variant*.05),-.95,Math.PI+.95); ctx.stroke(); ctx.beginPath();ctx.arc(0,0,unit*.2,.2,Math.PI*1.8);ctx.stroke(); break;
    case 4: polygon([[-1,-.55],[-.25,-.55],[.15,-.15],[1,-.15],[.65,.55],[-.1,.55],[-.5,.15]]); break;
    case 5: polygon([[-.18,-1],[.12,-.3],[.55,-.3],[-.1,.15],[.22,.15],[-.45,1],[-.18,.28],[-.58,.28]]); break;
    case 6: for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(-unit*.8,unit*(-.45+j*.45));ctx.lineTo(unit*.8,unit*(-.1+j*.45));ctx.stroke();} break;
    case 7: ctx.beginPath();ctx.moveTo(-unit,-unit*.25);ctx.bezierCurveTo(-unit*.4,-unit*(.95-variant*.08),unit*.25,unit*(.9-variant*.08),unit,unit*.2);ctx.lineTo(unit,unit*.52);ctx.bezierCurveTo(unit*.15,unit*(.95-variant*.08),-unit*.45,-unit*(.35-variant*.08),-unit,-unit*.25);ctx.fill();break;
    case 8: for(let j=0;j<4;j++){ctx.beginPath();ctx.arc(0,0,unit*(.18+j*.16),j*.35,Math.PI*1.4+j*.35);ctx.stroke();} break;
    case 9: polygon([[-.85,-.7],[.45,-.7],[.85,-.3],[.85,.7],[-.45,.7],[-.85,.3]]);ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.arc(0,0,unit*.22,0,Math.PI*2);ctx.fill();break;
  }
  ctx.restore();
}
