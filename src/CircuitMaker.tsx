import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Maximize2 } from "lucide-react";
import { buildCircuitMakerDefinition, circuitLayoutFromGeoJsonDraft } from "./lib/race-engine/circuit-maker";
import type { CircuitMakerSegmentInput } from "./lib/race-engine/circuit-maker";
import type { CircuitGeometryDefinition, CircuitPathPoint, CircuitCornerType, CircuitGeometrySpecifications, CircuitSourceProvenance } from "./lib/race-engine/circuit-geometry";
import type { CircuitGeoJsonImportDraft } from "./lib/race-engine/circuit-import";
import type { TrackLimitPoint } from "./lib/race-engine/track-limits";
import "./circuit-maker.css";

type Props = {
  circuitId: string;
  name: string;
  countryCode: string;
  totalLaps: number;
  value: CircuitGeometryDefinition | null;
  importedGeoJsonDraft?: CircuitGeoJsonImportDraft | null;
  sourceProvenance?: CircuitSourceProvenance | null;
  onChange: (value: CircuitGeometryDefinition | null) => void;
};
type SegmentForm = Omit<CircuitMakerSegmentInput, "distanceMeters" | "trackWidthMeters" | "gripFactor" | "lowSpeedDemand" | "highSpeedDemand" | "tractionDemand" | "brakingDemand" | "cornerRadiusMeters" | "elevationChangeMeters" | "bankingDegrees" | "gradientPercent"> & {
  distanceMeters: string;
  trackWidthMeters: string;
  gripFactor: string;
  lowSpeedDemand: string;
  highSpeedDemand: string;
  tractionDemand: string;
  brakingDemand: string;
  cornerRadiusMeters: string;
  elevationChangeMeters: string;
  bankingDegrees: string;
  gradientPercent: string;
};
const initialSegments: SegmentForm[] = [1,2,3].map((sector) => ({
  id: `sector-${sector}-segment-1`,
  sectorNumber: sector as 1|2|3,
  distanceMeters: "",
  cornerType: "straight",
  cornerRadiusMeters: "",
  trackWidthMeters: "",
  gripFactor: "1",
  lowSpeedDemand: "0.2",
  highSpeedDemand: "0.2",
  tractionDemand: "0.2",
  brakingDemand: "0.2",
  drsAvailable: false,
  ersAvailable: true,
  overtakingOpportunity: false,
  defendingOpportunity: false,
  elevationChangeMeters: "0",
  bankingDegrees: "",
  gradientPercent: ""
}));
const toPoints = (points: readonly { readonly x: number; readonly y: number }[]) => points.map((point) => `${point.x*500},${point.y*320}`).join(" ");
const numberValue = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const smoothStroke = (input: readonly {x:number;y:number}[]) => {
  if(input.length<3)return input.map((point,index)=>({id:"point-"+(index+1),...point}));
  const output:CircuitPathPoint[]=[];
  const get=(index:number)=>input[Math.max(0,Math.min(input.length-1,index))];
  for(let i=0;i<input.length-1;i++){
    const p0=get(i-1),p1=get(i),p2=get(i+1),p3=get(i+2);
    for(let step=0;step<6;step++){
      const t=step/6,t2=t*t,t3=t2*t;
      const x=.5*(2*p1.x+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3);
      const y=.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
      output.push({id:"point-"+(output.length+1),x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))});
    }
  }
  output.push({id:"point-"+(output.length+1),...input[input.length-1]});
  return output;
};

