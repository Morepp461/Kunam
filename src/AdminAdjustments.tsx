import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, ShieldCheck, Wallet, Award } from "lucide-react";
import { supabase } from "./lib/supabase";

type Driver = { id: string; character_name: string | null; member_code: string | null; license: string | null };
type LicenseOption = { license_label: string; license_tier: string | null; is_active: boolean };
type WalletOption = { id: string; account_kind: string; member_id: string | null; team_id: string | null; display_name: string; balance: number; is_active: boolean };

const money = (n: number) => "€ " + Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const walletLabel = (w: WalletOption) => w.display_name + " · " + w.account_kind.replaceAll("_", " ");

export default function AdminAdjustments({ session }: { session: Session }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [licenses, setLicenses] = useState<LicenseOption[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [memberId, setMemberId] = useState("");
  const [licenseLabel, setLicenseLabel] = useState("");
  const [licenseReason, setLicenseReason] = useState("");
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [walletReason, setWalletReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingLicense, setSavingLicense] = useState(false);
  const [savingWallet, setSavingWallet] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [d, l, w] = await Promise.all([
      supabase.from("members").select("id,character_name,member_code,license").eq("role", "Driver").order("character_name"),
      supabase.from("caleris_development_license_tier_mapping").select("license_label,license_tier,is_active").eq("is_active", true).not("license_tier", "is", null).order("license_label"),
      supabase.from("economy_wallet_directory").select("id,account_kind,member_id,team_id,display_name,balance,is_active").in("account_kind", ["driver", "team_owner", "team"]).eq("is_active", true).order("account_kind").order("display_name")
    ]);
    const error = d.error || l.error || w.error;
    if (error) setNotice({ kind: "error", text: error.message });
    setDrivers((d.data || []) as Driver[]);
    setLicenses((l.data || []) as LicenseOption[]);
    setWallets((w.data || []) as WalletOption[]);
    if (d.data?.length) setMemberId(current => current || d.data![0].id);
    if (l.data?.length) setLicenseLabel(current => current || l.data![0].license_label);
    if (w.data?.length) setWalletId(current => current || w.data![0].id);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const assignLicense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !memberId || !licenseLabel || licenseReason.trim().length < 3) return;
    setSavingLicense(true); setNotice(null);
    const { data, error } = await supabase.rpc("admin_assign_driver_license", {
      p_member_id: memberId, p_license_label: licenseLabel, p_reason: licenseReason.trim()
    });
    setSavingLicense(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else {
      setNotice({ kind: "success", text: "Lisensi driver berhasil diperbarui dan audit penetapan tersimpan." });
      setLicenseReason("");
      await load();
    }
  };

  const injectWallet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !walletId || walletReason.trim().length < 3) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || Number(value.toFixed(2)) !== value) {
      setNotice({ kind: "error", text: "Nominal harus lebih besar dari nol dan maksimal dua angka desimal." }); return;
    }
    setSavingWallet(true); setNotice(null);
    const { error } = await supabase.rpc("admin_inject_wallet_balance", {
      p_wallet_account_id: walletId, p_amount: value, p_reason: walletReason.trim(),
      p_idempotency_key: "admin-wallet-injection:" + crypto.randomUUID()
    });
    setSavingWallet(false);
    if (error) setNotice({ kind: "error", text: error.message });
    else {
      setNotice({ kind: "success", text: "Saldo berhasil ditambahkan melalui VreeoBank. Ledger dan audit tersimpan." });
      setAmount(""); setWalletReason("");
      await load();
    }
  };

  const selectedDriver = drivers.find(d => d.id === memberId);
  const selectedWallet = wallets.find(w => w.id === walletId);

  return <section className="workspace economy-workspace">
    <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
    <header className="economy-heading">
      <div><span className="section-eyebrow">ADMIN CONTROL · DATA ADJUSTMENT</span><h1>License & Wallet Adjustments</h1><p>Penyesuaian data historis dengan pilihan entitas dari database dan pencatatan audit.</p></div>
      <button className="license-small-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </header>
    {notice && <div className={"license-notice " + notice.kind}>{notice.text}</div>}
    {loading ? <div className="center-state">Memuat data database...</div> : <>
      <section className="workspace-card">
        <div className="section-title-row"><div><span className="section-eyebrow">LICENSE ASSIGNMENT</span><h2><Award size={19}/> Penetapan lisensi Driver</h2></div><ShieldCheck size={20}/></div>
        <p className="license-muted">Pilihan lisensi berasal dari mapping tier aktif. Perubahan tidak menghapus score ledger dan dicatat bersama Admin pelaksana.</p>
        <form className="economy-transaction-form" onSubmit={assignLicense}>
          <label className="config-field">Driver
            <select value={memberId} onChange={e => setMemberId(e.target.value)} required>
              <option value="">Pilih driver</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.character_name || d.member_code || d.id} · {d.license || "Belum ada lisensi"}</option>)}
            </select>
          </label>
          <label className="config-field">Lisensi tujuan
            <select value={licenseLabel} onChange={e => setLicenseLabel(e.target.value)} required>
              <option value="">Pilih lisensi</option>
              {licenses.map(l => <option key={l.license_label} value={l.license_label}>{l.license_label} · {l.license_tier}</option>)}
            </select>
          </label>
          {selectedDriver && <p className="license-muted">Lisensi saat ini: <strong>{selectedDriver.license || "Belum ditetapkan"}</strong></p>}
          <label className="config-field">Alasan penyesuaian
            <input value={licenseReason} onChange={e => setLicenseReason(e.target.value)} minLength={3} maxLength={240} required placeholder="Contoh: sinkronisasi data season sebelumnya"/>
          </label>
          <button className="action primary" type="submit" disabled={savingLicense || !memberId || !licenseLabel || licenseReason.trim().length < 3}>{savingLicense ? "Menyimpan..." : "Tetapkan lisensi"}</button>
        </form>
      </section>

      <section className="workspace-card">
        <div className="section-title-row"><div><span className="section-eyebrow">VREEOBANK WALLET INJECTION</span><h2><Wallet size={19}/> Inject saldo wallet</h2></div><ShieldCheck size={20}/></div>
        <p className="license-muted">Hanya wallet Driver, Owner, dan Tim yang aktif. Dana difunding ke VreeoBank dari akun sumber sistem, lalu dikreditkan dalam satu transaksi database atomik.</p>
        <form className="economy-transaction-form" onSubmit={injectWallet}>
          <label className="config-field">Wallet tujuan
            <select value={walletId} onChange={e => setWalletId(e.target.value)} required>
              <option value="">Pilih wallet</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{walletLabel(w)} · {money(w.balance)}</option>)}
            </select>
          </label>
          {selectedWallet && <p className="license-muted">Saldo saat ini: <strong>{money(selectedWallet.balance)}</strong></p>}
          <label className="config-field">Nominal (€)
            <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00"/>
          </label>
          <label className="config-field">Catatan penyesuaian
            <input value={walletReason} onChange={e => setWalletReason(e.target.value)} minLength={3} maxLength={240} required placeholder="Contoh: migrasi saldo dari web sebelumnya"/>
          </label>
          <button className="action primary" type="submit" disabled={savingWallet || !walletId || !amount || walletReason.trim().length < 3}>{savingWallet ? "Memproses..." : "Inject saldo melalui VreeoBank"}</button>
        </form>
      </section>
    </>}
  </section>;
}
