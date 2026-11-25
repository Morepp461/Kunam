import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle, BadgePercent, Clock3, CreditCard, Factory, Flag, HardHat,
  Package, Plus, RefreshCw, Shirt, ShoppingBag, Sticker, TrendingUp,
  Users, Waves, X, MoveDiagonal2
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { calculatePriceDemandFactor, calculateUnitMargin } from "./lib/merchandisePricing";

type Product = {
  id: string; product_key: string; product_name: string; unit_price: number; unit_cost: number;
  demand_share: number; capacity_per_round: number; production_capacity_per_order: number;
  reference_price: number; price_elasticity: number; stock_quantity: number;
  catalog_enabled: boolean; is_active: boolean;
};
type Batch = {
  id: string; product_id: string; product_name: string; units_produced: number;
  units_remaining: number; unit_cost: number; total_cost: number; status: string;
  created_at: string; completes_at: string | null; completed_at: string | null;
};
type Run = { id: string; round_id: string; units_sold: number; gross_revenue: number; production_cost: number; net_revenue: number; created_at: string };
type SaleItem = { sales_run_id: string; product_id: string; units_sold: number; gross_revenue: number; production_cost: number };
type Review = { id: string; product_id: string; sentiment: "positive" | "neutral" | "negative"; rating: number; comment: string; created_at: string };
type Fan = { population: number; loyalty: number; engagement: number; sentiment: number };
type ProductDraft = { unit_price: string; quantity: string };
type ModalSize = { width: number; height: number };

const money = (value: number) => "€" + Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const productIcons: Record<string, typeof Shirt> = {
  t_shirt: Shirt, polo_shirt: Shirt, cap: HardHat, fan_card: CreditCard,
  jacket: ShoppingBag, sticker: Sticker, flag: Flag, scarf: Waves
};
const productDescriptions: Record<string, string> = {
  t_shirt: "Everyday team apparel",
  polo_shirt: "Premium casual teamwear",
  cap: "Team-branded headwear",
  fan_card: "Collectible supporter card",
  jacket: "Premium outerwear",
  sticker: "Small-format brand merchandise",
  flag: "Supporter display flag",
  scarf: "Supporter scarf"
};
const statusLabels: Record<string, string> = {
  idle: "Tidak Diproduksi", producing: "Sedang Diproduksi", marketed: "Dipasarkan", sold_out: "Habis"
};

