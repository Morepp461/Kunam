import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Clock3, Coins, History, LoaderCircle, RefreshCw, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AdminDevelopmentShopSettings from "./AdminDevelopmentShopSettings";

type WalletAccount = { id: string; account_kind: string; profile_user_id: string | null; member_id: string | null; team_id: string | null; balance: number; is_active: boolean; display_name: string };
type Transaction = { id: string; event_type: string; amount: number; description: string; created_at: string; source_account_id: string; destination_account_id: string; source_name: string; destination_name: string; is_reversed: boolean };
type RewardClaim = { id: string; amount: number; status: string; created_at: string; member_id: string };
type PayrollClaim = { id: string; amount: number; status: string; created_at: string; member_id: string };
type MemberCheckinClaim = { id: string; member_id: string; reward_amount: number; reward_status: string; checkin_at: string };
type EventType = "checkin_reward" | "prize" | "bank_reward" | "sponsor_payout" | "bank_funding" | "tax" | "fine" | "transfer" | "admin_adjustment";
type ConfigRow = { id: string; payload: Record<string, unknown>; is_active: boolean };
const eventLabels: Record<string, string> = { checkin_reward: "Check-in Reward", prize: "Prize", bank_reward: "Bank Reward", sponsor_payout: "Sponsor Payout", bank_funding: "Bank Funding", tax: "Pajak", fine: "Denda", transfer: "Transfer", admin_adjustment: "Penyesuaian Admin", reversal: "Pembatalan" };
const money = (value: number) => "¢p " + Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const date = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function AdminEconomyEngine({ session }: { session: Session }) {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [payrollClaims, setPayrollClaims] = useState<PayrollClaim[]>([]);
  const [memberCheckins, setMemberCheckins] = useState<MemberCheckinClaim[]>([]);
  const [config, setConfig] = useState<ConfigRow | null>(null);
  const [amount, setAmount] = useState("");
  const [eventType, setEventType] = useState<EventType>("prize");
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [description, setDescription] = useState("");
  const [rewardAmount, setRewardAmount] = useState("0");
  const [rewardActive, setRewardActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const bank = accounts.find((account) => account.account_kind === "vreeo_bank");
  const sponsor = accounts.find((account) => account.account_kind === "sponsor_source");
  const spendable = useMemo(() => accounts.filter((account) => account.is_active), [accounts]);
  const pendingClaims = claims.filter((claim) => claim.status === "pending");
  const pendingPayroll = payrollClaims.filter((claim) => claim.status === "pending");
  const pendingMemberCheckins = memberCheckins.filter((claim) => claim.reward_status === "pending");

  const refresh = useCallback(async () => {
    if (!supabase) { setNotice({ kind: "error", text: "Koneksi Supabase belum tersedia." }); setLoading(false); return; }
    setLoading(true);
    const [accountResult, transactionResult, claimResult, payrollResult, configResult, memberCheckinResult] = await Promise.all([
      supabase.from("economy_wallet_directory").select("*").order("account_kind").order("display_name"),
      supabase.from("economy_transaction_feed").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("economy_reward_claims").select("id,amount,status,created_at,member_id").order("created_at", { ascending: false }).limit(100),
      supabase.from("economy_payroll_claims").select("id,amount,status,created_at,member_id").order("created_at", { ascending: false }).limit(100),
      supabase.from("caleris_configurations").select("id,payload,is_active").eq("category", "economy").eq("config_key", "daily-checkin-reward").maybeSingle(),
      supabase.from("caleris_member_race_checkins").select("id,member_id,reward_amount,reward_status,checkin_at").eq("reward_status","pending").order("checkin_at",{ascending:false}).limit(100)
    ]);
    const errors = [accountResult.error, transactionResult.error, claimResult.error, payrollResult.error, configResult.error, memberCheckinResult.error].filter(Boolean);
    if (errors.length) setNotice({ kind: "error", text: errors.map((error) => error?.message).join(" · ") });
    if (accountResult.data) {
      const next = accountResult.data as WalletAccount[];
      setAccounts(next);
      const nextBank = next.find((account) => account.account_kind === "vreeo_bank");
      const nextSponsor = next.find((account) => account.account_kind === "sponsor_source");
      setSourceId((current) => current || nextBank?.id || nextSponsor?.id || "");
      setDestinationId((current) => current || next.find((account) => !["vreeo_bank", "sponsor_source"].includes(account.account_kind))?.id || "");
    }
    if (transactionResult.data) setTransactions(transactionResult.data as Transaction[]);
    if (claimResult.data) setClaims(claimResult.data as RewardClaim[]);
    if (payrollResult.data) setPayrollClaims(payrollResult.data as PayrollClaim[]);
    if (memberCheckinResult.data) setMemberCheckins(memberCheckinResult.data as MemberCheckinClaim[]);
    if (configResult.data) {
      const row = configResult.data as ConfigRow;
      setConfig(row);
      setRewardAmount(String(row.payload?.amount ?? 0));
      setRewardActive(row.is_active);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onEventTypeChange = (next: EventType) => {
    setEventType(next);
    if (next === "tax" || next === "fine") {
      setDestinationId(bank?.id || "");
      setSourceId(accounts.find((account) => account.is_active && !["vreeo_bank", "sponsor_source"].includes(account.account_kind))?.id || "");
    } else if (next === "sponsor_payout" || next === "bank_funding") {
      setSourceId(sponsor?.id || "");
      setDestinationId(next === "bank_funding" ? bank?.id || "" : accounts.find((account) => account.is_active && !["vreeo_bank", "sponsor_source"].includes(account.account_kind))?.id || "");
    } else {
      setSourceId(bank?.id || "");
      setDestinationId(accounts.find((account) => account.is_active && account.account_kind === "driver")?.id || accounts.find((account) => account.is_active && !["vreeo_bank", "sponsor_source"].includes(account.account_kind))?.id || "");
    }
  };

  const sourceOptions = useMemo(() => {
    if (eventType === "tax" || eventType === "fine" || eventType === "transfer") return spendable.filter((account) => !["vreeo_bank", "sponsor_source"].includes(account.account_kind));
    if (eventType === "sponsor_payout" || eventType === "bank_funding") return spendable.filter((account) => account.account_kind === "sponsor_source");
    if (eventType === "admin_adjustment") return spendable.filter((account) => account.account_kind !== "sponsor_source");
    return spendable.filter((account) => account.account_kind === "vreeo_bank");
  }, [eventType, spendable]);
  const destinationOptions = useMemo(() => {
    if (eventType === "tax" || eventType === "fine" || eventType === "bank_funding") return spendable.filter((account) => account.account_kind === "vreeo_bank");
    if (eventType === "checkin_reward") return spendable.filter((account) => account.account_kind === "driver");
    if (eventType === "admin_adjustment") return spendable.filter((account) => account.account_kind !== "sponsor_source");
    return spendable.filter((account) => !["vreeo_bank", "sponsor_source"].includes(account.account_kind));
  }, [eventType, spendable]);

  useEffect(() => {
    if (sourceOptions.length && !sourceOptions.some((account) => account.id === sourceId)) setSourceId(sourceOptions[0].id);
    if (destinationOptions.length && !destinationOptions.some((account) => account.id === destinationId)) setDestinationId(destinationOptions[0].id);
  }, [sourceOptions, destinationOptions, sourceId, destinationId]);

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 999999999999999999.99 || Number(numericAmount.toFixed(2)) !== numericAmount) {
      setNotice({ kind: "error", text: "Nominal harus lebih besar dari nol dan maksimal dua angka desimal." }); return;
    }
    if (!sourceId || !destinationId || sourceId === destinationId || !description.trim()) {
      setNotice({ kind: "error", text: "Sumber, tujuan, dan deskripsi transaksi wajib valid." }); return;
    }
    setSaving(true); setNotice(null);
    const { error } = await supabase.functions.invoke("economy-engine", {
      body: {
        action: "post",
        sourceAccountId: sourceId,
        destinationAccountId: destinationId,
        amount: numericAmount,
        eventType,
        description: description.trim(),
        idempotencyKey: crypto.randomUUID(),
        metadata: { interface: "admin-economy-engine", actor_id: session.user.id }
      }
    });
    setSaving(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else { setNotice({ kind: "success", text: "Transaksi berhasil dicatat. Saldo dan ledger diperbarui secara atomik." }); setAmount(""); setDescription(""); await refresh(); }
  };

  const saveRewardConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !config) return;
    const numericAmount = Number(rewardAmount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 999999999999999999.99 || Math.round(numericAmount * 100) !== numericAmount * 100) {
      setNotice({ kind: "error", text: "Reward harus berupa angka nol atau lebih dengan maksimal dua angka desimal." }); return;
    }
    setSaving(true); setNotice(null);
    const { error } = await supabase.from("caleris_configurations").update({
      payload: { ...config.payload, amount: numericAmount, source: "VreeoBank", destination: "All Member Wallets", currency: "¢p" },
      is_active: rewardActive && numericAmount > 0, updated_by: session.user.id, updated_at: new Date().toISOString()
    }).eq("id", config.id);
    setSaving(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else { setNotice({ kind: "success", text: "Konfigurasi reward check-in tersimpan dan masuk riwayat konfigurasi." }); await refresh(); }
  };

  const processPending = async () => {
    if (!supabase) return;
    setSaving(true); setNotice(null);
    const { data, error } = await supabase.functions.invoke("economy-engine", { body: { action: "process_pending" } });
    setSaving(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else {
      const result = (data as { result?: { paid?: number; pending?: number } })?.result ?? {};
      setNotice({ kind: "success", text: String(result.paid ?? 0) + " reward dibayarkan. " + String(result.pending ?? 0) + " masih menunggu saldo VreeoBank mencukupi." });
      await refresh();
    }
  };

  const processPendingMemberCheckins = async () => {
    if (!supabase) return;
    setSaving(true); setNotice(null);
    const { data, error } = await supabase.rpc("admin_process_pending_member_race_checkins", { p_actor_id: session.user.id });
    setSaving(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else { const result = data as { paid?: number; pending?: number }; setNotice({ kind: "success", text: String(result.paid ?? 0) + " reward member dibayarkan. " + String(result.pending ?? 0) + " masih menunggu saldo VreeoBank." }); await refresh(); }
  };

  const processPendingPayroll = async () => {
    if (!supabase) return;
    setSaving(true); setNotice(null);
    const { data, error } = await supabase.functions.invoke("economy-engine", { body: { action: "process_payroll_pending" } });
    setSaving(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else {
      const result = (data as { result?: { paid?: number; pending?: number } })?.result ?? {};
      setNotice({ kind: "success", text: String(result.paid ?? 0) + " payroll dibayarkan. " + String(result.pending ?? 0) + " masih menunggu saldo Team Wallet mencukupi." });
      await refresh();
    }
  };

  const reverseTransaction = async (transaction: Transaction) => {
    if (!supabase || transaction.is_reversed || !window.confirm("Batalkan transaksi " + transaction.description + "? Pembatalan akan membuat transaksi lawan, bukan menghapus riwayat.")) return;
    setSaving(true); setNotice(null);
    const { error } = await supabase.functions.invoke("economy-engine", { body: { action: "reverse", transactionId: transaction.id } });
    setSaving(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else { setNotice({ kind: "success", text: "Transaksi dibatalkan melalui entri reversal. Riwayat asli tetap utuh." }); await refresh(); }
  };

  const accountLabel = (account: WalletAccount) => account.display_name + " · " + account.account_kind.replaceAll("_", " ");

  return <section className="workspace economy-workspace">
    <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
    <header className="economy-heading">
      <div><span className="section-eyebrow">ADMIN CONTROL · FINANCIAL CORE</span><h1>Economy Engine</h1><p>Wallet, sumber dana, transaksi, pajak, denda, dan rekonsiliasi ¢p.</p></div>
      <span className="economy-admin-mark"><ShieldCheck size={16}/> ADMIN ONLY</span>
    </header>

    <AdminDevelopmentShopSettings />

    <div className="economy-summary-grid">
      <article className="economy-summary-card bank"><span><Banknote size={17}/> VreeoBank</span><strong>{bank ? money(bank.balance) : "—"}</strong><small>Sumber hadiah, check-in, dan pembayaran resmi</small></article>
      <article className="economy-summary-card sponsor"><span><Coins size={17}/> Sponsor Source</span><strong>{sponsor ? money(sponsor.balance) : "—"}</strong><small>Sumber pendanaan eksternal sponsor</small></article>
      <article className="economy-summary-card pending"><span><Clock3 size={17}/> Pending Check-in</span><strong>{pendingClaims.length}</strong><small>Reward menunggu saldo VreeoBank</small></article>
      <article className="economy-summary-card wallets"><span><Wallet size={17}/> Active Wallets</span><strong>{accounts.filter((account) => account.is_active && account.account_kind !== "sponsor_source").length}</strong><small>Public member, Driver, Owner, Team, Bank</small></article>
    </div>

    <div className="economy-main-grid">
      <section className="economy-panel">
        <div className="economy-panel-heading"><div><span className="section-eyebrow">TRANSACTION CONTROL</span><h2>Catat transaksi</h2></div><ArrowUpRight size={19}/></div>
        <form className="economy-form" onSubmit={submitTransaction}>
          <label>Jenis transaksi<select value={eventType} onChange={(event) => onEventTypeChange(event.target.value as EventType)}>
            <option value="prize">Prize · VreeoBank</option><option value="bank_reward">Bank reward · VreeoBank</option><option value="checkin_reward">Check-in reward · VreeoBank</option>
            <option value="sponsor_payout">Sponsor payout · Sponsor</option><option value="bank_funding">Bank funding · Sponsor → VreeoBank</option>
            <option value="tax">Pajak · menuju VreeoBank</option><option value="fine">Denda · menuju VreeoBank</option>
            <option value="transfer">Transfer antar wallet</option><option value="admin_adjustment">Penyesuaian Admin</option>
          </select></label>
          <div className="economy-form-row">
            <label>Sumber<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} required>{sourceOptions.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></label>
            <label>Tujuan<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>{destinationOptions.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></label>
          </div>
          <label>Nominal (¢p)<input type="number" min="0.01" max="999999999999999999.99" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Masukkan nominal" required/></label>
          <label>Deskripsi<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder="Contoh: Prize Round 1 · Caleris Premio" required/></label>
          <p className="economy-form-hint">Pajak dan denda otomatis diarahkan ke VreeoBank serta boleh membuat saldo pembayar negatif. Transaksi keluar lainnya wajib memiliki saldo cukup.</p>
          <button className="economy-primary-button" type="submit" disabled={saving || loading || !sourceOptions.length || !destinationOptions.length}><Coins size={16}/>{saving ? "Memproses..." : "Posting transaksi"}</button>
        </form>
      </section>

      <section className="economy-panel">
        <div className="economy-panel-heading"><div><span className="section-eyebrow">AUTOMATED REWARD</span><h2>Daily Check-in Reward</h2></div><CheckCircle2 size={19}/></div>
        {config ? <form className="economy-form" onSubmit={saveRewardConfig}>
          <div className="economy-source-route"><span>VreeoBank</span><ArrowUpRight size={16}/><strong>All Member Wallets</strong></div>
          <label>Reward per check-in (¢p)<input type="number" min="0" max="999999999999999999.99" step="0.01" value={rewardAmount} onChange={(event) => setRewardAmount(event.target.value)}/></label>
          <label className="economy-toggle"><input type="checkbox" checked={rewardActive} onChange={(event) => setRewardActive(event.target.checked)}/> Aktifkan reward otomatis</label>
          <p className="economy-form-hint">Nilai awal nol dan nonaktif. Jika saldo Bank belum cukup, check-in tetap tersimpan dan reward masuk antrean pending. Tidak ada reward yang hilang diam-diam.</p>
          <button className="economy-primary-button" type="submit" disabled={saving}><ShieldCheck size={16}/> Simpan aturan reward</button>
        </form> : <p className="economy-empty">Konfigurasi reward belum tersedia. Pastikan migration Economy Engine sudah diterapkan.</p>}
        <div className="economy-pending-box">
          <div><strong>{pendingClaims.length} reward tertunda</strong><small>Saldo Bank saat ini: {bank ? money(bank.balance) : "—"}</small></div>
          <button type="button" className="economy-secondary-button" onClick={() => void processPending()} disabled={saving || pendingClaims.length === 0}><RefreshCw size={15}/> Proses pending</button>
        </div>
        <div className="economy-pending-box">
          <div><strong>{pendingMemberCheckins.length} reward all-role tertunda</strong><small>Race check-in untuk Driver, Owner, dan role lainnya</small></div>
          <button type="button" className="economy-secondary-button" onClick={() => void processPendingMemberCheckins()} disabled={saving || pendingMemberCheckins.length === 0}><RefreshCw size={15}/> Proses reward member</button>
        </div>
        <div className="economy-pending-box">
          <div><strong>{pendingPayroll.length} payroll tertunda</strong><small>Menunggu saldo Team Wallet mencukupi</small></div>
          <button type="button" className="economy-secondary-button" onClick={() => void processPendingPayroll()} disabled={saving || pendingPayroll.length === 0}><RefreshCw size={15}/> Proses payroll</button>
        </div>
      </section>
    </div>

    <section className="economy-panel economy-wallet-panel">
      <div className="economy-panel-heading"><div><span className="section-eyebrow">ACCOUNT REGISTRY</span><h2>Wallet registry</h2></div><button className="economy-secondary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      {loading ? <div className="economy-empty"><LoaderCircle className="spin"/> Memuat wallet...</div> : accounts.length === 0 ? <div className="economy-empty">Belum ada wallet yang terdaftar.</div> :
        <div className="economy-wallet-grid">{accounts.map((account) => <article className={"economy-wallet-card" + (account.balance < 0 ? " negative" : "")} key={account.id}>
          <span>{account.account_kind.replaceAll("_", " ")}</span><strong>{money(account.balance)}</strong><small>{account.display_name}</small><em>{account.is_active ? "ACTIVE" : "INACTIVE"}</em>
        </article>)}</div>}
    </section>

    <section className="economy-panel">
      <div className="economy-panel-heading"><div><span className="section-eyebrow">IMMUTABLE FINANCIAL HISTORY</span><h2>Transaction ledger</h2></div><History size={19}/></div>
      {loading ? <div className="economy-empty">Memuat transaksi...</div> : transactions.length === 0 ? <div className="economy-empty">Belum ada transaksi. Ledger akan bertambah setelah transaksi pertama berhasil diposting.</div> :
        <div className="economy-ledger-list">{transactions.map((transaction) => <article className="economy-ledger-row" key={transaction.id}>
          <div className="economy-ledger-icon">{transaction.event_type === "reversal" ? <XCircle size={17}/> : transaction.event_type === "tax" || transaction.event_type === "fine" ? <ArrowDownLeft size={17}/> : <ArrowUpRight size={17}/>}</div>
          <div className="economy-ledger-copy"><strong>{transaction.description}</strong><span>{eventLabels[transaction.event_type] || transaction.event_type} · {transaction.source_name} → {transaction.destination_name}</span><small>{date(transaction.created_at)}</small></div>
          <div className="economy-ledger-value"><strong>{money(transaction.amount)}</strong>{transaction.is_reversed || transaction.event_type === "reversal" ? <em>{transaction.event_type === "reversal" ? "REVERSAL" : "REVERSED"}</em> : <button type="button" onClick={() => void reverseTransaction(transaction)} disabled={saving}>Reverse</button>}</div>
        </article>)}</div>}
    </section>

    {notice && <div className={"economy-notice " + notice.kind} role="status">{notice.kind === "success" ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<span>{notice.text}</span></div>}
    <div className="economy-security-note"><ShieldCheck size={17}/><p>Semua transaksi diproses oleh database dalam satu transaksi atomik, dikunci per wallet, dilindungi idempotency key, dan tidak dapat dihapus. Koreksi dilakukan dengan reversal yang tercatat.</p></div>
  </section>;
}
