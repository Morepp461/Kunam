import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Coins, Package, RefreshCw, Save, Users } from "lucide-react";
import { supabase } from "./lib/supabase";

type Product = { id: string; product_key: string; product_name: string; unit_price: number; unit_cost: number; demand_share: number; capacity_per_round: number; is_active: boolean };
type Run = { id: string; round_id: string; fan_population: number; reputation_score: number; conversion_rate: number; units_sold: number; gross_revenue: number; production_cost: number; net_revenue: number; created_at: string };
type Item = { sales_run_id: string; product_name: string; units_sold: number; gross_revenue: number; production_cost: number };
type EngineConfig = { is_enabled: boolean; base_conversion_rate: number; max_conversion_rate: number; reputation_factor_min: number; reputation_factor_max: number; hq_demand_bonus_per_level: number; hq_capacity_bonus_per_level: number };
type FanSummary = { population: number; loyalty: number; engagement: number; sentiment: number };
type Facility = { facility_key: string; level: number; condition: number };

const money = (value: number) => "€" + Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const defaults: EngineConfig = { is_enabled: true, base_conversion_rate: 0.002, max_conversion_rate: 0.01, reputation_factor_min: 0.75, reputation_factor_max: 1.25, hq_demand_bonus_per_level: 2.5, hq_capacity_bonus_per_level: 3 };