export default function CircuitMaker({ circuitId, name, countryCode, totalLaps, value, importedGeoJsonDraft = null, sourceProvenance = null, onChange }: Props) {
  const [points, setPoints] = useState<CircuitPathPoint[]>(() => value?.layout.map((point) => ({...point})) ?? []);
  const [trackLimitBoundary, setTrackLimitBoundary] = useState<TrackLimitPoint[]>(() => value?.trackLimitGeometry?.boundary.map((point) => ({...point})) ?? []);
  const [drawingMode, setDrawingMode] = useState<"centerline" | "track_limit">("centerline");
  const [segments, setSegments] = useState<SegmentForm[]>(() => value?.segments.map((segment) => ({
    ...segment,
    sectorNumber: segment.sectorNumber as 1|2|3,
    drsAvailable: segment.drsAvailable ?? false,
    ersAvailable: segment.ersAvailable ?? true,
    overtakingOpportunity: segment.overtakingOpportunity ?? false,
    defendingOpportunity: segment.defendingOpportunity ?? false,
    distanceMeters: String(segment.distanceMeters),
    trackWidthMeters: String(segment.trackWidthMeters),
    gripFactor: String(segment.gripFactor),
    lowSpeedDemand: String(segment.lowSpeedDemand),
    highSpeedDemand: String(segment.highSpeedDemand),
    tractionDemand: String(segment.tractionDemand),
    brakingDemand: String(segment.brakingDemand ?? 0),
    cornerRadiusMeters: segment.cornerRadiusMeters === null ? "" : String(segment.cornerRadiusMeters),
    elevationChangeMeters: String(segment.elevationChangeMeters),
    bankingDegrees: segment.bankingDegrees === undefined ? "" : String(segment.bankingDegrees),
    gradientPercent: segment.gradientPercent === undefined ? "" : String(segment.gradientPercent)
  })) ?? initialSegments);
  const [targetLapTime, setTargetLapTime] = useState(value ? String(value.targetLapTimeMs) : "");
  const [kind, setKind] = useState<"fictional"|"real">(value?.kind === "real" ? "real" : "fictional");
  const [activeSector, setActiveSector] = useState<1|2|3>(1);
  const [specifications, setSpecifications] = useState<CircuitGeometrySpecifications>(() => value?.specifications ?? { direction: "unknown", surface: "unknown", elevationDataStatus: "unavailable", pitLane: { enabled: false, lengthMeters: null, speedLimitKph: null, entryDistanceMeters: null, exitDistanceMeters: null }, drsZones: [], trackLimits: { method: "unverified", sourceNote: "" } });

  const inputSegments = useMemo<CircuitMakerSegmentInput[]>(() => segments.map((segment) => ({
    ...segment,
    distanceMeters: numberValue(segment.distanceMeters),
    trackWidthMeters: numberValue(segment.trackWidthMeters),
    gripFactor: numberValue(segment.gripFactor),
    lowSpeedDemand: numberValue(segment.lowSpeedDemand),
    highSpeedDemand: numberValue(segment.highSpeedDemand),
    tractionDemand: numberValue(segment.tractionDemand),
    brakingDemand: numberValue(segment.brakingDemand),
    bankingDegrees: segment.bankingDegrees.trim() === "" ? undefined : numberValue(segment.bankingDegrees),
    gradientPercent: segment.gradientPercent.trim() === "" ? undefined : numberValue(segment.gradientPercent),
    cornerRadiusMeters: segment.cornerType === "straight" ? null : numberValue(segment.cornerRadiusMeters),
    elevationChangeMeters: numberValue(segment.elevationChangeMeters)
  })), [segments]);

  const built = useMemo(() => buildCircuitMakerDefinition({
    id: circuitId || "new-circuit",
    revision: value?.revision ?? "draft-1",
    name: name || "Untitled circuit",
    countryCode: countryCode || "XX",
    totalLaps,
    targetLapTimeMs: numberValue(targetLapTime),
    layout: points,
    segments: inputSegments,
    specifications,
    kind,
    sourceProvenance: sourceProvenance ?? value?.sourceProvenance,
    trackLimitBoundary
  }), [circuitId, name, countryCode, totalLaps, targetLapTime, points, inputSegments, specifications, kind, sourceProvenance, trackLimitBoundary, value?.revision, value?.sourceProvenance]);

  const addPoint = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    if (drawingMode === "track_limit") {
      setTrackLimitBoundary((current) => [...current, { x, y }]);
      return;
    }
    setPoints((current) => {
      const open = current.length > 1 && current[0].x === current[current.length-1].x && current[0].y === current[current.length-1].y
        ? current.slice(0, -1) : current;
      return [...open, { id: `point-${open.length+1}`, x, y }];
    });
  };
  const loadImportedCenterline = () => {
    if (!importedGeoJsonDraft) return;
    setPoints(circuitLayoutFromGeoJsonDraft(importedGeoJsonDraft));
    setTrackLimitBoundary([]);
    setDrawingMode("centerline");
    setSpecifications((current) => ({
      ...current,
      elevationDataStatus: importedGeoJsonDraft.hasElevationData ? "measured" : "unavailable",
      trackLimits: { ...current.trackLimits, method: "unverified" }
    }));
  };
  const closeLoop = () => setPoints((current) => {
    if (current.length < 4) return current;
    const first = current[0], last = current[current.length-1];
    if (Math.hypot(first.x-last.x, first.y-last.y) < 0.000001) return current;
    return [...current, { ...first, id: `point-${current.length+1}` }];
  });
  const undo = () => {
    if (drawingMode === "track_limit") {
      setTrackLimitBoundary((current) => current.slice(0, -1));
      return;
    }
    setPoints((current) => {
      const open = current.length > 1 && current[0].x === current[current.length-1].x && current[0].y === current[current.length-1].y ? current.slice(0,-1) : current;
      return open.slice(0,-1);
    });
  };
  const clearActiveDrawing = () => drawingMode === "track_limit" ? setTrackLimitBoundary([]) : setPoints([]);
  const updateSegment = (id: string, key: keyof SegmentForm, next: string|boolean) => setSegments((current) => current.map((segment) => segment.id === id ? ({...segment, [key]: next}) : segment));
  const addSegment = () => setSegments((current) => [...current, {
    ...initialSegments[activeSector-1],
    id: "sector-"+activeSector+"-"+crypto.randomUUID(),
    sectorNumber: activeSector
  }]);
  const removeSegment = (id: string) => setSegments((current) => current.length > 3 ? current.filter((segment) => segment.id !== id) : current);
  const selected = segments.filter((segment) => segment.sectorNumber === activeSector);
  const publish = () => onChange(built.definition);

  return <section className="circuit-maker">
    <header className="circuit-maker-heading">
      <div><span className="section-eyebrow">CIRCUIT DESIGNER</span><h3>Circuit Maker</h3><p>Visual editor dan specification editor tersinkron dalam satu draft.</p></div>
      <span className={built.definition ? "circuit-maker-status valid" : "circuit-maker-status"}>{built.definition ? "GEOMETRY VALID" : "DRAFT INCOMPLETE"}</span>
    </header>
    <div className="circuit-maker-toolbar">
      <label>Jenis circuit<select value={kind} onChange={(event) => setKind(event.target.value as "fictional"|"real")}><option value="fictional">Fictional circuit</option><option value="real">Real circuit · provenance required</option></select></label>
      <label>Target lap time (ms)<input type="number" min="1" step="1" value={targetLapTime} onChange={(event) => setTargetLapTime(event.target.value)} placeholder="Contoh: 92000"/></label>
    </div>
    {importedGeoJsonDraft && <div className="circuit-maker-import-source">
      <div><strong>GeoJSON source available</strong><small>{importedGeoJsonDraft.points.length} points · {Math.round(importedGeoJsonDraft.totalLengthMeters).toLocaleString("id-ID")} m · {importedGeoJsonDraft.hasElevationData ? "elevation supplied" : "elevation unavailable"}</small></div>
      <button type="button" onClick={loadImportedCenterline}>Load GeoJSON centerline</button>
    </div>}
    {sourceProvenance && <p className="circuit-maker-source-note">Source provenance attached · {sourceProvenance.provider} · {sourceProvenance.licenseId} · {sourceProvenance.fidelityStatus.toUpperCase()}</p>}
