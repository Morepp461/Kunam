import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";

type PendingItem = {
  kind: "daily_reward" | "race_checkin" | "payroll";
  id: string;
  member_id: string;
  amount: number;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
};
type RetryRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  reward_attempted: number;
  reward_paid: number;
  reward_pending: number;
  checkin_attempted: number;
  checkin_paid: number;
  checkin_pending: number;
  error: string | null;
};
type Snapshot = {
  pending_rewards: number;
  pending_member_checkins: number;
  pending_payroll: number;
  failed_retry_runs: number;
  recent_runs: RetryRun[];
  pending_items: PendingItem[];
};
const money = (value: number) => "€ " + Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const date = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum pernah";

export default function AdminEconomyAudit() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase) { setError("Koneksi Supabase belum tersedia."); setLoading(false); return; }
    setLoading(true);
    const { data, error: requestError } = await supabase.rpc("admin_get_economy_audit_snapshot");
    if (requestError) setError(requestError.message);
    else { setSnapshot(data as Snapshot); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const pendingTotal = (snapshot?.pending_rewards ?? 0) + (snapshot?.pending_member_checkins ?? 0) + (snapshot?.pending_payroll ?? 0);
  return <section className="economy-panel economy-audit-panel">
    <div className="economy-panel-heading">
      <div><span className="section-eyebrow">MONITORING · IMMUTABLE RUN LOG</span><h2>Economy Audit Center</h2></div>
      <button className="economy-secondary-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh audit</button>
    </div>
    <div className="economy-audit-summary">
      <article><span>Pending total</span><strong>{loading ? "—" : pendingTotal}</strong></article>
      <article><span>Daily reward</span><strong>{loading ? "—" : snapshot?.pending_rewards ?? 0}</strong></article>
      <article><span>Race check-in</span><strong>{loading ? "—" : snapshot?.pending_member_checkins ?? 0}</strong></article>
      <article><span>Payroll</span><strong>{loading ? "—" : snapshot?.pending_payroll ?? 0}</strong></article>
      <article><span>Retry gagal</span><strong>{loading ? "—" : snapshot?.failed_retry_runs ?? 0}</strong></article>
    </div>
    {error && <p className="economy-audit-error"><AlertTriangle size={15}/>{error}</p>}
    <div className="economy-audit-columns">
      <div>
        <h3><Clock3 size={15}/> Pending dan gagal diproses</h3>
        {loading ? <p className="economy-audit-empty">Memuat status transaksi...</p> : !snapshot?.pending_items.length ? <p className="economy-audit-empty">Tidak ada transaksi tertunda.</p> :
          <div className="economy-audit-list">{snapshot.pending_items.map(item => <article key={item.kind + item.id}>
            <div><strong>{item.kind === "daily_reward" ? "Daily reward" : item.kind === "race_checkin" ? "Race check-in" : "Payroll"}</strong><small>{item.member_id} · {date(item.created_at)}</small></div>
            <div className="economy-audit-amount"><strong>{money(item.amount)}</strong><small>{item.attempts} percobaan</small></div>
            <p>{item.last_error || (item.kind === "payroll" ? "Menunggu pemrosesan payroll oleh Admin setelah hasil round." : "Menunggu retry otomatis berikutnya.")}</p>
            {item.last_attempt_at && <small>Retry terakhir: {date(item.last_attempt_at)}</small>}
          </article>)}</div>}
      </div>
      <div>
        <h3><Activity size={15}/> Riwayat retry otomatis</h3>
        {!snapshot?.recent_runs.length && !loading ? <p className="economy-audit-empty">Belum ada siklus retry yang tercatat.</p> :
          <div className="economy-audit-list">{snapshot?.recent_runs.map(run => <article key={run.id}>
            <div><strong>{run.status === "completed" ? "Selesai" : run.status === "failed" ? "Gagal" : "Berjalan"}</strong><small>{date(run.started_at)}</small></div>
            <div className="economy-audit-amount"><strong>{run.reward_paid + run.checkin_paid} dibayar</strong><small>{run.reward_pending + run.checkin_pending} masih pending</small></div>
            <p>Daily reward {run.reward_attempted} dicoba · Race check-in {run.checkin_attempted} dicoba</p>
            {run.error && <p className="economy-audit-error">{run.error}</p>}
          </article>)}</div>}
      </div>
    </div>
    <p className="economy-audit-footnote"><ShieldCheck size={15}/> Reward dan race check-in dicoba ulang otomatis setiap 5 menit. Payroll tetap mengikuti pemrosesan round; retry payroll dilakukan melalui kontrol Admin, bukan scheduler.</p>
  </section>;
}