export default function TeamMerchandise({ teamId, isOwner, isAdmin }: { teamId: string | null; isOwner: boolean; isAdmin: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [fans, setFans] = useState<FanSummary[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [reputation, setReputation] = useState(0);
  const [config, setConfig] = useState<EngineConfig>(defaults);
  const [configDraft, setConfigDraft] = useState<Record<keyof EngineConfig, string | boolean>>({
    is_enabled: defaults.is_enabled,
    base_conversion_rate: String(defaults.base_conversion_rate * 100),
    max_conversion_rate: String(defaults.max_conversion_rate * 100),
    reputation_factor_min: String(defaults.reputation_factor_min),
    reputation_factor_max: String(defaults.reputation_factor_max),
    hq_demand_bonus_per_level: String(defaults.hq_demand_bonus_per_level),
    hq_capacity_bonus_per_level: String(defaults.hq_capacity_bonus_per_level)
  });
  const [drafts, setDrafts] = useState<Record<string, { unit_price: string; unit_cost: string; demand_share: string; capacity_per_round: string; is_active: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) { setError("Koneksi Supabase tidak tersedia."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data: cfg, error: cfgError } = await supabase.from("caleris_merchandise_engine_config").select("*").eq("singleton", true).maybeSingle();
    if (cfgError) setError(cfgError.message);
    if (cfg) {
      const next: EngineConfig = {
        is_enabled: Boolean(cfg.is_enabled),
        base_conversion_rate: Number(cfg.base_conversion_rate),
        max_conversion_rate: Number(cfg.max_conversion_rate),
        reputation_factor_min: Number(cfg.reputation_factor_min),
        reputation_factor_max: Number(cfg.reputation_factor_max),
        hq_demand_bonus_per_level: Number(cfg.hq_demand_bonus_per_level),
        hq_capacity_bonus_per_level: Number(cfg.hq_capacity_bonus_per_level)
      };
      setConfig(next);
      setConfigDraft({
        is_enabled: next.is_enabled,
        base_conversion_rate: String(next.base_conversion_rate * 100),
        max_conversion_rate: String(next.max_conversion_rate * 100),
        reputation_factor_min: String(next.reputation_factor_min),
        reputation_factor_max: String(next.reputation_factor_max),
        hq_demand_bonus_per_level: String(next.hq_demand_bonus_per_level),
        hq_capacity_bonus_per_level: String(next.hq_capacity_bonus_per_level)
      });
    }
    if (!teamId) { setProducts([]); setRuns([]); setItems([]); setFans([]); setFacilities([]); setReputation(0); setLoading(false); return; }
    const [productQ, runQ, fanQ, repQ, facilityQ] = await Promise.all([
      supabase.from("caleris_merchandise_products").select("*").eq("team_id", teamId).order("product_key"),
      supabase.from("caleris_merchandise_sales_runs").select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(12),
      supabase.from("caleris_fan_populations").select("population,loyalty,engagement,sentiment").eq("entity_kind", "team").eq("team_id", teamId),
      supabase.from("caleris_team_reputation").select("score").eq("team_id", teamId).maybeSingle(),
      supabase.from("caleris_team_hq_facilities").select("facility_key,level,condition").eq("team_id", teamId)
    ]);
    const issue = [productQ.error, runQ.error, fanQ.error, repQ.error, facilityQ.error].find(Boolean);
    if (issue) setError(issue.message);
    setProducts((productQ.data ?? []) as Product[]);
    setRuns((runQ.data ?? []) as Run[]);
    setFans((fanQ.data ?? []) as FanSummary[]);
    setReputation(Number(repQ.data?.score ?? 0));
    setFacilities((facilityQ.data ?? []) as Facility[]);
    const runIds = (runQ.data ?? []).map((row: any) => row.id);
    if (runIds.length) {
      const { data: itemRows, error: itemError } = await supabase.from("caleris_merchandise_sales_items").select("sales_run_id,product_name,units_sold,gross_revenue,production_cost").in("sales_run_id", runIds);
      if (itemError) setError(itemError.message);
      setItems((itemRows ?? []) as Item[]);
    } else setItems([]);
    setDrafts(Object.fromEntries((productQ.data ?? []).map((p: any) => [p.id, {
      unit_price: String(p.unit_price), unit_cost: String(p.unit_cost), demand_share: String(Number(p.demand_share) * 100),
      capacity_per_round: String(p.capacity_per_round), is_active: Boolean(p.is_active)
    }])));
    setLoading(false);
  }, [teamId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalFans = fans.reduce((sum, fan) => sum + Number(fan.population || 0), 0);
  const avg = (key: keyof FanSummary) => fans.length ? fans.reduce((sum, fan) => sum + Number(fan[key] || 0), 0) / fans.length : 0;
  const totals = useMemo(() => runs.reduce((sum, run) => ({
    gross: sum.gross + Number(run.gross_revenue || 0),
    cost: sum.cost + Number(run.production_cost || 0),
    net: sum.net + Number(run.net_revenue || 0),
    units: sum.units + Number(run.units_sold || 0)
  }), { gross: 0, cost: 0, net: 0, units: 0 }), [runs]);
  const itemTotals = useMemo(() => items.reduce((acc, item) => {
    const key = item.product_name;
    acc[key] = (acc[key] || 0) + Number(item.units_sold || 0);
    return acc;
  }, {} as Record<string, number>), [items]);
  const facilityLevel = (key: string) => facilities.find((facility) => facility.facility_key === key)?.level ?? 0;

  const saveEngineConfig = async () => {
    if (!supabase || !isAdmin) return;
    const base = Number(configDraft.base_conversion_rate) / 100;
    const max = Number(configDraft.max_conversion_rate) / 100;
    const minRep = Number(configDraft.reputation_factor_min);
    const maxRep = Number(configDraft.reputation_factor_max);
    const demand = Number(configDraft.hq_demand_bonus_per_level);
    const capacity = Number(configDraft.hq_capacity_bonus_per_level);
    if (![base, max, minRep, maxRep, demand, capacity].every(Number.isFinite) || base < 0 || max < base || max > 2 || minRep < 0.5 || maxRep < minRep || maxRep > 2 || demand < 0 || demand > 20 || capacity < 0 || capacity > 20) {
      setError("Periksa batas conversion, reputation multiplier, dan bonus HQ."); return;
    }
    setSaving(true); setError(""); setNotice("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from("caleris_merchandise_engine_config").update({
      is_enabled: Boolean(configDraft.is_enabled), base_conversion_rate: base, max_conversion_rate: max,
      reputation_factor_min: minRep, reputation_factor_max: maxRep,
      hq_demand_bonus_per_level: demand, hq_capacity_bonus_per_level: capacity,
      updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null
    }).eq("singleton", true);
    setSaving(false);
    if (saveError) setError(saveError.message);
    else { setNotice("Konfigurasi merchandise tersimpan."); await refresh(); }
  };

  const saveProduct = async (product: Product) => {
    if (!supabase) return;
    const draft = drafts[product.id];
    if (!draft) return;
    const price = Number(draft.unit_price), cost = Number(draft.unit_cost);
    const share = Number(draft.demand_share) / 100, capacity = Number(draft.capacity_per_round);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || cost >= price || !Number.isFinite(share) || share <= 0 || share > 1 || !Number.isInteger(capacity) || capacity < 0) {
      setError("Harga, biaya produksi, demand share, atau kapasitas produk tidak valid."); return;
    }
    setSaving(true); setError(""); setNotice("");
    let saveError: { message: string } | null = null;
    if (isAdmin) {
      const result = await supabase.from("caleris_merchandise_products").update({
        unit_price: price, unit_cost: cost, demand_share: share, capacity_per_round: capacity,
        is_active: draft.is_active, updated_at: new Date().toISOString()
      }).eq("id", product.id);
      saveError = result.error;
    } else if (isOwner) {
      const result = await supabase.rpc("member_update_merchandise_product", {
        p_product_id: product.id, p_unit_price: price, p_is_active: draft.is_active
      });
      saveError = result.error;
    } else {
      saveError = { message: "Akses pengelolaan produk tidak tersedia." };
    }
    setSaving(false);
    if (saveError) setError(saveError.message);
    else { setNotice("Produk merchandise diperbarui."); await refresh(); }
  };

  if (loading) return <section className="team-merchandise"><p>Memuat Merchandise Engine...</p></section>;
  return <section className="team-merchandise">
    <header className="team-merch-heading">
      <div><span className="section-eyebrow">BRAND ECONOMY · OFFICIAL STORE</span><h2>Merchandise Engine</h2><p>Penjualan simulasi fanbase setelah hasil race resmi dipublikasikan.</p></div>
      <button className="team-hq-refresh" onClick={() => void refresh()}><RefreshCw size={15}/> Refresh</button>
    </header>
    {error && <p className="team-hq-error">{error}</p>}{notice && <p className="team-hq-notice">{notice}</p>}
    {isAdmin && <section className="team-merch-admin">
      <div className="team-hq-section-title"><div><span className="section-eyebrow">FIA / ADMIN CONFIGURATION</span><h3>Merchandise market rules</h3></div><span className={config.is_enabled ? "team-hq-status" : "team-hq-status disabled"}>{config.is_enabled ? "ACTIVE" : "PAUSED"}</span></div>
      <label className="team-merch-toggle"><input type="checkbox" checked={Boolean(configDraft.is_enabled)} onChange={e => setConfigDraft(v => ({ ...v, is_enabled: e.target.checked }))}/> Aktifkan simulasi penjualan setiap race</label>
      <div className="team-merch-config-grid">
        <label>Base conversion (% per round)<input type="number" min="0" max="2" step="0.01" value={String(configDraft.base_conversion_rate)} onChange={e => setConfigDraft(v => ({ ...v, base_conversion_rate: e.target.value }))}/></label>
        <label>Maximum conversion (% per round)<input type="number" min="0" max="2" step="0.01" value={String(configDraft.max_conversion_rate)} onChange={e => setConfigDraft(v => ({ ...v, max_conversion_rate: e.target.value }))}/></label>
        <label>Minimum reputation multiplier<input type="number" min="0.5" max="2" step="0.05" value={String(configDraft.reputation_factor_min)} onChange={e => setConfigDraft(v => ({ ...v, reputation_factor_min: e.target.value }))}/></label>
        <label>Maximum reputation multiplier<input type="number" min="0.5" max="2" step="0.05" value={String(configDraft.reputation_factor_max)} onChange={e => setConfigDraft(v => ({ ...v, reputation_factor_max: e.target.value }))}/></label>
        <label>HQ demand bonus per level (%)<input type="number" min="0" max="20" step="0.5" value={String(configDraft.hq_demand_bonus_per_level)} onChange={e => setConfigDraft(v => ({ ...v, hq_demand_bonus_per_level: e.target.value }))}/></label>
        <label>HQ capacity bonus per level (%)<input type="number" min="0" max="20" step="0.5" value={String(configDraft.hq_capacity_bonus_per_level)} onChange={e => setConfigDraft(v => ({ ...v, hq_capacity_bonus_per_level: e.target.value }))}/></label>
      </div>
      <button className="team-hq-save" disabled={saving} onClick={() => void saveEngineConfig()}><Save size={14}/> {saving ? "Menyimpan..." : "Simpan konfigurasi market"}</button>
    </section>}
    {teamId && <>
      <div className="team-merch-metrics">
        <article><Users size={16}/><span>Total fans</span><strong>{totalFans.toLocaleString("id-ID")}</strong><small>Loyalty {avg("loyalty").toFixed(1)} · Engagement {avg("engagement").toFixed(1)}</small></article>
        <article><BarChart3 size={16}/><span>Team reputation</span><strong>{reputation.toLocaleString("id-ID")}</strong><small>Sentiment {avg("sentiment").toFixed(1)}</small></article>
        <article><Coins size={16}/><span>Net merchandise income</span><strong>{money(totals.net)}</strong><small>Gross {money(totals.gross)} · Cost {money(totals.cost)}</small></article>
        <article><Package size={16}/><span>Units sold</span><strong>{totals.units.toLocaleString("id-ID")}</strong><small>{runs.length} race sales runs</small></article>
      </div>
      <div className="team-merch-hq-line"><span>Marketing Department <strong>LV {facilityLevel("marketing_department")}</strong></span><span>Commercial Department <strong>LV {facilityLevel("commercial_department")}</strong></span></div>
      <div className="team-hq-section-title"><div><span className="section-eyebrow">PRODUCT CATALOG</span><h3>Official team merchandise</h3></div></div>
      <div className="team-merch-products">
        {products.map(product => {
          const draft = drafts[product.id] ?? { unit_price: String(product.unit_price), unit_cost: String(product.unit_cost), demand_share: String(product.demand_share * 100), capacity_per_round: String(product.capacity_per_round), is_active: product.is_active };
          return <article className="team-merch-product" key={product.id}>
            <div><strong>{product.product_name}</strong><small>Sold {Number(itemTotals[product.product_name] || 0).toLocaleString("id-ID")} units · Production {money(product.unit_cost)}</small></div>
            <label>Harga jual (€)<input type="number" min={Math.ceil(product.unit_cost * 1.1)} max="10000000" value={draft.unit_price} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, unit_price: e.target.value } }))} disabled={!isOwner && !isAdmin}/></label>
            {isAdmin && <div className="team-merch-admin-fields">
              <label>Biaya produksi<input type="number" min="0" value={draft.unit_cost} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, unit_cost: e.target.value } }))}/></label>
              <label>Demand share (%)<input type="number" min="0.01" max="100" step="0.01" value={draft.demand_share} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, demand_share: e.target.value } }))}/></label>
              <label>Kapasitas / race<input type="number" min="0" step="1" value={draft.capacity_per_round} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, capacity_per_round: e.target.value } }))}/></label>
            </div>}
            {(isOwner || isAdmin) && <label className="team-merch-toggle"><input type="checkbox" checked={draft.is_active} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, is_active: e.target.checked } }))}/> Produk aktif</label>}
            {(isOwner || isAdmin) && <button className="team-hq-save" disabled={saving} onClick={() => void saveProduct(product)}><Save size={13}/> Simpan produk</button>}
          </article>;
        })}
        {!products.length && <p className="team-hq-empty">Katalog merchandise belum tersedia untuk tim ini.</p>}
      </div>
      <div className="team-hq-section-title"><div><span className="section-eyebrow">SALES HISTORY</span><h3>Riwayat penjualan</h3></div><span className="empty-tag">LATEST 12 ROUNDS</span></div>
      <div className="team-merch-history">
        {runs.map(run => <article key={run.id}><div><strong>Round {run.round_id.slice(0, 8).toUpperCase()}</strong><small>{new Date(run.created_at).toLocaleString("id-ID")}</small></div><span>{run.units_sold.toLocaleString("id-ID")} units</span><strong>{money(run.net_revenue)}</strong></article>)}
        {!runs.length && <p className="team-hq-empty">Belum ada penjualan. Sistem mulai menghitung setelah hasil race resmi dipublikasikan.</p>}
      </div>
    </>}
    {!teamId && !isAdmin && <p className="team-hq-empty">Akun ini belum terhubung ke tim.</p>}
  </section>;
}
