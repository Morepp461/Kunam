import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock3, Flag,
  Gauge, LoaderCircle, MapPin, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Timer,
  Trophy, Waves, Wrench, Maximize2
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { createRaceEngineTestAuthHeaders } from "./lib/race-engine/api-auth";
import { buildRaceReplayProjection } from "./lib/race-engine/replay";
import "./live-race.css";

const TEST_API_URL = "https://vxwvhyyvoipjwucbrvlu.supabase.co/functions/v1/race-engine-test-service";
const TEST_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4d3ZoeXl2b2lwand1Y2Jydmx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NDU0MjksImV4cCI6MjExMDEyMTQyOX0.IPZFARdM_KeB3PyGh8nBkyVXMUg7JAD7Oje3piy6ZkI";

type RaceSession = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  seed: number;
  driver_count: number;
  team_count: number;
  total_laps: number;
  circuit_id?: string | null;
  circuit_revision?: number | null;
  circuit_name_snapshot?: string | null;
  engine_version: string;
  tick: number;
  total_ticks: number;
  speed_multiplier: number;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  checkpoint?: any;
  classification?: Array<{
    position: number | null;
    originalPosition?: number;
    status?: "classified" | "retired" | "disqualified" | "race_banned";
    penaltyTimeMs?: number;
    pendingGridPenaltyPositions?: number;
    appliedPenaltyIds?: string[];
    driverId: string;
    teamId: string;
    lapCompleted: number;
    elapsedMs: number;
    finished: boolean;
    retired?: boolean;
    pitStopCount?: number;
  }> | null;
  last_error?: string | null;
};

type RaceCircuitOption = {
  id: string;
  name: string;
  countryCode: string;
  kind: "fictional" | "real";
  revision: number;
  readyForTesting: boolean;
  officialReady: boolean;
  validationErrors: string[];
};
type RaceCommand = { id: string; command_type: string; result: Record<string, unknown>; created_at: string };
type RaceTimingProjection = {
  schemaVersion: number;
  raceId: string;
  tick: number;
  simulationTimeMs: number;
  timingRows: Array<{
    driverId: string; position: number | null; segmentId: string | null; segmentIndex: number | null;
    segmentDistanceCompletedMeters: number; trackPosition: { x: number; y: number };
  }>;
  circuitLayout: Array<{ id: string; x: number; y: number }>;
  segmentTelemetry: Array<{
    sequence: number; driverId: string; racePosition: number | null; lapNumber: number;
    trackPosition: { x: number; y: number };
    sectorNumber: number | null; segmentId: string; simulationTimeMs: number;
    segmentDurationMs: number; distanceMeters: number; averageSpeedKph: number; trackPositionMeters: number;
  }>;
};

type RaceEvent = {
  sequence: number;
  event_type: string;
  driver_id: string | null;
  lap_number: number;
  simulation_time_ms: number;
  payload: Record<string, unknown>;
};

type RaceControlFlag = "green" | "yellow" | "double_yellow" | "full_course_yellow" | "virtual_safety_car" | "safety_car" | "red_flag";
type RaceControlPenalty = {
  id: string;
  driverId: string;
  type: string;
  durationMs: number | null;
  gridPositions: number | null;
  reason: string;
  issuedAt: string;
  ratifiedByAdminId: string | null;
  reversedByEventId: string | null;
  gridPenaltyApplied?: boolean;
};
type RaceControlAuditEvent = {
  id: string;
  sequence: number;
  action: string;
  actorRole: string;
  occurredAt: string;
  flag?: RaceControlFlag;
  penaltyId?: string;
  penaltyType?: string;
  gridPenaltyApplied?: boolean;
  driverId?: string;
  reason: string;
};
type RaceControlState = {
  flag: RaceControlFlag;
  suspended: boolean;
  restartPending: boolean;
  penalties: RaceControlPenalty[];
  events: RaceControlAuditEvent[];
};

function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

function labelEvent(type: string): string {
  return type.replaceAll("_", " ").toUpperCase();
}

async function getTestingAccessToken(forceRefresh = false): Promise<string> {
  if (!supabase) throw new Error("Supabase Testing belum terkonfigurasi pada website.");

  const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!configuredUrl) throw new Error("VITE_SUPABASE_URL belum dikonfigurasi untuk database Testing.");
  const configuredProject = new URL(configuredUrl).hostname.split(".")[0];
  if (configuredProject !== "vxwvhyyvoipjwucbrvlu") {
    throw new Error("Website masih memakai project Supabase yang berbeda dari database Testing. Samakan VITE_SUPABASE_URL ke project caleris-masters-testing lalu login ulang.");
  }

  const { data: current, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Gagal membaca sesi login Testing. Silakan login ulang.");

  const expiresSoon = Boolean(current.session?.expires_at && current.session.expires_at <= Math.floor(Date.now() / 1000) + 45);
  if (forceRefresh || !current.session || expiresSoon) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token) {
      throw new Error("Sesi login Testing sudah kedaluwarsa. Logout lalu login kembali menggunakan akun Admin Testing.");
    }
    return refreshed.session.access_token;
  }

  return current.session.access_token;
}