<details className="circuit-maker-advanced-specs">
<summary>Advanced specifications · surface, pit lane, DRS, track limits</summary>
<div className="circuit-maker-fields">
<label>Direction<select value={specifications.direction} onChange={e=>setSpecifications(s=>({...s,direction:e.target.value as CircuitGeometrySpecifications["direction"]}))}><option value="unknown">Unknown</option><option value="clockwise">Clockwise</option><option value="counterclockwise">Counter-clockwise</option></select></label>
<label>Surface<select value={specifications.surface} onChange={e=>setSpecifications(s=>({...s,surface:e.target.value as CircuitGeometrySpecifications["surface"]}))}><option value="unknown">Unknown</option><option value="asphalt">Asphalt</option><option value="concrete">Concrete</option><option value="mixed">Mixed</option></select></label>
<label>Elevation data<select value={specifications.elevationDataStatus} onChange={e=>setSpecifications(s=>({...s,elevationDataStatus:e.target.value as CircuitGeometrySpecifications["elevationDataStatus"]}))}><option value="unavailable">Unavailable</option><option value="measured">Measured</option></select></label>
<label>Track limits<select value={specifications.trackLimits.method} onChange={e=>setSpecifications(s=>({...s,trackLimits:{...s.trackLimits,method:e.target.value as CircuitGeometrySpecifications["trackLimits"]["method"]}}))}><option value="unverified">Unverified</option><option value="segment_width">Segment width</option><option value="polygon">Measured polygon</option></select></label>
</div>
<label className="circuit-maker-note">Track-limit source note<input value={specifications.trackLimits.sourceNote} onChange={e=>setSpecifications(s=>({...s,trackLimits:{...s.trackLimits,sourceNote:e.target.value}}))}/></label>
<label className="circuit-maker-toggle"><input type="checkbox" checked={specifications.pitLane.enabled} onChange={e=>setSpecifications(s=>({...s,pitLane:{...s.pitLane,enabled:e.target.checked}}))}/> Pit lane enabled</label>
{specifications.pitLane.enabled && <div className="circuit-maker-fields"><label>Pit length (m)<input type="number" min="0.1" value={specifications.pitLane.lengthMeters??""} onChange={e=>setSpecifications(s=>({...s,pitLane:{...s.pitLane,lengthMeters:e.target.value===""?null:Number(e.target.value)}}))}/></label><label>Speed limit (km/h)<input type="number" min="1" value={specifications.pitLane.speedLimitKph??""} onChange={e=>setSpecifications(s=>({...s,pitLane:{...s.pitLane,speedLimitKph:e.target.value===""?null:Number(e.target.value)}}))}/></label><label>Entry distance (m)<input type="number" min="0" value={specifications.pitLane.entryDistanceMeters??""} onChange={e=>setSpecifications(s=>({...s,pitLane:{...s.pitLane,entryDistanceMeters:e.target.value===""?null:Number(e.target.value)}}))}/></label><label>Exit distance (m)<input type="number" min="0" value={specifications.pitLane.exitDistanceMeters??""} onChange={e=>setSpecifications(s=>({...s,pitLane:{...s.pitLane,exitDistanceMeters:e.target.value===""?null:Number(e.target.value)}}))}/></label></div>}
<div className="circuit-maker-spec-group"><div className="circuit-maker-section-title"><strong>DRS ZONES</strong><button type="button" onClick={()=>setSpecifications(s=>({...s,drsZones:[...s.drsZones,{id:"drs-"+(s.drsZones.length+1),startDistanceMeters:0,endDistanceMeters:0,detectionDistanceMeters:null}]}))}>Add DRS zone</button></div>{specifications.drsZones.map((zone,index)=><div className="circuit-maker-fields" key={zone.id}><label>Zone {index+1} start (m)<input type="number" min="0" value={zone.startDistanceMeters} onChange={e=>setSpecifications(s=>({...s,drsZones:s.drsZones.map(z=>z.id===zone.id?{...z,startDistanceMeters:Number(e.target.value)}:z)}))}/></label><label>Zone {index+1} end (m)<input type="number" min="0" value={zone.endDistanceMeters} onChange={e=>setSpecifications(s=>({...s,drsZones:s.drsZones.map(z=>z.id===zone.id?{...z,endDistanceMeters:Number(e.target.value)}:z)}))}/></label><label>Detection (m)<input type="number" min="0" value={zone.detectionDistanceMeters??""} onChange={e=>setSpecifications(s=>({...s,drsZones:s.drsZones.map(z=>z.id===zone.id?{...z,detectionDistanceMeters:e.target.value===""?null:Number(e.target.value)}:z)}))}/></label><button type="button" onClick={()=>setSpecifications(s=>({...s,drsZones:s.drsZones.filter(z=>z.id!==zone.id)}))}>Remove</button></div>)}</div>
</details>
    <div className="circuit-maker-layout">
      <div className="circuit-maker-canvas-panel">
        <div className="circuit-maker-canvas-head"><strong>TRACK CANVAS</strong><span>Centerline {points.length} · Boundary {trackLimitBoundary.length}</span></div>
        <svg viewBox="0 0 500 320" role="img" aria-label="Circuit Maker drawing canvas" onClick={addPoint}>
          <defs><pattern id="circuit-maker-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1"/></pattern></defs>
          <rect width="500" height="320" fill="url(#circuit-maker-grid)"/>
          {trackLimitBoundary.length > 2 && <polygon points={toPoints(trackLimitBoundary)} className="circuit-maker-track-boundary"/>}
          {trackLimitBoundary.length > 0 && trackLimitBoundary.length < 3 && <polyline points={toPoints(trackLimitBoundary)} className="circuit-maker-track-boundary-line"/>}
          {points.length > 1 && <polyline points={toPoints(points)} className="circuit-maker-line"/>}
          {trackLimitBoundary.map((point,index) => <circle key={"boundary-"+index} cx={point.x*500} cy={point.y*320} r={3} className="boundary-point"/>)}
          {points.map((point,index) => <circle key={point.id} cx={point.x*500} cy={point.y*320} r={index===0?6:4} className={index===0?"start":"point"}/>)}
          {points.length > 0 && <text x={points[0].x*500+10} y={points[0].y*320-10} className="circuit-maker-start-label">START / FINISH</text>}
        </svg>
        <div className="circuit-maker-canvas-actions">
          <button type="button" className={drawingMode==="centerline"?"active":""} onClick={()=>setDrawingMode("centerline")}>Draw centerline</button>
          <button type="button" className={drawingMode==="track_limit"?"active":""} onClick={()=>{setDrawingMode("track_limit");setSpecifications(s=>({...s,trackLimits:{...s.trackLimits,method:"polygon"}}));}}>Draw track boundary</button>
        </div>
        <div className="circuit-maker-canvas-actions">
          <button type="button" onClick={undo} disabled={drawingMode==="centerline"?!points.length:!trackLimitBoundary.length}>Undo active point</button>
          <button type="button" onClick={closeLoop} disabled={drawingMode!=="centerline"||points.length<4}>Close centerline</button>
          <button type="button" onClick={clearActiveDrawing} disabled={drawingMode==="centerline"?!points.length:!trackLimitBoundary.length}>Clear active drawing</button>
        </div>
        <small>{drawingMode==="centerline"?"Tap canvas to draw the centerline, then close its loop.":"Tap canvas to draw the measured track-limit boundary polygon. Polygon closure is implicit; add at least three points."}</small>
      </div>
      <div className="circuit-maker-spec-panel">
        <div className="circuit-maker-section-title"><strong>SPECIFICATION EDITOR</strong><span>Sector 1–3</span></div>
        <div className="circuit-maker-sector-tabs">{([1,2,3] as const).map((sector)=><button key={sector} type="button" className={activeSector===sector?"active":""} onClick={()=>setActiveSector(sector)}>S{sector}</button>)}<button type="button" onClick={addSegment}>+ Segment</button></div>
        {selected.map((segment) => <div className="circuit-maker-segment" key={segment.id}>
          <div className="circuit-maker-segment-head"><strong>Sector {segment.sectorNumber} · {segment.id}</strong>{selected.length>1&&<button type="button" onClick={()=>removeSegment(segment.id)}>Remove</button>}</div>
          <div className="circuit-maker-fields">
            <label>Distance (m)<input type="number" min="0.1" step="0.1" value={segment.distanceMeters} onChange={(e)=>updateSegment(segment.id,"distanceMeters",e.target.value)}/></label>
            <label>Track width (m)<input type="number" min="0.1" step="0.1" value={segment.trackWidthMeters} onChange={(e)=>updateSegment(segment.id,"trackWidthMeters",e.target.value)}/></label>
            <label>Corner type<select value={segment.cornerType} onChange={(e)=>updateSegment(segment.id,"cornerType",e.target.value)}>{(["straight","slow","medium","fast","chicane"] as CircuitCornerType[]).map((type)=><option key={type} value={type}>{type}</option>)}</select></label>
            <label>Corner radius (m)<input type="number" min="0.1" step="0.1" disabled={segment.cornerType==="straight"} value={segment.cornerRadiusMeters} onChange={(e)=>updateSegment(segment.id,"cornerRadiusMeters",e.target.value)}/></label>
            <label>Grip factor<input type="number" min="0.1" step="0.01" value={segment.gripFactor} onChange={(e)=>updateSegment(segment.id,"gripFactor",e.target.value)}/></label>
            <label>Low-speed demand<input type="number" min="0" max="1" step="0.01" value={segment.lowSpeedDemand} onChange={(e)=>updateSegment(segment.id,"lowSpeedDemand",e.target.value)}/></label>
            <label>High-speed demand<input type="number" min="0" max="1" step="0.01" value={segment.highSpeedDemand} onChange={(e)=>updateSegment(segment.id,"highSpeedDemand",e.target.value)}/></label>
            <label>Traction demand<input type="number" min="0" max="1" step="0.01" value={segment.tractionDemand} onChange={(e)=>updateSegment(segment.id,"tractionDemand",e.target.value)}/></label>
            <label>Braking demand<input type="number" min="0" max="1" step="0.01" value={segment.brakingDemand} onChange={(e)=>updateSegment(segment.id,"brakingDemand",e.target.value)}/></label>
            <label>Elevation change (m)<input type="number" step="0.1" value={segment.elevationChangeMeters} onChange={(e)=>updateSegment(segment.id,"elevationChangeMeters",e.target.value)}/></label>
            <label>Banking (degrees)<input type="number" step="0.1" value={segment.bankingDegrees} onChange={(e)=>updateSegment(segment.id,"bankingDegrees",e.target.value)}/></label>
            <label>Gradient (%)<input type="number" step="0.1" value={segment.gradientPercent} onChange={(e)=>updateSegment(segment.id,"gradientPercent",e.target.value)}/></label>
          </div>
          <div className="circuit-maker-checks">
            {([["drsAvailable","DRS zone"],["ersAvailable","ERS available"],["overtakingOpportunity","Overtake opportunity"],["defendingOpportunity","Defend opportunity"]] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={segment[key]} onChange={(e)=>updateSegment(segment.id,key,e.target.checked)}/>{label}</label>)}
          </div>
        </div>)}
        <div className="circuit-maker-summary"><span>Layout points <b>{points.length}</b></span><span>Sector distances <b>{selected.reduce((sum,item)=>sum+numberValue(item.distanceMeters),0).toLocaleString("id-ID")} m</b></span><span>Track length <b>{inputSegments.reduce((sum,item)=>sum+(Number.isFinite(item.distanceMeters)?item.distanceMeters:0),0).toLocaleString("id-ID")} m</b></span></div>
        <button type="button" className="s5-primary circuit-maker-apply" onClick={publish} disabled={!built.definition}>Apply geometry to circuit form</button>
        {built.errors.length>0 && <ul className="circuit-maker-errors">{built.errors.slice(0,8).map((error,index)=><li key={index}>{error}</li>)}</ul>}
        {value && <p className="circuit-maker-saved">Geometry draft attached · revision {value.revision}</p>}
      </div>
    </div>
    {kind==="real" && <p className="circuit-maker-warning">Real-circuit mode remains unverified until a reviewer confirms source provenance, license, geometry measurements, and fidelity. Visual drawing alone cannot approve an official circuit.</p>}
  </section>;
}
