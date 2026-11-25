import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Coins, Package, RefreshCw, Save, Users } from "lucide-react";
import { supabase } from "./lib/supabase";
import { calculatePriceDemandFactor, calculateUnitMargin } from "./lib/merchandisePricing";

type Product = {
  id: string; product_key: string; product_name: string; unit_price: number; unit_cost: number;
  demand_share: number; capacity_per_round: number; production_capacity_per_order: number;
  reference_price: number; price_elasticity: number; stock_quantity: number;
  catalog_enabled: boolean; is_active: boolean;
};
type CatalogItem = {
  product_key: string; product_name: string; unit_cost: number; reference_price: number;
  price_elasticity: number; demand_share: number; capacity_per_round: number;
  production_capacity_per_order: number; is_enabled: boolean;
};
type Run = { id: string; round_id: string; fan_population: number; reputation_score: number; conversion_rate: number; units_sold: number; gross_revenue: number; production_cost: number; net_revenue: number; created_at: string };
type Item = { sales_run_id: string; product_name: string; units_sold: number; gross_revenue: number; production_cost: number };
type Batch = { id: string; product_name: string; units_produced: number; units_remaining: number; unit_cost: number; total_cost: number; created_at: string };
type EngineConfig = { is_enabled: boolean; base_conversion_rate: number; max_conversion_rate: number; reputation_factor_min: number; reputation_factor_max: number; hq_demand_bonus_per_level: number; hq_capacity_bonus_per_level: number };
type FanSummary = { population: number; loyalty: number; engagement: number; sentiment: number };
type Facility = { facility_key: string; level: number; condition: number };

const money = (value: number) => "€" + Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const defaults: EngineConfig = { is_enabled: true, base_conversion_rate: 0.002, max_conversion_rate: 0.01, reputation_factor_min: 0.75, reputation_factor_max: 1.25, hq_demand_bonus_per_level: 2.5, hq_capacity_bonus_per_level: 3 };