export default function TeamMerchandise({ teamId, isOwner }: { teamId: string | null; isOwner: boolean; isAdmin?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [fans, setFans] = useState<Fan[]>([]);
  const [reputation, setReputation] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [modalSize, setModalSize] = useState<ModalSize>({ width: 760, height: 720 });
  const [clock, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resizeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !teamId) { setLoading(false); return; }
    setLoading(true); setError("");
    if (isOwner) {
      const { error: finalizeError } = await supabase.rpc("member_finalize_merchandise_production");
      if (finalizeError && !finalizeError.message.toLowerCase().includes("function")) setError(finalizeError.message);
    }
    const [productQ, batchQ, runQ, fanQ, repQ] = await Promise.all([
      supabase.from("caleris_merchandise_products").select("id,product_key,product_name,unit_price,unit_cost,demand_share,capacity_per_round,production_capacity_per_order,reference_price,price_elasticity,stock_quantity,catalog_enabled,is_active").eq("team_id", teamId).eq("catalog_enabled", true).order("product_key"),
      supabase.from("caleris_merchandise_production_batches").select("id,product_id,product_name,units_produced,units_remaining,unit_cost,total_cost,status,created_at,completes_at,completed_at").eq("team_id", teamId).order("created_at", { ascending: false }),
      supabase.from("caleris_merchandise_sales_runs").select("id,round_id,units_sold,gross_revenue,production_cost,net_revenue,created_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(30),
      supabase.from("caleris_fan_populations").select("population,loyalty,engagement,sentiment").eq("entity_kind", "team").eq("team_id", teamId),
      supabase.from("caleris_team_reputation").select("score").eq("team_id", teamId).maybeSingle()
    ]);
    const issue = [productQ.error, batchQ.error, runQ.error, fanQ.error, repQ.error].find(Boolean);
    if (issue) setError(issue.message);
    const nextProducts = (productQ.data ?? []) as Product[];
    const nextBatches = (batchQ.data ?? []) as Batch[];
    const nextRuns = (runQ.data ?? []) as Run[];
    setProducts(nextProducts); setBatches(nextBatches); setRuns(nextRuns);
    setFans((fanQ.data ?? []) as Fan[]); setReputation(Number(repQ.data?.score ?? 0));
    const runIds = nextRuns.map(run => run.id);
    if (runIds.length) {
      const [itemsQ, reviewsQ] = await Promise.all([
        supabase.from("caleris_merchandise_sales_items").select("sales_run_id,product_id,units_sold,gross_revenue,production_cost").in("sales_run_id", runIds),
        supabase.from("caleris_merchandise_reviews").select("id,product_id,sentiment,rating,comment,created_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(48)
      ]);
      if (itemsQ.error) setError(itemsQ.error.message);
      if (reviewsQ.error) setError(reviewsQ.error.message);
      setItems((itemsQ.data ?? []) as SaleItem[]); setReviews((reviewsQ.data ?? []) as Review[]);
    } else { setItems([]); setReviews([]); }
    setDrafts(current => Object.fromEntries(nextProducts.map(product => [product.id, current[product.id] ?? {
      unit_price: String(product.unit_price || product.reference_price || ""),
      quantity: "100"
    }])));
    setLoading(false);
  }, [teamId, isOwner]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const totalFans = fans.reduce((sum, fan) => sum + Number(fan.population || 0), 0);
  const fanQuality = fans.length ? fans.reduce((sum, fan) => sum + Number(fan.loyalty || 50) + Number(fan.engagement || 50) + Number(fan.sentiment || 50), 0) / (fans.length * 3) : 50;
  const selectedProduct = products.find(product => product.id === selected) ?? null;
  const salesByProduct = useMemo(() => {
    const result: Record<string, { sold: number; gross: number; cogs: number }> = {};
    for (const item of items) {
      const current = result[item.product_id] ?? { sold: 0, gross: 0, cogs: 0 };
      current.sold += Number(item.units_sold || 0);
      current.gross += Number(item.gross_revenue || 0);
      current.cogs += Number(item.production_cost || 0);
      result[item.product_id] = current;
    }
    return result;
  }, [items]);
  const batchByProduct = useMemo(() => {
    const result: Record<string, Batch[]> = {};
    for (const batch of batches) (result[batch.product_id] ??= []).push(batch);
    return result;
  }, [batches]);
  const statusFor = (product: Product) => {
    const productBatches = batchByProduct[product.id] ?? [];
    if (productBatches.some(batch => batch.status === "producing" && batch.completes_at && new Date(batch.completes_at).getTime() > clock)) return "producing";
    if (Number(product.stock_quantity) > 0) return "marketed";
    if (productBatches.length || (salesByProduct[product.id]?.sold ?? 0) > 0) return "sold_out";
    return "idle";
  };
  const activeBatch = (product: Product) => (batchByProduct[product.id] ?? []).find(batch => batch.status === "producing" && batch.completes_at && new Date(batch.completes_at).getTime() > clock);
  const productReport = (product: Product) => {
    const productBatches = batchByProduct[product.id] ?? [];
    const sales = salesByProduct[product.id] ?? { sold: 0, gross: 0, cogs: 0 };
    const produced = productBatches.reduce((sum, batch) => sum + Number(batch.units_produced), 0);
    const productionCost = productBatches.reduce((sum, batch) => sum + Number(batch.total_cost), 0);
    return { produced, remaining: Number(product.stock_quantity || 0), sold: sales.sold, gross: sales.gross, cogs: sales.cogs, productionCost, grossProfit: sales.gross - sales.cogs, netProfit: sales.gross - productionCost };
  };
  const selectedDraft = selectedProduct ? drafts[selectedProduct.id] ?? { unit_price: "", quantity: "100" } : null;
  const priceFactor = selectedProduct && selectedDraft ? calculatePriceDemandFactor(selectedProduct.reference_price, Number(selectedDraft.unit_price), selectedProduct.price_elasticity) : 0;
  const unitMargin = selectedProduct && selectedDraft ? calculateUnitMargin(Number(selectedDraft.unit_price), selectedProduct.unit_cost) : 0;
  const productionTotal = selectedProduct && selectedDraft ? Number(selectedDraft.quantity || 0) * selectedProduct.unit_cost : 0;
  const selectedStatus = selectedProduct ? statusFor(selectedProduct) : "idle";
  const selectedReport = selectedProduct ? productReport(selectedProduct) : null;
  const selectedReviews = selectedProduct ? reviews.filter(review => review.product_id === selectedProduct.id).slice(0, 6) : [];

  const updateDraft = (productId: string, patch: Partial<ProductDraft>) => setDrafts(current => ({
    ...current, [productId]: { ...(current[productId] ?? { unit_price: "", quantity: "100" }), ...patch }
  }));
  const produce = async (product: Product) => {
    if (!supabase || !isOwner) return;
    const draft = drafts[product.id] ?? { unit_price: "", quantity: "100" };
    const price = Number(draft.unit_price), quantity = Number(draft.quantity);
    if (!Number.isFinite(price) || price <= 0) { setError("Tentukan harga jual yang valid terlebih dahulu."); return; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.production_capacity_per_order) {
      setError("Jumlah produksi harus 1 sampai " + product.production_capacity_per_order.toLocaleString("id-ID") + " unit per batch."); return;
    }
    setSaving(true); setError(""); setNotice("");
    const { error: priceError } = await supabase.rpc("member_update_merchandise_product", {
      p_product_id: product.id, p_unit_price: price, p_is_active: true
    });
    if (priceError) { setSaving(false); setError(priceError.message); return; }
    const { data, error: produceError } = await supabase.rpc("member_produce_merchandise", {
      p_product_id: product.id, p_quantity: quantity, p_idempotency_key: crypto.randomUUID()
    });
    setSaving(false);
    if (produceError) { setError(produceError.message); return; }
    setNotice("Produksi " + product.product_name + " dimulai. Estimasi selesai " + new Date(data.completes_at).toLocaleString("id-ID") + ".");
    await refresh();
  };
  const openProduct = (product: Product) => { setSelected(product.id); setError(""); setNotice(""); };
  const closeModal = () => { if (!saving) { setSelected(null); setError(""); } };
  const resizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { x: event.clientX, y: event.clientY, width: modalSize.width, height: modalSize.height };
  };
  const resizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeRef.current) return;
    const start = resizeRef.current;
    const maxWidth = Math.max(320, window.innerWidth - 36);
    const maxHeight = Math.max(360, window.innerHeight - 48);
    setModalSize({
      width: Math.max(320, Math.min(maxWidth, start.width + start.x - event.clientX)),
      height: Math.max(360, Math.min(maxHeight, start.height + event.clientY - start.y))
    });
  };
  const resizeEnd = () => { resizeRef.current = null; };

  if (!teamId || !isOwner) return null;
  if (loading) return <section className="team-merchandise-shell"><p>Loading official merchandise...</p></section>;

  return <section className="team-merchandise-shell">
    <header className="team-merch-store-heading">
      <div><span className="section-eyebrow">BRAND ECONOMY · OFFICIAL STORE</span><h2>Team Merchandise</h2><p>Manufacture carefully. Price strategically. Unsold inventory ties up your capital.</p></div>
      <button className="team-hq-refresh" onClick={() => void refresh()} aria-label="Refresh merchandise"><RefreshCw size={15}/></button>
    </header>
    {error && <p className="team-hq-error" role="alert">{error}</p>}
    {notice && <p className="team-hq-notice" role="status">{notice}</p>}
    <div className="team-merch-market-strip">
      <span><Users size={15}/> Fanbase <strong>{totalFans.toLocaleString("id-ID")}</strong></span>
      <span><TrendingUp size={15}/> Reputation <strong>{reputation.toLocaleString("id-ID")}</strong></span>
      <span><BadgePercent size={15}/> Fan sentiment <strong>{Math.round(fanQuality)}%</strong></span>
    </div>
    <div className="team-merch-store-grid">
      {products.map(product => {
        const Icon = productIcons[product.product_key] ?? Package;
        const status = statusFor(product);
        const batch = activeBatch(product);
        return <button type="button" className="team-merch-store-card" key={product.id} onClick={() => openProduct(product)}>
          <span className="team-merch-store-icon"><Icon size={27}/></span>
          <strong>{product.product_name}</strong>
          <span className={"team-merch-store-status is-" + status}>{statusLabels[status]}</span>
          {status === "producing" && batch?.completes_at && <small><Clock3 size={12}/> {Math.max(0, Math.ceil((new Date(batch.completes_at).getTime() - clock) / 60000))} min left</small>}
          {status === "idle" && <span className="team-merch-card-action">Produce this item <Plus size={13}/></span>}
          {status === "marketed" && <span className="team-merch-card-action">View catalog <ShoppingBag size={13}/></span>}
          {status === "sold_out" && <span className="team-merch-card-action">Sales report <TrendingUp size={13}/></span>}
        </button>;
      })}
    </div>

    {selectedProduct && selectedDraft && selectedReport && <div className="team-merch-modal-backdrop" role="presentation" onClick={closeModal}>
      <section className="team-merch-modal" role="dialog" aria-modal="true" aria-labelledby="team-merch-modal-title"
        style={{ width: "min(" + modalSize.width + "px, calc(100vw - 24px))", height: "min(" + modalSize.height + "px, calc(100dvh - 24px))" }}
        onClick={event => event.stopPropagation()}>
        <button className="team-merch-resize-handle" aria-label="Resize merchandise window" title="Drag to resize"
          onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd}><MoveDiagonal2 size={15}/></button>
        <header className="team-merch-modal-header">
          <div><span className="section-eyebrow">OFFICIAL TEAM STORE</span><h2 id="team-merch-modal-title">{selectedProduct.product_name}</h2><p>{productDescriptions[selectedProduct.product_key] ?? "Official team merchandise"}</p></div>
          <button className="team-merch-modal-close" onClick={closeModal} aria-label="Close"><X size={19}/></button>
        </header>
        <div className="team-merch-modal-body">
          <div className="team-merch-modal-status"><span className={"team-merch-store-status is-" + selectedStatus}>{statusLabels[selectedStatus]}</span><span>Reference price: {money(selectedProduct.reference_price)}</span></div>
          {selectedStatus === "idle" && <>
            <div className="team-merch-modal-intro"><Factory size={19}/><p>Choose a selling price and production quantity. Production cost is charged immediately; stock becomes available after the production timer ends.</p></div>
            <div className="team-merch-form-grid">
              <label>Selling price (€)<input type="number" min="0.01" step="0.01" value={selectedDraft.unit_price} onChange={event => updateDraft(selectedProduct.id, { unit_price: event.target.value })}/></label>
              <label>Production quantity<input type="number" min="1" max={selectedProduct.production_capacity_per_order} step="1" value={selectedDraft.quantity} onChange={event => updateDraft(selectedProduct.id, { quantity: event.target.value })}/></label>
            </div>
            <div className="team-merch-risk-grid">
              <article><span>Unit production cost</span><strong>{money(selectedProduct.unit_cost)}</strong></article>
              <article><span>Total production cost</span><strong>{money(productionTotal)}</strong></article>
              <article><span>Unit margin</span><strong className={unitMargin < 0 ? "is-loss" : ""}>{money(unitMargin)}</strong></article>
              <article><span>Price demand factor</span><strong>{priceFactor.toFixed(2)}×</strong></article>
            </div>
            {unitMargin < 0 && <p className="team-merch-risk-note"><AlertTriangle size={15}/> Selling below production cost creates a loss on every unit sold.</p>}
            {Number(selectedDraft.unit_price) > selectedProduct.reference_price * 1.5 && <p className="team-merch-risk-note"><AlertTriangle size={15}/> This price is far above the market reference and may sharply reduce demand.</p>}
            <p className="team-merch-muted">Potential demand is influenced by fanbase, general-public reach from reputation, fan sentiment, product appeal, HQ effects and price elasticity. No sales are guaranteed.</p>
            <button className="team-merch-primary" disabled={!isOwner || saving} onClick={() => void produce(selectedProduct)}>{saving ? "Starting production..." : "Confirm production"}</button>
          </>}
          {selectedStatus === "producing" && <>
            <div className="team-merch-production-progress"><Clock3 size={24}/><strong>Production in progress</strong><p>{activeBatch(selectedProduct)?.units_produced.toLocaleString("id-ID")} units are being manufactured.</p>
              {activeBatch(selectedProduct)?.completes_at && <time>{new Date(activeBatch(selectedProduct)!.completes_at!).toLocaleString("id-ID")}</time>}
              <small>Remaining: {activeBatch(selectedProduct)?.completes_at ? Math.max(0, Math.ceil((new Date(activeBatch(selectedProduct)!.completes_at!).getTime() - clock) / 60000)) + " minutes" : "—"}</small>
            </div>
            <div className="team-merch-risk-grid"><article><span>Production cost</span><strong>{money(activeBatch(selectedProduct)?.total_cost ?? 0)}</strong></article><article><span>Available stock</span><strong>{selectedReport.remaining.toLocaleString("id-ID")}</strong></article></div>
          </>}
          {(selectedStatus === "marketed" || selectedStatus === "sold_out") && <>
            <div className="team-merch-report-grid">
              <article><span>Total production cost</span><strong>{money(selectedReport.productionCost)}</strong></article>
              <article><span>Initial stock produced</span><strong>{selectedReport.produced.toLocaleString("id-ID")}</strong></article>
              <article><span>Remaining stock</span><strong>{selectedReport.remaining.toLocaleString("id-ID")}</strong></article>
              <article><span>Units sold</span><strong>{selectedReport.sold.toLocaleString("id-ID")}</strong></article>
              <article><span>Gross revenue</span><strong>{money(selectedReport.gross)}</strong></article>
              <article><span>Gross profit</span><strong>{money(selectedReport.grossProfit)}</strong></article>
              <article><span>Net profit / loss</span><strong className={selectedReport.netProfit < 0 ? "is-loss" : "is-profit"}>{money(selectedReport.netProfit)}</strong></article>
              <article><span>Current selling price</span><strong>{money(selectedProduct.unit_price)}</strong></article>
            </div>
            <div className="team-merch-review-section"><div className="team-merch-subheading"><div><span className="section-eyebrow">CUSTOMER VOICE</span><h3>Fan reviews</h3></div><small>Updated after each official race</small></div>
              {selectedReviews.length ? selectedReviews.map(review => <article className={"team-merch-review is-" + review.sentiment} key={review.id}>
                <span className="team-merch-review-stars" aria-label={review.rating + " out of 5 stars"}>{review.rating ? "★".repeat(review.rating) : "No stars"}<small>{review.sentiment}</small></span>
                <p>{review.comment}</p>
              </article>) : <p className="team-merch-muted">No customer reviews yet. Reviews appear after the next official race settlement.</p>}
            </div>
            <div className="team-merch-repeat-form">
              <div><strong>Produce another batch</strong><span>Current unit cost: {money(selectedProduct.unit_cost)}</span></div>
              <label>Selling price (€)<input type="number" min="0.01" step="0.01" value={selectedDraft.unit_price} onChange={event => updateDraft(selectedProduct.id, { unit_price: event.target.value })}/></label>
              <label>Quantity<input type="number" min="1" max={selectedProduct.production_capacity_per_order} value={selectedDraft.quantity} onChange={event => updateDraft(selectedProduct.id, { quantity: event.target.value })}/></label>
              <button className="team-merch-primary" disabled={!isOwner || saving} onClick={() => void produce(selectedProduct)}>{saving ? "Starting..." : "Produce again"}</button>
            </div>
          </>}
          {error && <p className="team-hq-error" role="alert">{error}</p>}
          {notice && <p className="team-hq-notice" role="status">{notice}</p>}
        </div>
      </section>
    </div>}
  </section>;
}
