import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock3, Flag,
  Gauge, LoaderCircle, Play, RefreshCw, RotateCcw, ShieldCheck, Timer,
  Trophy, Waves, Wrench
} from "lucide-react";
import { supabase } from "./lib/supabase";
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
  engine_version: string;
  tick: number;
  total_ticks: number;
  speed_multiplier: number;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  checkpoint?: any;
  classification?: Array<{
    position: number;
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

type RaceCommand = { id: string; command_type: string; result: Record<string, unknown>; created_at: string };

type RaceEvent = {
  sequence: number;
  event_type: string;
  driver_id: string | null;
  lap_number: number;
  simulation_time_ms: number;
  payload: Record<string, unknown>;
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

async function raceApi(action: string, payload: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("Supabase production belum terkonfigurasi.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sesi login tidak ditemukan. Login ulang sebagai Admin.");
  const response = await fetch(TEST_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": TEST_API_KEY,
      "Authorization": `Bearer ${data.session.access_token}`
    },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Race Engine API gagal (${response.status}).`);
  return result;
}

export default function LiveRace() {
  const [sessions, setSessions] = useState<RaceSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ session: RaceSession; events: RaceEvent[]; commands: RaceCommand[] } | null>(null);
  const [driverCount, setDriverCount] = useState(20);
  const [teamCount, setTeamCount] = useState(10);
  const [totalLaps, setTotalLaps] = useState(5);
  const [seed, setSeed] = useState("20261120");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

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
      setDetail({ session: result.session as RaceSession, events: (result.events ?? []) as RaceEvent[], commands: (result.commands ?? []) as RaceCommand[] });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat detail sesi.");
    }
  }, []);

  useEffect(() => { void refreshSessions(); }, [refreshSessions]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  const active = detail?.session?.id === selectedId ? detail.session : sessions.find((item) => item.id === selectedId) ?? null;
  const progress = active ? Math.min(100, Math.round((active.tick / Math.max(1, active.total_ticks)) * 100)) : 0;
  const checkpoint = detail?.session?.id === selectedId ? detail.session.checkpoint : null;
  const entrants = Array.isArray(checkpoint?.entrants) ? checkpoint.entrants : [];
  const tyreStates = entrants.filter((entry: any) => entry.tyreState);
  const weather = checkpoint?.weatherState;
  const classification = active?.classification ?? [];
  const recentEvents = useMemo(() => [...(detail?.events ?? [])].reverse().slice(-35).reverse(), [detail?.events]);
  const recentCommands = useMemo(() => [...(detail?.commands ?? [])].slice(0, 12), [detail?.commands]);

  async function createSession() {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const result = await raceApi("create", {
        driverCount, teamCount, totalLaps, seed: Number(seed)
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

  return <div className="workspace live-race-workspace">
    <header className="page-heading live-race-heading">
      <div>
        <span className="eyebrow">CALERIS RACE CONTROL · PHASE 3</span>
        <h1 className="page-title">RACE ENGINE LAB</h1>
        <p className="page-description">Jalankan simulasi deterministik, simpan checkpoint, dan uji pemulihan sesi dari web.</p>
      </div>
      <span className="live-race-admin-tag"><ShieldCheck size={14}/> ADMIN ONLY</span>
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
      <div className="race-engine-form-grid">
        <label>Drivers
          <select value={driverCount} onChange={(event) => {
            const value = Number(event.target.value);
            setDriverCount(value);
            if (teamCount > value) setTeamCount(value);
          }}>
            {[2,4,6,10,12,16,20].map((value) => <option key={value} value={value}>{value} drivers</option>)}
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
      <div className="race-engine-form-footer">
        <span>Up to 20 AI drivers · 10 teams · 10 laps · 9 circuit segments per lap</span>
        <button className="race-engine-primary-button" onClick={createSession} disabled={Boolean(busy) || !seed.trim()}>
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
              <thead><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>LAP</th><th>TIME</th><th>PITS</th><th>STATUS</th></tr></thead>
              <tbody>
                {(classification.length ? classification : (checkpoint?.entrants ?? []).map((entry: any, index: number) => ({
                  position: index + 1, driverId: entry.driverId, teamId: entry.teamId,
                  lapCompleted: entry.lapCompleted, elapsedMs: entry.elapsedMs,
                  finished: entry.finished, retired: entry.retired, pitStopCount: entry.pitStopCount
                }))).map((entry: any) => <tr key={entry.driverId}>
                  <td><strong className="driver-position">{String(entry.position).padStart(2,"0")}</strong></td>
                  <td>{entry.driverId}</td><td>{entry.teamId}</td><td>{entry.lapCompleted}</td>
                  <td className="lap-time">{formatTime(entry.elapsedMs)}</td><td>{entry.pitStopCount ?? 0}</td>
                  <td><span className={"race-engine-status status-" + (entry.retired ? "failed" : entry.finished ? "completed" : "running")}>{entry.retired ? "RETIRED" : entry.finished ? "FINISHED" : "RUNNING"}</span></td>
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
      </div>

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