export default function TeamMerchandise({ teamId, isOwner, isAdmin }: { teamId: string | null; isOwner: boolean; isAdmin: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
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
  const [drafts, setDrafts] = useState<Record<string, { unit_price: string; is_active: boolean }>>({});
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, {
    unit_cost: string; reference_price: string; price_elasticity: string; demand_share: string;
    capacity_per_round: string; production_capacity_per_order: string; is_enabled: boolean
  }>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) { setError("Koneksi Supabase tidak tersedia."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data: cfg, error: cfgError } = await supabase.from("caleris_merchandise_engine_config").select("*").eq("singleton", true).maybeSingle();
    if (cfgError) setError(cfgError.message);
    if (cfg) {
      const next: EngineConfig = {
        is_enabled: Boolean(cfg.is_enabled), base_conversion_rate: Number(cfg.base_conversion_rate),
        max_conversion_rate: Number(cfg.max_conversion_rate), reputation_factor_min: Number(cfg.reputation_factor_min),
        reputation_factor_max: Number(cfg.reputation_factor_max), hq_demand_bonus_per_level: Number(cfg.hq_demand_bonus_per_level),
        hq_capacity_bonus_per_level: Number(cfg.hq_capacity_bonus_per_level)
      };
      setConfig(next);
      setConfigDraft({
        is_enabled: next.is_enabled, base_conversion_rate: String(next.base_conversion_rate * 100),
        max_conversion_rate: String(next.max_conversion_rate * 100), reputation_factor_min: String(next.reputation_factor_min),
        reputation_factor_max: String(next.reputation_factor_max), hq_demand_bonus_per_level: String(next.hq_demand_bonus_per_level),
        hq_capacity_bonus_per_level: String(next.hq_capacity_bonus_per_level)
      });
    }

    if (isAdmin) {
      const { data, error: catalogError } = await supabase.from("caleris_merchandise_catalog").select("*").order("product_key");
      if (catalogError) setError(catalogError.message);
      const rows = (data ?? []) as CatalogItem[];
      setCatalog(rows);
      setCatalogDrafts(Object.fromEntries(rows.map(item => [item.product_key, {
        unit_cost: String(item.unit_cost), reference_price: String(item.reference_price),
        price_elasticity: String(item.price_elasticity), demand_share: String(Number(item.demand_share) * 100),
        capacity_per_round: String(item.capacity_per_round),
        production_capacity_per_order: String(item.production_capacity_per_order), is_enabled: Boolean(item.is_enabled)
      }])));
    }

    if (!teamId) {
      setProducts([]); setRuns([]); setItems([]); setBatches([]); setFans([]); setFacilities([]); setReputation(0);
      setDrafts({}); setQuantities({}); setLoading(false); return;
    }

    const [productQ, runQ, fanQ, repQ, facilityQ, batchQ] = await Promise.all([
      supabase.from("caleris_merchandise_products").select("*").eq("team_id", teamId).eq("catalog_enabled", true).order("product_key"),
      supabase.from("caleris_merchandise_sales_runs").select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(12),
      supabase.from("caleris_fan_populations").select("population,loyalty,engagement,sentiment").eq("entity_kind", "team").eq("team_id", teamId),
      supabase.from("caleris_team_reputation").select("score").eq("team_id", teamId).maybeSingle(),
      supabase.from("caleris_team_hq_facilities").select("facility_key,level,condition").eq("team_id", teamId),
      supabase.from("caleris_merchandise_production_batches").select("id,product_name,units_produced,units_remaining,unit_cost,total_cost,created_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(12)
    ]);
    const issue = [productQ.error, runQ.error, fanQ.error, repQ.error, facilityQ.error, batchQ.error].find(Boolean);
    if (issue) setError(issue.message);
    const productRows = (productQ.data ?? []) as Product[];
    setProducts(productRows); setRuns((runQ.data ?? []) as Run[]); setFans((fanQ.data ?? []) as FanSummary[]);
    setReputation(Number(repQ.data?.score ?? 0)); setFacilities((facilityQ.data ?? []) as Facility[]);
    setBatches((batchQ.data ?? []) as Batch[]);
    const runIds = (runQ.data ?? []).map((row: any) => row.id);
    if (runIds.length) {
      const { data: itemRows, error: itemError } = await supabase.from("caleris_merchandise_sales_items")
        .select("sales_run_id,product_name,units_sold,gross_revenue,production_cost").in("sales_run_id", runIds);
      if (itemError) setError(itemError.message);
      setItems((itemRows ?? []) as Item[]);
    } else setItems([]);
    setDrafts(Object.fromEntries(productRows.map(product => [product.id, {
      unit_price: String(product.unit_price), is_active: Boolean(product.is_active)
    }])));
    setQuantities(Object.fromEntries(productRows.map(product => [product.id, "1"])));
    setLoading(false);
  }, [teamId, isAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalFans = fans.reduce((sum, fan) => sum + Number(fan.population || 0), 0);
  const avg = (key: keyof FanSummary) => fans.length ? fans.reduce((sum, fan) => sum + Number(fan[key] || 0), 0) / fans.length : 0;
  const totals = useMemo(() => runs.reduce((sum, run) => ({
    gross: sum.gross + Number(run.gross_revenue || 0), cost: sum.cost + Number(run.production_cost || 0),
    net: sum.net + Number(run.net_revenue || 0), units: sum.units + Number(run.units_sold || 0)
  }), { gross: 0, cost: 0, net: 0, units: 0 }), [runs]);
  const itemTotals = useMemo(() => items.reduce((acc, item) => {
    acc[item.product_name] = (acc[item.product_name] || 0) + Number(item.units_sold || 0);
    return acc;
  }, {} as Record<string, number>), [items]);
  const facilityLevel = (key: string) => facilities.find(facility => facility.facility_key === key)?.level ?? 0;

  const saveEngineConfig = async () => {
    if (!supabase || !isAdmin) return;
    const base = Number(configDraft.base_conversion_rate) / 100, max = Number(configDraft.max_conversion_rate) / 100;
    const minRep = Number(configDraft.reputation_factor_min), maxRep = Number(configDraft.reputation_factor_max);
    const demand = Number(configDraft.hq_demand_bonus_per_level), capacity = Number(configDraft.hq_capacity_bonus_per_level);
    if (![base,max,minRep,maxRep,demand,capacity].every(Number.isFinite) || base < 0 || max < base || max > 2 || minRep < 0.5 || maxRep < minRep || maxRep > 2 || demand < 0 || demand > 20 || capacity < 0 || capacity > 20) {
      setError("Periksa batas conversion, reputation multiplier, dan bonus HQ."); return;
    }
    setSavingKey("engine"); setError(""); setNotice("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from("caleris_merchandise_engine_config").update({
      is_enabled: Boolean(configDraft.is_enabled), base_conversion_rate: base, max_conversion_rate: max,
      reputation_factor_min: minRep, reputation_factor_max: maxRep, hq_demand_bonus_per_level: demand,
      hq_capacity_bonus_per_level: capacity, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null
    }).eq("singleton", true);
    setSavingKey("");
    if (saveError) setError(saveError.message);
    else { setNotice("Konfigurasi market tersimpan."); await refresh(); }
  };

  const saveCatalog = async (item: CatalogItem) => {
    if (!supabase || !isAdmin) return;
    const draft = catalogDrafts[item.product_key];
    if (!draft) return;
    const cost = Number(draft.unit_cost), reference = Number(draft.reference_price);
    const elasticity = Number(draft.price_elasticity), share = Number(draft.demand_share) / 100;
    const salesCapacity = Number(draft.capacity_per_round), productionCapacity = Number(draft.production_capacity_per_order);
    if (![cost,reference,elasticity,share,salesCapacity,productionCapacity].every(Number.isFinite) ||
      cost <= 0 || reference <= 0 || elasticity < 0.1 || elasticity > 5 || share <= 0 || share > 1 ||
      !Number.isInteger(salesCapacity) || salesCapacity < 0 || !Number.isInteger(productionCapacity) || productionCapacity < 1) {
      setError("Biaya produksi, harga acuan, elastisitas, demand share, dan kapasitas belum valid."); return;
    }
    setSavingKey("catalog:" + item.product_key); setError(""); setNotice("");
    const { error: saveError } = await supabase.rpc("admin_update_merchandise_catalog_item", {
      p_product_key: item.product_key, p_unit_cost: cost, p_reference_price: reference,
      p_price_elasticity: elasticity, p_demand_share: share, p_capacity_per_round: salesCapacity,
      p_production_capacity_per_order: productionCapacity, p_is_enabled: draft.is_enabled
    });
    setSavingKey("");
    if (saveError) setError(saveError.message);
    else { setNotice(item.product_name + " catalog configuration saved."); await refresh(); }
  };

  const saveProduct = async (product: Product) => {
    if (!supabase || !isOwner) return;
    const draft = drafts[product.id];
    if (!draft) return;
    const price = Number(draft.unit_price);
    if (!Number.isFinite(price) || price <= 0) { setError("Harga jual harus lebih besar dari nol."); return; }
    setSavingKey("product:" + product.id); setError(""); setNotice("");
    const { error: saveError } = await supabase.rpc("member_update_merchandise_product", {
      p_product_id: product.id, p_unit_price: price, p_is_active: draft.is_active
    });
    setSavingKey("");
    if (saveError) setError(saveError.message);
    else { setNotice(product.product_name + " berhasil diperbarui."); await refresh(); }
  };

  const produce = async (product: Product) => {
    if (!supabase || !isOwner) return;
    const quantity = Number(quantities[product.id] ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1) { setError("Jumlah produksi harus berupa bilangan bulat positif."); return; }
    setSavingKey("produce:" + product.id); setError(""); setNotice("");
    const { data, error: produceError } = await supabase.rpc("member_produce_merchandise", {
      p_product_id: product.id, p_quantity: quantity
    });
    setSavingKey("");
    if (produceError) setError(produceError.message);
    else {
      setNotice("Produksi " + Number(data?.units_produced ?? quantity) + " " + product.product_name + " berhasil. Biaya " + money(Number(data?.total_cost ?? product.unit_cost * quantity)) + ". Stok " + Number(data?.stock_quantity ?? product.stock_quantity + quantity) + ".");
      await refresh();
    }
  };

  if (loading) return <section className="team-merchandise"><p>Memuat Merchandise Engine...</p></section>;
  return <section className="team-merchandise">
    <header className="team-merch-heading">
      <div><span className="section-eyebrow">BRAND ECONOMY · OFFICIAL STORE</span><h2>Merchandise Engine</h2><p>Official products, production inventory, and demand-driven race sales.</p></div>
      <button className="team-hq-refresh" onClick={() => void refresh()}><RefreshCw size={15}/> Refresh</button>
    </header>
    {error && <p className="team-hq-error">{error}</p>}{notice && <p className="team-hq-notice">{notice}</p>}

    {isAdmin && <>
      <section className="team-merch-admin">
        <div className="team-hq-section-title"><div><span className="section-eyebrow">ADMIN CONFIGURATION</span><h3>Merchandise market rules</h3></div><span className={config.is_enabled ? "team-hq-status" : "team-hq-status disabled"}>{config.is_enabled ? "ACTIVE" : "PAUSED"}</span></div>
        <label className="team-merch-toggle"><input type="checkbox" checked={Boolean(configDraft.is_enabled)} onChange={e => setConfigDraft(v => ({ ...v, is_enabled: e.target.checked }))}/> Aktifkan settlement setelah hasil race resmi dipublikasikan</label>
        <div className="team-merch-config-grid">
          <label>Base conversion (% per round)<input type="number" min="0" max="2" step="0.01" value={String(configDraft.base_conversion_rate)} onChange={e => setConfigDraft(v => ({ ...v, base_conversion_rate: e.target.value }))}/></label>
          <label>Maximum conversion (% per round)<input type="number" min="0" max="2" step="0.01" value={String(configDraft.max_conversion_rate)} onChange={e => setConfigDraft(v => ({ ...v, max_conversion_rate: e.target.value }))}/></label>
          <label>Minimum reputation multiplier<input type="number" min="0.5" max="2" step="0.05" value={String(configDraft.reputation_factor_min)} onChange={e => setConfigDraft(v => ({ ...v, reputation_factor_min: e.target.value }))}/></label>
          <label>Maximum reputation multiplier<input type="number" min="0.5" max="2" step="0.05" value={String(configDraft.reputation_factor_max)} onChange={e => setConfigDraft(v => ({ ...v, reputation_factor_max: e.target.value }))}/></label>
          <label>HQ demand bonus per level (%)<input type="number" min="0" max="20" step="0.5" value={String(configDraft.hq_demand_bonus_per_level)} onChange={e => setConfigDraft(v => ({ ...v, hq_demand_bonus_per_level: e.target.value }))}/></label>
          <label>HQ capacity bonus per level (%)<input type="number" min="0" max="20" step="0.5" value={String(configDraft.hq_capacity_bonus_per_level)} onChange={e => setConfigDraft(v => ({ ...v, hq_capacity_bonus_per_level: e.target.value }))}/></label>
        </div>
        <button className="team-hq-save" disabled={savingKey === "engine"} onClick={() => void saveEngineConfig()}><Save size={14}/> {savingKey === "engine" ? "Menyimpan..." : "Simpan market rules"}</button>
      </section>

      <section className="team-merch-admin">
        <div className="team-hq-section-title"><div><span className="section-eyebrow">GLOBAL PRODUCT CATALOG</span><h3>Production cost & demand settings</h3></div></div>
        <p className="team-merch-admin-note">Admin mengatur biaya produksi dan harga acuan. Team Owner tetap menentukan harga jualnya sendiri.</p>
        <div className="team-merch-catalog-grid">
          {catalog.map(item => {
            const draft = catalogDrafts[item.product_key] ?? {
              unit_cost: String(item.unit_cost), reference_price: String(item.reference_price), price_elasticity: String(item.price_elasticity),
              demand_share: String(item.demand_share * 100), capacity_per_round: String(item.capacity_per_round),
              production_capacity_per_order: String(item.production_capacity_per_order), is_enabled: item.is_enabled
            };
            return <article className="team-merch-catalog-item" key={item.product_key}>
              <div className="team-hq-section-title"><strong>{item.product_name}</strong><label className="team-merch-toggle"><input type="checkbox" checked={draft.is_enabled} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, is_enabled: e.target.checked } }))}/> Enabled</label></div>
              <div className="team-merch-catalog-fields">
                <label>Unit production cost (€)<input type="number" min="0.01" step="0.01" value={draft.unit_cost} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, unit_cost: e.target.value } }))}/></label>
                <label>Reference price (€)<input type="number" min="0.01" step="0.01" value={draft.reference_price} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, reference_price: e.target.value } }))}/></label>
                <label>Price elasticity<input type="number" min="0.1" max="5" step="0.1" value={draft.price_elasticity} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, price_elasticity: e.target.value } }))}/></label>
                <label>Demand share (%)<input type="number" min="0.01" max="100" step="0.01" value={draft.demand_share} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, demand_share: e.target.value } }))}/></label>
                <label>Sales capacity / race<input type="number" min="0" step="1" value={draft.capacity_per_round} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, capacity_per_round: e.target.value } }))}/></label>
                <label>Production capacity / batch<input type="number" min="1" step="1" value={draft.production_capacity_per_order} onChange={e => setCatalogDrafts(v => ({ ...v, [item.product_key]: { ...draft, production_capacity_per_order: e.target.value } }))}/></label>
              </div>
              <button className="team-hq-save" disabled={savingKey === "catalog:" + item.product_key} onClick={() => void saveCatalog(item)}><Save size={13}/> {savingKey === "catalog:" + item.product_key ? "Menyimpan..." : "Simpan catalog item"}</button>
            </article>;
          })}
        </div>
      </section>
    </>}

    {teamId && <>
      <div className="team-merch-metrics">
        <article><Users size={16}/><span>Total fans</span><strong>{totalFans.toLocaleString("id-ID")}</strong><small>Loyalty {avg("loyalty").toFixed(1)} · Engagement {avg("engagement").toFixed(1)}</small></article>
        <article><BarChart3 size={16}/><span>Team reputation</span><strong>{reputation.toLocaleString("id-ID")}</strong><small>Sentiment {avg("sentiment").toFixed(1)}</small></article>
        <article><Coins size={16}/><span>Net merchandise income</span><strong>{money(totals.net)}</strong><small>Gross {money(totals.gross)} · COGS {money(totals.cost)}</small></article>
        <article><Package size={16}/><span>Units sold</span><strong>{totals.units.toLocaleString("id-ID")}</strong><small>{runs.length} latest race sales runs</small></article>
      </div>
      <div className="team-merch-hq-line"><span>Marketing Department <strong>LV {facilityLevel("marketing_department")}</strong></span><span>Commercial Department <strong>LV {facilityLevel("commercial_department")}</strong></span></div>
      <div className="team-hq-section-title"><div><span className="section-eyebrow">PRODUCT CATALOG</span><h3>Official team merchandise</h3></div></div>
      <div className="team-merch-products">
        {products.map(product => {
          const draft = drafts[product.id] ?? { unit_price: String(product.unit_price), is_active: product.is_active };
          const price = Number(draft.unit_price);
          const margin = calculateUnitMargin(price, Number(product.unit_cost));
          const factor = calculatePriceDemandFactor(Number(product.reference_price), price, Number(product.price_elasticity));
          const configured = Number(product.unit_cost) > 0 && Number(product.reference_price) > 0;
          const quantity = Number(quantities[product.id] ?? 1);
          return <article className="team-merch-product" key={product.id}>
            <div className="team-merch-product-heading">
              <div><strong>{product.product_name}</strong><small>Stock {Number(product.stock_quantity).toLocaleString("id-ID")} · Sold {Number(itemTotals[product.product_name] || 0).toLocaleString("id-ID")} units</small></div>
              <span className={draft.is_active ? "team-hq-status" : "team-hq-status disabled"}>{draft.is_active ? "ACTIVE" : "INACTIVE"}</span>
            </div>
            <label>Selling price (€)<input type="number" min="0.01" step="0.01" value={draft.unit_price} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, unit_price: e.target.value } }))} disabled={!isOwner}/></label>
            <div className="team-merch-price-summary">
              <span>Unit cost <strong>{money(Number(product.unit_cost))}</strong></span>
              <span>Unit margin <strong className={margin < 0 ? "is-loss" : ""}>{money(margin)}</strong></span>
              <span>Demand factor <strong>{factor > 0 ? factor.toFixed(2) + "×" : "—"}</strong></span>
            </div>
            {margin < 0 && price > 0 && <p className="team-merch-warning">Harga di bawah biaya produksi: potensi rugi {money(Math.abs(margin))} per unit terjual.</p>}
            {!configured && <p className="team-merch-warning">Menunggu Admin mengatur biaya produksi dan harga acuan.</p>}
            {isOwner && <label className="team-merch-toggle"><input type="checkbox" checked={draft.is_active} disabled={!configured} onChange={e => setDrafts(v => ({ ...v, [product.id]: { ...draft, is_active: e.target.checked } }))}/> Tawarkan produk ini untuk dijual</label>}
            {isOwner && <button className="team-hq-save" disabled={savingKey === "product:" + product.id} onClick={() => void saveProduct(product)}><Save size={13}/> {savingKey === "product:" + product.id ? "Menyimpan..." : "Simpan pengaturan produk"}</button>}
            {isOwner && <div className="team-merch-production">
              <label>Jumlah produksi<input type="number" min="1" max={product.production_capacity_per_order} step="1" value={quantities[product.id] ?? "1"} onChange={e => setQuantities(v => ({ ...v, [product.id]: e.target.value }))}/></label>
              <div><span>Estimasi biaya produksi</span><strong>{money(Number(product.unit_cost) * (Number.isFinite(quantity) ? quantity : 0))}</strong></div>
              <small>Kapasitas batch: {Number(product.production_capacity_per_order).toLocaleString("id-ID")} unit sebelum bonus HQ.</small>
              <button className="team-hq-save" disabled={!configured || !draft.is_active || savingKey === "produce:" + product.id || !Number.isInteger(quantity) || quantity < 1} onClick={() => void produce(product)}>
                {savingKey === "produce:" + product.id ? "Memproduksi..." : "Produce stock"}
              </button>
            </div>}
          </article>;
        })}
        {!products.length && <p className="team-hq-empty">Belum ada produk aktif di katalog global.</p>}
      </div>

      <div className="team-hq-section-title"><div><span className="section-eyebrow">PRODUCTION HISTORY</span><h3>Manufacturing batches</h3></div><span className="empty-tag">LATEST 12</span></div>
      <div className="team-merch-history">
        {batches.map(batch => <article key={batch.id}><div><strong>{batch.product_name} · {Number(batch.units_produced).toLocaleString("id-ID")} produced</strong><small>{new Date(batch.created_at).toLocaleString("id-ID")} · {Number(batch.units_remaining).toLocaleString("id-ID")} units remaining</small></div><strong>{money(Number(batch.total_cost))}</strong></article>)}
        {!batches.length && <p className="team-hq-empty">Belum ada batch produksi.</p>}
      </div>

      <div className="team-hq-section-title"><div><span className="section-eyebrow">SALES HISTORY</span><h3>Race sales</h3></div><span className="empty-tag">LATEST 12</span></div>
      <div className="team-merch-history">
        {runs.map(run => <article key={run.id}><div><strong>Round {run.round_id.slice(0, 8).toUpperCase()}</strong><small>{new Date(run.created_at).toLocaleString("id-ID")} · {run.units_sold.toLocaleString("id-ID")} units</small></div><strong>{money(run.net_revenue)}</strong></article>)}
        {!runs.length && <p className="team-hq-empty">Belum ada penjualan. Sistem menghitung setelah hasil race resmi dipublikasikan.</p>}
      </div>
    </>}
    {!teamId && !isAdmin && <p className="team-hq-empty">Akun ini belum terhubung ke tim.</p>}
  </section>;
}