async function raceApi(action: string, payload: Record<string, unknown> = {}) {
  let accessToken = await getTestingAccessToken();
  const send = (token: string) => fetch(TEST_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...createRaceEngineTestAuthHeaders(TEST_API_KEY, token)
    },
    body: JSON.stringify({ action, ...payload })
  });

  let response = await send(accessToken);
  if (response.status === 401) {
    const refreshedToken = await getTestingAccessToken(true);
    if (refreshedToken !== accessToken) {
      accessToken = refreshedToken;
      response = await send(accessToken);
    }
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Race Engine API gagal (${response.status}).`);
  return result;
}

export default function LiveRace() {
  const raceWorkspaceRef=useRef<HTMLDivElement|null>(null);
  const [fullScreen,setFullScreen]=useState(false);
  useEffect(()=>{const sync=()=>setFullScreen(Boolean(document.fullscreenElement&&raceWorkspaceRef.current?.contains(document.fullscreenElement)));document.addEventListener("fullscreenchange",sync);return()=>document.removeEventListener("fullscreenchange",sync)},[]);
  const toggleFullScreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();return}await raceWorkspaceRef.current?.requestFullscreen();try{await (screen.orientation as any).lock?.("landscape")}catch{}}catch{}};
  const [sessions, setSessions] = useState<RaceSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ session: RaceSession; projection: RaceTimingProjection | null; events: RaceEvent[]; commands: RaceCommand[] } | null>(null);
  const [driverCount, setDriverCount] = useState(20);
  const [teamCount, setTeamCount] = useState(10);
  const [totalLaps, setTotalLaps] = useState(5);
  const [availableCircuits, setAvailableCircuits] = useState<RaceCircuitOption[]>([]);
  const [selectedCircuitId, setSelectedCircuitId] = useState("");
  const [circuitLoading, setCircuitLoading] = useState(true);
  const [seed, setSeed] = useState("20261120");
  const [aeroSetting, setAeroSetting] = useState(50);
  const [suspensionSetting, setSuspensionSetting] = useState(50);
  const [brakeBalanceFrontPercent, setBrakeBalanceFrontPercent] = useState(50);
  const [frontTyrePressurePsi, setFrontTyrePressurePsi] = useState(25);
  const [rearTyrePressurePsi, setRearTyrePressurePsi] = useState(25);
  const [hqDivision, setHqDivision] = useState<"premio" | "zwei">("premio");
  const [hqEngineeringLevel, setHqEngineeringLevel] = useState(0);
  const [hqRdLevel, setHqRdLevel] = useState(0);
  const [hqSimulatorLevel, setHqSimulatorLevel] = useState(0);
  const [hqPitCrewLevel, setHqPitCrewLevel] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [replayEvents, setReplayEvents] = useState<RaceEvent[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [controlState, setControlState] = useState<RaceControlState | null>(null);
  const [resolvedClassification, setResolvedClassification] = useState<any[]>([]);
  const [startingGrid, setStartingGrid] = useState<Array<{ driverId: string; gridPosition: number }>>([]);
  const [controlFlag, setControlFlag] = useState<Exclude<RaceControlFlag, "green">>("yellow");
  const [controlDurationMs, setControlDurationMs] = useState("30000");
  const [controlReason, setControlReason] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [evidenceLap, setEvidenceLap] = useState("1");
  const [penaltyDriverId, setPenaltyDriverId] = useState("");
  const [penaltyType, setPenaltyType] = useState("time_5s");
  const [penaltyDurationMs, setPenaltyDurationMs] = useState("5000");
  const [gridPenaltyPositions, setGridPenaltyPositions] = useState("1");
  const [restartMode, setRestartMode] = useState<"standing" | "rolling">("standing");

  const refreshSessions = useCallback(async (preferId?: string) => {
    try {
      const result = await raceApi("list");
      const next = (result.sessions ?? []) as RaceSession[];
      setSessions(next);
      const nextId = preferId || selectedId || next[0]?.id || "";
      if (nextId && next.some((item) => item.id === nextId)) setSelectedId(nextId);
      else if (!next.length) {
        setSelectedId("");
        setDetail(null);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat sesi Race Engine.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const result = await raceApi("detail", { sessionId: id });
      setDetail({ session: result.session as RaceSession, projection: (result.projection ?? null) as RaceTimingProjection | null, events: (result.events ?? []) as RaceEvent[], commands: (result.commands ?? []) as RaceCommand[] });
      const control = await raceApi("control_state", { sessionId: id });
      setControlState(control.controlState as RaceControlState);
      setResolvedClassification(Array.isArray(control.resolvedClassification) ? control.resolvedClassification : []);
      setStartingGrid(Array.isArray(control.startingGrid) ? control.startingGrid : []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat detail sesi.");
    }
  }, []);

  useEffect(() => { void refreshSessions(); }, [refreshSessions]);
  useEffect(() => {
    let active = true;
    void raceApi("circuits").then((result) => {
      if (!active) return;
      const circuits = (result.circuits ?? []) as RaceCircuitOption[];
      setAvailableCircuits(circuits.filter((circuit) => circuit.readyForTesting));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Daftar Circuit Maker gagal dimuat.");
    }).finally(() => {
      if (active) setCircuitLoading(false);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshSessions(selectedId || undefined);
      if (selectedId) void loadDetail(selectedId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, refreshSessions, loadDetail]);

  const loadReplay = useCallback(async (id: string) => {
    if (!id) return;
    setReplayLoading(true);
    setReplayPlaying(false);
    setReplayIndex(0);
    try {
      const allEvents: RaceEvent[] = [];
      const pageSize = 500;
      let offset = 0;
      while (true) {
        const page = await raceApi("replay", { sessionId: id, offset, limit: pageSize });
        const batch = (page.events ?? []) as RaceEvent[];
        allEvents.push(...batch);
        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      setReplayEvents(allEvents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat replay.");
      setReplayEvents([]);
    } finally {
      setReplayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadReplay(selectedId);
    else setReplayEvents([]);
  }, [selectedId, loadReplay]);

  useEffect(() => {
    if (!replayPlaying || replayEvents.length === 0) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= replayEvents.length - 1) {
          setReplayPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(125, 1000 / replaySpeed));
    return () => window.clearInterval(timer);
  }, [replayPlaying, replayEvents.length, replaySpeed]);

  const active = detail?.session?.id === selectedId ? detail.session : sessions.find((item) => item.id === selectedId) ?? null;
  const progress = active ? Math.min(100, Math.round((active.tick / Math.max(1, active.total_ticks)) * 100)) : 0;
  const checkpoint = detail?.session?.id === selectedId ? detail.session.checkpoint : null;
  const entrants = Array.isArray(checkpoint?.entrants) ? checkpoint.entrants : [];
  const tyreStates = entrants.filter((entry: any) => entry.tyreState);
  const weather = checkpoint?.weatherState;
  const classification = resolvedClassification.length ? resolvedClassification : active?.classification ?? [];
  const recentEvents = useMemo(() => [...(detail?.events ?? [])].reverse().slice(-35).reverse(), [detail?.events]);
  const recentCommands = useMemo(() => [...(detail?.commands ?? [])].slice(0, 12), [detail?.commands]);
  const replayEvent = replayEvents[replayIndex] ?? null;
  const replayProjection = useMemo(() => {
    if (!checkpoint?.snapshot || replayEvents.length === 0) return null;
    try {
      return buildRaceReplayProjection(checkpoint.snapshot, replayEvents, replayIndex);
    } catch {
      return null;
    }
  }, [checkpoint?.snapshot, replayEvents, replayIndex]);

  async function createSession() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const result = await raceApi("create", {
        driverCount, teamCount, totalLaps, seed: Number(seed),
        circuitId: selectedCircuitId || null,
        carSetup: { aeroSetting, suspensionSetting, brakeBalanceFrontPercent, frontTyrePressurePsi, rearTyrePressurePsi },
        division: hqDivision,
        hqFacilityLevels: { engineering_department: hqEngineeringLevel, rd_center: hqRdLevel, simulator_facility: hqSimulatorLevel, pit_crew_training_center: hqPitCrewLevel }
      });
      await refreshSessions(result.session.id);
      await loadDetail(result.session.id);
      setNotice("Sesi simulasi berhasil dibuat di database testing. Belum ada data produksi yang disentuh.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membuat sesi.");
    } finally {
      setBusy("");
    }
  }

  async function advanceSession() {
    if (!selectedId) return null;
    const result = await raceApi("advance", { sessionId: selectedId });
    await loadDetail(selectedId);
    await refreshSessions(selectedId);
    return result;
  }

  async function advanceOnce() {
    setBusy("advance");
    setError("");
    setNotice("");
    try {
      const result = await advanceSession();
      setNotice(`Worker memproses ${result?.result?.events_added ?? 0} event baru. Tick ${result?.tick}/${result?.totalTicks}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Worker gagal memproses sesi.");
    } finally {
      setBusy("");
    }
  }

  async function runToCompletion() {
    if (!active || active.status === "completed") return;
    setBusy("run");
    setError("");
    setNotice("");
    try {
      let latest: any = null;
      let attempts = 0;
      while (attempts < 100) {
        latest = await raceApi("advance", { sessionId: selectedId });
        attempts += 1;
        setNotice(`Worker berjalan: tick ${latest.tick}/${latest.totalTicks}.`);
        await loadDetail(selectedId);
        if (latest.status === "completed") break;
      }
      await refreshSessions(selectedId);
      await loadDetail(selectedId);
      if (latest?.status === "completed") setNotice("Simulasi selesai. Klasifikasi final dan event sudah tersimpan di Supabase testing.");
      else setNotice("Batas batch tercapai. Sesi tetap tersimpan dan bisa dilanjutkan dari checkpoint.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Worker gagal menyelesaikan simulasi.");
    } finally {
      setBusy("");
    }
  }

  async function setSpeed(speedMultiplier: number) {
    if (!selectedId || ![1, 5, 10, 15].includes(speedMultiplier)) return;
    setBusy("speed");
    setError("");
    setNotice("");
    try {
      await raceApi("set_speed", { sessionId: selectedId, speedMultiplier });
      await loadDetail(selectedId);
      await refreshSessions(selectedId);
      setNotice(`Kecepatan simulasi diubah ke ${speedMultiplier}x dan tercatat di audit command.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengubah kecepatan.");
    } finally {
      setBusy("");
    }
  }

  async function submitControlAction(action: string, payload: Record<string, unknown> = {}) {
    if (!selectedId) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const evidence = [{
        id: crypto.randomUUID(),
        source: "replay",
        capturedAt: new Date().toISOString(),
        lapNumber: Number(evidenceLap),
        ...(typeof payload.driverId === "string" ? { driverId: payload.driverId } : {}),
        description: evidenceDescription.trim(),
        artifactRef: evidenceRef.trim()
      }];
      const result = await raceApi(action, {
        sessionId: selectedId,
        reason: controlReason.trim(),
        evidence,
        ...payload
      });
      setControlState(result.controlState as RaceControlState);
      if (Array.isArray(result.startingGrid)) setStartingGrid(result.startingGrid);
      setControlReason("");
      setEvidenceDescription("");
      setEvidenceRef("");
      setNotice("Race-control decision tersimpan sebagai audit event.");
      await loadDetail(selectedId);
      await refreshSessions(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Race-control action gagal.");
    } finally {
      setBusy("");
    }
  }

  function controlEvidenceReady() {
    return Boolean(controlReason.trim() && evidenceDescription.trim() && evidenceRef.trim() && Number.isInteger(Number(evidenceLap)) && Number(evidenceLap) >= 0);
  }

  async function verifyRecovery() {
    if (!selectedId) return;
    setBusy("recover");
    setError("");
    setNotice("");
    try {
      const result = await raceApi("recover", { sessionId: selectedId });
      setNotice(`Checkpoint valid. Restore engine v${active?.engine_version}: tick ${result.tick}, ${result.eventCount} event, status ${result.status}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery checkpoint gagal.");
    } finally {
      setBusy("");
    }
  }

  return <div ref={raceWorkspaceRef} className={"workspace live-race-workspace"+(fullScreen?" is-fullscreen":"")}>
    <header className="page-heading live-race-heading">
      <div>
        <span className="eyebrow">CALERIS RACE CONTROL · PHASE 4</span>
        <h1 className="page-title">RACE ENGINE LAB</h1>
        <p className="page-description">Jalankan simulasi deterministik, simpan checkpoint, dan uji pemulihan sesi dari web.</p>
      </div>
      <div className="live-race-heading-actions"><span className="live-race-admin-tag"><ShieldCheck size={14}/> ADMIN ONLY</span><button type="button" className="live-race-fullscreen-button" onClick={toggleFullScreen}><Maximize2 size={14}/>{fullScreen?"Exit fullscreen":"Landscape fullscreen"}</button></div>
    </header>

    <div className="live-race-preview-notice">
      <AlertTriangle size={17}/>
      <div>
        <strong>TEST ENVIRONMENT · SYNTHETIC DATA ONLY</strong>
        <p>Seluruh sesi, checkpoint, dan event disimpan di Supabase caleris-masters-testing. Profil cuaca, ban, strategi, performa, dan insiden di halaman ini hanya koefisien sintetis untuk pengujian, bukan kalibrasi produksi. Tidak ada saldo, hadiah, atau settlement ekonomi yang dijalankan.</p>
      </div>
    </div>

    <section className="race-engine-capability-grid">
      <article><Activity/><strong>24 ATTRIBUTES</strong><small>Driver + Car/Team snapshot</small></article>
      <article><Waves/><strong>WEATHER + TYRES</strong><small>Track wetness and tyre degradation</small></article>
      <article><Flag/><strong>RACE CONTROL</strong><small>Incidents, flags and time loss</small></article>
      <article><Timer/><strong>CHECKPOINT v6</strong><small>Persistent state and recovery</small></article>
    </section>

    <section className="race-engine-create-panel">
      <div className="live-race-section-heading">
        <div><span className="eyebrow">NEW TEST SESSION</span><h2>Simulation Setup</h2></div>
        <span className="live-race-demo-label">TEST ONLY</span>
      </div>
      <div className="race-engine-form-grid race-engine-quick-grid">
        <label>Circuit
          <select value={selectedCircuitId} onChange={(event) => setSelectedCircuitId(event.target.value)} disabled={circuitLoading}>
            <option value="">{circuitLoading ? "Loading circuits..." : "Synthetic default circuit"}</option>
            {availableCircuits.map((circuit) => <option key={circuit.id} value={circuit.id}>{circuit.name} · rev {circuit.revision} · {circuit.kind}</option>)}
          </select>
          <small>{selectedCircuitId ? "Geometry snapshot akan dikunci untuk sesi ini." : "Gunakan circuit synthetic bawaan Race Engine."}</small>
        </label>
        <label>Drivers
          <select value={driverCount} onChange={(event) => {
            const value = Number(event.target.value);
            setDriverCount(value);
            if (teamCount > value) setTeamCount(value);
          }}>
            {[2,4,6,10,12,16,20,25].map((value) => <option key={value} value={value}>{value} drivers</option>)}
          </select>
        </label>
        <label>Teams
          <select value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>
            {Array.from({ length: Math.min(10, driverCount) }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} teams</option>)}
          </select>
        </label>
        <label>Race distance
          <select value={totalLaps} onChange={(event) => setTotalLaps(Number(event.target.value))}>
            {[1,2,3,5,8,10].map((value) => <option key={value} value={value}>{value} laps</option>)}
          </select>
        </label>
        <label>Deterministic seed
          <input inputMode="numeric" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
      </div>
      <details className="race-engine-advanced-settings">
        <summary>Advanced setup <span>Car setup &amp; HQ effects · optional</span></summary>
        <div className="race-engine-form-grid">
          <label>Aero setting <small>Test scale · 0–100</small>
            <input type="number" min={0} max={100} value={aeroSetting} onChange={(event) => setAeroSetting(Number(event.target.value))} />
          </label>
          <label>Suspension setting <small>Test scale · 0–100</small>
            <input type="number" min={0} max={100} value={suspensionSetting} onChange={(event) => setSuspensionSetting(Number(event.target.value))} />
          </label>
          <label>Front brake balance <small>40–60%</small>
            <input type="number" min={40} max={60} step={0.5} value={brakeBalanceFrontPercent} onChange={(event) => setBrakeBalanceFrontPercent(Number(event.target.value))} />
          </label>
          <label>Front tyre pressure <small>15–35 PSI · test profile</small>
            <input type="number" min={15} max={35} step={0.1} value={frontTyrePressurePsi} onChange={(event) => setFrontTyrePressurePsi(Number(event.target.value))} />
          </label>
          <label>Rear tyre pressure <small>15–35 PSI · test profile</small>
            <input type="number" min={15} max={35} step={0.1} value={rearTyrePressurePsi} onChange={(event) => setRearTyrePressurePsi(Number(event.target.value))} />
          </label>
          <label>HQ division
            <select value={hqDivision} onChange={(event) => { const next = event.target.value as "premio" | "zwei"; setHqDivision(next); if (next === "zwei") { setHqEngineeringLevel((value) => Math.min(6, value)); setHqRdLevel((value) => Math.min(6, value)); setHqSimulatorLevel((value) => Math.min(6, value)); setHqPitCrewLevel((value) => Math.min(6, value)); } }}>
              <option value="premio">Premio · max level 8</option>
              <option value="zwei">Zwei · max level 6</option>
            </select>
          </label>
          <label>Engineering Department <small>HQ effect · level 0–{hqDivision === "premio" ? 8 : 6}</small>
            <input type="number" min={0} max={hqDivision === "premio" ? 8 : 6} value={hqEngineeringLevel} onChange={(event) => setHqEngineeringLevel(Number(event.target.value))} />
          </label>
          <label>R&amp;D Center <small>HQ effect · level 0–{hqDivision === "premio" ? 8 : 6}</small>
            <input type="number" min={0} max={hqDivision === "premio" ? 8 : 6} value={hqRdLevel} onChange={(event) => setHqRdLevel(Number(event.target.value))} />
          </label>
          <label>Simulator Facility <small>HQ effect · level 0–{hqDivision === "premio" ? 8 : 6}</small>
            <input type="number" min={0} max={hqDivision === "premio" ? 8 : 6} value={hqSimulatorLevel} onChange={(event) => setHqSimulatorLevel(Number(event.target.value))} />
          </label>
        </div>
      </details>
      <div className="race-engine-form-footer">
        <span>Quick Test: circuit, drivers, teams, distance, dan seed. Setup mobil/HQ ada di Advanced Setup.</span>
        <button className="race-engine-primary-button" onClick={createSession} disabled={Boolean(busy) || !/^\d+$/.test(seed) || !Number.isSafeInteger(Number(seed)) || Number(seed) > 0xffffffff}>
          {busy === "create" ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} Create test race
        </button>
      </div>
    </section>

    {error && <div className="race-engine-feedback error"><AlertTriangle size={15}/>{error}</div>}
    {notice && <div className="race-engine-feedback success"><CheckCircle2 size={15}/>{notice}</div>}

    <section className="live-race-session-section">
      <div className="live-race-section-heading">
        <div><span className="eyebrow">PERSISTED SESSIONS</span><h2>Race Sessions</h2></div>
        <button className="race-engine-icon-button" onClick={() => void refreshSessions(selectedId)} disabled={Boolean(busy)} aria-label="Refresh sessions"><RefreshCw size={15}/></button>
      </div>
      {loading ? <div className="race-engine-empty"><LoaderCircle className="spin"/> Loading sessions...</div> :
        sessions.length === 0 ? <div className="race-engine-empty">Belum ada sesi uji. Buat simulasi pertama di atas.</div> :
        <div className="race-engine-session-list">
          {sessions.map((session) => <button key={session.id} className={"race-engine-session-card" + (selectedId === session.id ? " selected" : "")} onClick={() => setSelectedId(session.id)}>
            <span className="race-engine-session-icon"><Flag size={16}/></span>
            <span className="race-engine-session-copy">
              <strong>{session.driver_count} DRIVERS · {session.team_count} TEAMS</strong>
              <small>{session.total_laps} laps · seed {session.seed} · {formatDate(session.created_at)}</small>
            </span>
            <span className={"race-engine-status status-" + session.status}>{session.status.toUpperCase()}</span>
            <span className="race-engine-session-progress">{session.tick}/{session.total_ticks} · {session.speed_multiplier ?? 1}x</span>
            <ChevronRight size={15}/>
          </button>)}
        </div>
      }
    </section>

    {active && <section className="live-race-main-panel race-engine-session-panel">
      <div className="live-race-main-head">
        <div>
          <span className="eyebrow">SESSION {active.id.slice(0, 8).toUpperCase()} · ENGINE {active.engine_version}</span>
          <h2>Synthetic Grand Prix Circuit</h2>
          <small>{active.driver_count} DRIVERS · {active.team_count} TEAMS · SEED {active.seed}</small>
        </div>
        <span className={"race-engine-status status-" + active.status}>{active.status.toUpperCase()}</span>
      </div>
      <div className="race-engine-progress-wrap">
        <div className="race-engine-progress-label"><span>SIMULATION PROGRESS</span><strong>{progress}% · TICK {active.tick}/{active.total_ticks}</strong></div>
        <div className="race-engine-progress-track"><span style={{ width: progress + "%" }}/></div>
      </div>
      <div className="race-engine-actions">
        <button className="race-engine-primary-button" onClick={advanceOnce} disabled={Boolean(busy) || active.status === "completed"}>
          {busy === "advance" ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} Advance {active.speed_multiplier ?? 1} segment{(active.speed_multiplier ?? 1) > 1 ? "s" : ""}
        </button>
        <button className="race-engine-secondary-button" onClick={runToCompletion} disabled={Boolean(busy) || active.status === "completed"}>
          {busy === "run" ? <LoaderCircle className="spin" size={15}/> : <Gauge size={15}/>} Run to completion
        </button>
        <button className="race-engine-secondary-button" onClick={verifyRecovery} disabled={Boolean(busy)}>
          {busy === "recover" ? <LoaderCircle className="spin" size={15}/> : <RotateCcw size={15}/>} Verify recovery
        </button>
      </div>

      <div className="race-engine-speed-control">
        <span>LIVE SPEED · CLOCK PROGRESSION ONLY</span>
        <div>{[1,5,10,15].map((speed) => <button key={speed} className={(active.speed_multiplier ?? 1) === speed ? "active" : ""} onClick={() => void setSpeed(speed)} disabled={Boolean(busy) || active.status === "completed"}>{speed}x</button>)}</div>
      </div>

      <div className="race-engine-live-metrics">
        <article><span><Clock3 size={13}/> SIMULATION CLOCK</span><strong>{formatTime(checkpoint?.simulationClockMs ?? 0)}</strong></article>
        <article><span><Waves size={13}/> TRACK WETNESS</span><strong>{weather ? `${(weather.trackWetness * 100).toFixed(1)}%` : "—"}</strong></article>
        <article><span><Gauge size={13}/> TRACK GRIP</span><strong>{weather ? `${weather.gripPercent.toFixed(1)}%` : "—"}</strong></article>
        <article><span><Wrench size={13}/> TYRE SETS</span><strong>{tyreStates.length}/{active.driver_count}</strong></article>
      </div>

      <div className="race-engine-results-grid">
        <section className="race-engine-result-section">
          <div className="live-race-subheading"><h3><Trophy size={15}/> Classification</h3><span>{classification.length ? "FINAL RESULT" : "LIVE ORDER"}</span></div>
          <div className="live-race-table-wrap">
            <table className="live-race-timing-table">
              <thead><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>LAP</th><th>SEGMENT</th><th>TIME</th><th>PITS</th><th>STATUS</th></tr></thead>
              <tbody>
                {(classification.length ? classification : (checkpoint?.entrants ?? []).map((entry: any, index: number) => ({
                  position: index + 1, driverId: entry.driverId, teamId: entry.teamId,
                  lapCompleted: entry.lapCompleted, elapsedMs: entry.elapsedMs,
                  finished: entry.finished, retired: entry.retired, pitStopCount: entry.pitStopCount
                }))).map((entry: any) => <tr key={entry.driverId}>
                  <td><strong className="driver-position">{entry.position === null ? "DSQ" : String(entry.position).padStart(2,"0")}</strong></td>
                  <td>{entry.driverId}</td><td>{entry.teamId}</td><td>{entry.lapCompleted}</td>
                  <td>{detail?.projection?.timingRows.find((row) => row.driverId === entry.driverId)?.segmentId ?? (entry.finished || entry.retired ? "—" : "—")}</td>
                  <td className="lap-time">{formatTime(entry.elapsedMs)}</td><td>{entry.pitStopCount ?? 0}</td>
                  <td><span className={"race-engine-status status-" + (entry.status === "disqualified" || entry.status === "race_banned" || entry.retired ? "failed" : entry.finished ? "completed" : "running")}>{entry.status === "disqualified" ? "DSQ" : entry.status === "race_banned" ? "RACE BAN" : entry.retired ? "RETIRED" : entry.finished ? "FINISHED" : "RUNNING"}{entry.penaltyTimeMs > 0 ? ` +${formatTime(entry.penaltyTimeMs)}` : ""}{entry.pendingGridPenaltyPositions > 0 ? ` · GRID +${entry.pendingGridPenaltyPositions}` : ""}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="race-engine-result-section">
          <div className="live-race-subheading"><h3><Wrench size={15}/> Tyre condition</h3><span>PER DRIVER</span></div>
          <div className="race-engine-tyre-list">
            {tyreStates.map((entry: any) => <div key={entry.driverId}>
              <strong>{entry.driverId}</strong><span className={"live-race-tyre tyre-" + (entry.tyreState.compound === "full_wet" ? "w" : entry.tyreState.compound === "intermediate" ? "i" : entry.tyreState.compound[0])}>{entry.tyreState.compound.toUpperCase()}</span>
              <span>{entry.tyreState.wearPercent.toFixed(1)}% wear</span><span>{entry.pitStopCount ?? 0} pit</span>
            </div>)}
            {!tyreStates.length && <p className="race-engine-empty">Tyre state akan muncul setelah checkpoint dimuat.</p>}
          </div>
        </section>

          <section className="race-engine-result-section">
            <div className="live-race-subheading"><h3><MapPin size={15}/> Circuit position map</h3><span>APPROX. SEGMENT POSITION</span></div>
            {detail?.projection?.circuitLayout?.length ? <svg viewBox="0 0 1000 1000" role="img" aria-label="Approximate driver positions on the circuit layout" style={{ width: "100%", maxHeight: 340 }}>
              <polyline points={detail.projection.circuitLayout.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" opacity="0.45"/>
              {detail.projection.timingRows.map((row, _index, rows) => {
                const peers=rows.filter((item)=>Math.hypot(item.trackPosition.x-row.trackPosition.x,item.trackPosition.y-row.trackPosition.y)<0.012);
                const slot=peers.findIndex((item)=>item.driverId===row.driverId);
                const angle=(Math.PI*2*slot)/Math.max(1,peers.length);
                const radius=peers.length>1?Math.min(34,12+peers.length*1.25):0;
                const x=row.trackPosition.x*1000+Math.cos(angle)*radius;
                const y=row.trackPosition.y*1000+Math.sin(angle)*radius;
                return <g key={row.driverId} style={{transition:"transform 1.5s linear"}}>
                  {peers.length>1&&<line x1={row.trackPosition.x*1000} y1={row.trackPosition.y*1000} x2={x} y2={y} stroke="currentColor" strokeOpacity=".45" strokeWidth="2"/>}
                  <circle cx={x} cy={y} r="19" fill="currentColor" stroke="var(--background, #fff)" strokeWidth="5" style={{transition:"cx 1.5s linear, cy 1.5s linear"}}><title>{row.position ? "P"+row.position+" · ":""}{row.driverId}</title></circle>
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="20" fontWeight="700">{row.position ?? "X"}</text>
                </g>;
              })}
            </svg> : <p className="race-engine-empty">Circuit map tersedia setelah geometry dimuat ke race snapshot.</p>}
          </section>

        <section className="race-engine-result-section">
          <div className="live-race-subheading"><h3><Activity size={15}/> Segment telemetry</h3><span>DERIVED FROM SIMULATION</span></div>
          <div className="live-race-table-wrap">
            <table className="live-race-timing-table">
              <thead><tr><th>DRIVER</th><th>LAP</th><th>SEGMENT</th><th>AVG SPEED</th><th>SIM TIME</th></tr></thead>
              <tbody>
                {(detail?.projection?.segmentTelemetry ?? []).slice(-10).reverse().map((point) => <tr key={point.sequence}>
                  <td>{point.driverId}</td><td>{point.lapNumber}</td><td>{point.segmentId}</td>
                  <td className="lap-time">{point.averageSpeedKph.toFixed(1)} km/h</td>
                  <td className="lap-time">{formatTime(point.simulationTimeMs)}</td>
                </tr>)}
              </tbody>
            </table>
            {!detail?.projection?.segmentTelemetry?.length && <p className="race-engine-empty">Telemetry segmen akan muncul setelah simulation tick tersimpan.</p>}
          </div>
        </section>
      </div>

      <section className="race-engine-control-lab workspace-card">
        <div className="live-race-subheading">
          <h3><ShieldCheck size={15}/> FIA / Admin Race Control Lab</h3>
          <span className={controlState?.suspended ? "race-control-state suspended" : "race-control-state"}>{controlState?.suspended ? "RED FLAG · SUSPENDED" : (controlState?.flag ?? "green").replaceAll("_", " ").toUpperCase()}</span>
        </div>
        <p className="page-description">Kontrol ini tersimpan di audit Testing. Red flag menghentikan worker sampai restart disahkan. Flag lain memakai durasi simulasi.</p>
        <div className="race-control-form-grid">
          <label>Race control flag
            <select value={controlFlag} onChange={(event) => setControlFlag(event.target.value as Exclude<RaceControlFlag, "green">)}>
              <option value="yellow">Yellow</option>
              <option value="double_yellow">Double Yellow</option>
              <option value="full_course_yellow">Full Course Yellow</option>
              <option value="virtual_safety_car">Virtual Safety Car</option>
              <option value="safety_car">Safety Car</option>
              <option value="red_flag">Red Flag</option>
            </select>
          </label>
          {controlFlag !== "red_flag" && <label>Duration (ms)
            <input type="number" min="1" step="1000" value={controlDurationMs} onChange={(event) => setControlDurationMs(event.target.value)}/>
          </label>}
          <label>Reason
            <input value={controlReason} onChange={(event) => setControlReason(event.target.value)} placeholder="Alasan keputusan race control"/>
          </label>
          <label>Evidence lap
            <input type="number" min="0" value={evidenceLap} onChange={(event) => setEvidenceLap(event.target.value)}/>
          </label>
          <label>Evidence description
            <input value={evidenceDescription} onChange={(event) => setEvidenceDescription(event.target.value)} placeholder="Ringkasan bukti replay / marshal"/>
          </label>
          <label>Evidence reference
            <input value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="Replay event ID / artifact reference"/>
          </label>
        </div>
        <div className="race-engine-actions">
          <button className="race-engine-primary-button" disabled={Boolean(busy) || !controlEvidenceReady() || controlState?.suspended} onClick={() => void submitControlAction("control_flag", { flag: controlFlag, ...(controlFlag !== "red_flag" ? { durationMs: Number(controlDurationMs) } : {}) })}>
            {busy === "control_flag" ? <LoaderCircle className="spin" size={15}/> : <Flag size={15}/>} Deploy flag
          </button>
          <button className="race-engine-secondary-button" disabled={Boolean(busy) || !controlEvidenceReady() || !controlState || controlState.flag === "green" || controlState.suspended} onClick={() => void submitControlAction("control_flag", { flag: "green" })}>
            Clear flag
          </button>
          {controlState?.suspended && <>
            <select value={restartMode} onChange={(event) => setRestartMode(event.target.value as "standing" | "rolling")}>
              <option value="standing">Standing restart</option>
              <option value="rolling">Rolling restart</option>
            </select>
            <button className="race-engine-primary-button" disabled={Boolean(busy) || !controlEvidenceReady()} onClick={() => void submitControlAction("control_restart", { mode: restartMode })}>
              Authorize restart
            </button>
          </>}
        </div>

        <div className="race-control-penalty-block">
          <div className="live-race-subheading"><h4>Penalty decision</h4><span>EVIDENCE REQUIRED</span></div>
          <div className="race-control-form-grid">
            <label>Driver
              <select value={penaltyDriverId} onChange={(event) => setPenaltyDriverId(event.target.value)}>
                <option value="">Select driver</option>
                {(checkpoint?.snapshot?.entrants ?? entrants).map((entrant: any) => <option key={entrant.driverId} value={entrant.driverId}>{entrant.driverNameSnapshot ?? entrant.driverId}</option>)}
              </select>
            </label>
            <label>Penalty type
              <select value={penaltyType} onChange={(event) => {setPenaltyType(event.target.value);setPenaltyDurationMs(event.target.value==="time_10s"?"10000":event.target.value==="time_5s"?"5000":"30000");}}>
                <option value="warning">Warning</option>
                <option value="time_5s">5 seconds</option>
                <option value="time_10s">10 seconds</option>
                <option value="drive_through">Drive-through</option>
                <option value="stop_go">Stop-go</option>
                <option value="grid_penalty">Grid penalty</option>
                <option value="time_penalty">Time penalty</option>
                <option value="disqualification">Disqualification</option>
                <option value="race_ban">Race ban</option>
              </select>
            </label>
            {["time_5s","time_10s","drive_through","stop_go","time_penalty"].includes(penaltyType) && <label>Duration (ms)
              <input type="number" min="1" value={penaltyDurationMs} disabled={penaltyType==="time_5s"||penaltyType==="time_10s"} onChange={(event) => setPenaltyDurationMs(event.target.value)}/>
            </label>}
            {penaltyType==="grid_penalty" && <label>Grid positions
              <input type="number" min="1" max="20" value={gridPenaltyPositions} onChange={(event) => setGridPenaltyPositions(event.target.value)}/>
            </label>}
          </div>
          <button className="race-engine-primary-button" disabled={Boolean(busy) || !penaltyDriverId || !controlEvidenceReady()} onClick={() => void submitControlAction("control_penalty", {
            driverId: penaltyDriverId,
            penaltyType,
            ...(["time_5s","time_10s","drive_through","stop_go","time_penalty"].includes(penaltyType) ? { durationMs: Number(penaltyDurationMs) } : {}),
            ...(penaltyType==="grid_penalty" ? { gridPositions: Number(gridPenaltyPositions) } : {})
          })}>
            {busy === "control_penalty" ? <LoaderCircle className="spin" size={15}/> : <ShieldCheck size={15}/>} Issue penalty
          </button>
        </div>

        {startingGrid.length > 0 && <div className="race-control-starting-grid">
          <strong>STARTING GRID</strong>
          <div>{startingGrid.map((entry) => <span key={entry.driverId}><b>P{entry.gridPosition}</b> {entry.driverId}</span>)}</div>
        </div>}
        <div className="race-control-penalty-list">
          {(controlState?.penalties ?? []).map((penalty) => <article key={penalty.id}>
            <div><strong>{penalty.type.replaceAll("_"," ").toUpperCase()} · {penalty.driverId}</strong><small>{penalty.reason} · {penalty.ratifiedByAdminId ? "RATIFIED" : "PENDING ADMIN RATIFICATION"}{penalty.gridPenaltyApplied ? " · GRID APPLIED" : ""}{penalty.reversedByEventId ? " · REVERSED" : ""}</small></div>
            {!penalty.ratifiedByAdminId && !penalty.reversedByEventId && <button className="race-engine-secondary-button" disabled={Boolean(busy) || !controlEvidenceReady()} onClick={() => void submitControlAction("control_ratify_penalty", { penaltyId: penalty.id })}>Ratify</button>}
            {penalty.ratifiedByAdminId && !penalty.reversedByEventId && <button className="race-engine-secondary-button" disabled={Boolean(busy) || !controlEvidenceReady()} onClick={() => void submitControlAction("control_reverse_penalty", { penaltyId: penalty.id, supersedesEventId: controlState?.events.find((event) => event.action==="penalty_issued" && event.penaltyId===penalty.id)?.id ?? "" })}>Reverse</button>}
          </article>)}
          {!controlState?.penalties.length && <p className="race-engine-empty">Belum ada keputusan penalti.</p>}
        </div>
        <div className="race-control-audit-list">
          {(controlState?.events ?? []).slice(-8).reverse().map((event) => <article key={event.id}><strong>{event.action.replaceAll("_"," ").toUpperCase()}</strong><small>{event.reason} · {event.actorRole.toUpperCase()} · {formatDate(event.occurredAt)}</small></article>)}
          {!controlState?.events.length && <p className="race-engine-empty">Belum ada race-control audit event.</p>}
        </div>
      </section>

      <section className="race-engine-event-section">
        <div className="live-race-subheading"><h3><Flag size={15}/> Race Event Log</h3><span>{detail?.events.length ?? 0} PERSISTED EVENTS</span></div>
        <div className="race-engine-event-list">
          {recentEvents.map((event) => <article key={event.sequence}>
            <span className="event-lap">LAP {event.lap_number}</span>
            <span className={"event-marker " + (event.event_type === "incident" ? "gold" : event.event_type === "race_control" ? "blue" : "green")}/>
            <div><strong>{labelEvent(event.event_type)}</strong><small>{event.driver_id ?? "Race control"} · {String(event.payload.segmentId ?? "—")}{event.payload.raceControlFlag ? ` · ${String(event.payload.raceControlFlag).toUpperCase()}` : ""}</small></div>
            <time>{formatTime(event.simulation_time_ms)}</time>
          </article>)}
          {!recentEvents.length && <p className="race-engine-empty">Belum ada event. Jalankan beberapa segmen untuk menghasilkan data.</p>}
        </div>
      </section>

      <section className="race-engine-replay-section">
        <div className="live-race-subheading">
          <h3><Play size={15}/> Race Replay</h3>
          <span>{replayEvents.length} PERSISTED EVENTS</span>
        </div>
        <div className="race-engine-replay-panel">
          <div className="race-engine-replay-current">
            <span className="eyebrow">EVENT {replayEvents.length ? replayIndex + 1 : 0} / {replayEvents.length}</span>
            <strong>{replayEvent ? labelEvent(replayEvent.event_type) : replayLoading ? "LOADING REPLAY..." : "NO REPLAY EVENTS"}</strong>
            <small>{replayEvent ? `LAP ${replayEvent.lap_number} · ${replayEvent.driver_id ?? "Race control"} · ${formatTime(replayEvent.simulation_time_ms)}` : "Replay menggunakan event timeline yang sudah tersimpan di Supabase."}</small>
            {replayEvent && <p>{String(replayEvent.payload.segmentId ?? "Race event")}{replayEvent.payload.raceControlFlag ? ` · ${String(replayEvent.payload.raceControlFlag).toUpperCase()}` : ""}</p>}
          </div>
          <div className="race-engine-replay-map">
            <div className="race-engine-replay-map-head">
              <strong>TRACK POSITION REPLAY</strong>
              <span>SEGMENT-LEVEL · SEQUENCE {replayProjection?.sequence ?? "—"}</span>
            </div>
            {replayProjection && replayProjection.points.length > 0 ? <>
              <div className="race-engine-replay-map-canvas">
                <svg viewBox="0 0 1000 1000" role="img" aria-label="Replay circuit map with driver positions">
                  <polyline
                    points={replayProjection.layout.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}
                    fill="none"
                    stroke="rgba(215,184,93,.72)"
                    strokeWidth="22"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {replayProjection.points.map((point) => <g key={point.driverId} transform={`translate(${point.x * 1000} ${point.y * 1000})`}>
                    <circle r="27" fill="#171a20" stroke="#e2c56d" strokeWidth="7"/>
                    <text textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="24" fontWeight="800">{point.position}</text>
                    <title>{point.driverName} · {point.teamName} · Lap {point.lapNumber} · {point.segmentId}</title>
                  </g>)}
                </svg>
              </div>
              <ol className="race-engine-replay-order">
                {replayProjection.points.slice(0, 10).map((point) => <li key={point.driverId}>
                  <b>P{point.position}</b>
                  <span><strong>{point.driverName}</strong><small>{point.teamName} · LAP {point.lapNumber} · {point.segmentId}</small></span>
                </li>)}
              </ol>
            </> : <p className="race-engine-empty">Marker posisi akan muncul setelah event segment pertama pada replay yang dipilih.</p>}
            <small className="race-engine-replay-disclaimer">Posisi direkonstruksi dari event segmen tersimpan. Ini bukan GPS atau telemetry kontinu.</small>
          </div>
          <div className="race-engine-replay-controls">
            <button className="race-engine-secondary-button" onClick={() => setReplayPlaying((value) => !value)} disabled={replayLoading || replayEvents.length === 0}>
              {replayPlaying ? <Pause size={14}/> : <Play size={14}/>} {replayPlaying ? "Pause" : "Play"}
            </button>
            <button className="race-engine-secondary-button" onClick={() => { setReplayPlaying(false); setReplayIndex(0); }} disabled={replayLoading || replayEvents.length === 0}>Restart</button>
            <div className="race-engine-replay-speed">
              <span>PLAYBACK SPEED</span>
              {[1,2,4,8].map((speed) => <button key={speed} className={replaySpeed === speed ? "active" : ""} onClick={() => setReplaySpeed(speed)}>{speed}x</button>)}
            </div>
          </div>
          <input className="race-engine-replay-seek" aria-label="Replay event position" type="range" min={0} max={Math.max(0, replayEvents.length - 1)} value={Math.min(replayIndex, Math.max(0, replayEvents.length - 1))} onChange={(event) => { setReplayPlaying(false); setReplayIndex(Number(event.target.value)); }} disabled={replayLoading || replayEvents.length === 0}/>
          <div className="race-engine-replay-foot"><span>START</span><span>{replayEvent ? `SEQ ${replayEvent.sequence}` : "EVENT TIMELINE"}</span><span>FINISH</span></div>
        </div>
      </section>

      <section className="race-engine-event-section">
        <div className="live-race-subheading"><h3><ShieldCheck size={15}/> Control Audit</h3><span>{recentCommands.length} COMMANDS</span></div>
        <div className="race-engine-event-list">
          {recentCommands.map((command) => <article key={command.id}>
            <span className="event-lap">ADMIN</span><span className="event-marker blue"/>
            <div><strong>{command.command_type === "set_speed" ? `SPEED CHANGED · ${String(command.result.speed_multiplier)}X` : labelEvent(command.command_type)}</strong><small>Server-authorized control command</small></div>
            <time>{formatDate(command.created_at)}</time>
          </article>)}
          {!recentCommands.length && <p className="race-engine-empty">Belum ada command kontrol. Perubahan kecepatan akan tercatat di sini.</p>}
        </div>
      </section>
    </section>}

    <footer className="live-race-footer-note">
      <ShieldCheck size={15}/>
      <span>Admin-only test service · production Supabase tidak menyimpan sesi uji · ekonomi dan settlement tidak terhubung · checkpoint disimpan setiap batch dan dipulihkan melalui RaceSimulation.restore().</span>
    </footer>
  </div>;
}
