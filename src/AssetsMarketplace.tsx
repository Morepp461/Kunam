import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, CarFront, Clock3, House, Plane, Ship, ShoppingBag, Tag, Watch } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "./lib/supabase";
import "./assets-marketplace.css";

type CatalogItem = {
  asset_code: string; category: string; tier: number; brand_name: string; asset_class: string;
  price_eur: number; market_value_eur: number;
};
type OwnedAsset = CatalogItem & {
  id: string; acquired_at: string; acquisition_price_eur: number; is_listed: boolean;
};
type Listing = CatalogItem & {
  listing_id: string; asset_id: string; asking_price_eur: number; seller_member_id: string;
  seller_name: string; seller_member_code: string; created_at: string; is_own_listing: boolean;
};
type Dashboard = {
  member_id: string; member_role: string; wallet_available: boolean; wallet_balance: number;
  asset_market_value_eur: number; asset_reputation_bonus: number;
  catalog: CatalogItem[]; owned: OwnedAsset[]; listings: Listing[];
};

const categories = [
  ["all", "Semua"], ["motorcycles", "Motorcycles"], ["cars", "Cars"], ["ships", "Ships"],
  ["aircraft_jets", "Aircraft & Jets"], ["houses", "Houses"], ["apartments", "Apartments"],
  ["hotels", "Hotels"], ["wristwatches", "Wristwatches"],
] as const;
const categoryIcon: Record<string, any> = {
  motorcycles: CarFront, cars: CarFront, ships: Ship, aircraft_jets: Plane,
  houses: House, apartments: House, hotels: House, wristwatches: Watch,
};
const money = (value: number) => "€ " + Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const dateLabel = (value: string) => new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function AssetsMarketplace() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [listingPrices, setListingPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) { setError("Supabase belum terhubung."); setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data: result, error: loadError } = await supabase.rpc("caleris_assets_get_dashboard");
    if (loadError) setError(loadError.message);
    else setData(result as Dashboard);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleCatalog = useMemo(
    () => (data?.catalog ?? []).filter(item => category === "all" || item.category === category),
    [data, category],
  );

  const buy = async (item: CatalogItem) => {
    if (!supabase || busy) return;
    if (!data?.wallet_available) { setError("Wallet pribadi belum tersedia untuk akun ini."); return; }
    if (!window.confirm("Beli " + item.brand_name + " " + item.asset_class + " seharga " + money(item.price_eur) + "?")) return;
    setBusy(item.asset_code); setError(""); setNotice("");
    const { data: result, error: purchaseError } = await supabase.rpc("caleris_assets_buy", {
      p_asset_code: item.asset_code, p_idempotency_key: crypto.randomUUID(),
    });
    setBusy("");
    if (purchaseError) { setError(purchaseError.message); return; }
    setNotice(result?.status === "duplicate" ? "Pembelian ini sudah tercatat sebelumnya." : item.brand_name + " berhasil ditambahkan ke garasi asetmu.");
    await load();
  };

  const listAsset = async (asset: OwnedAsset) => {
    if (!supabase || busy) return;
    const asking = Number(listingPrices[asset.id]);
    if (!Number.isFinite(asking) || asking <= 0 || Math.round(asking * 100) !== asking * 100) {
      setError("Harga listing harus lebih dari €0 dan maksimal dua angka desimal."); return;
    }
    setBusy(asset.id); setError(""); setNotice("");
    const { error: listingError } = await supabase.rpc("caleris_assets_list", {
      p_asset_id: asset.id, p_asking_price_eur: asking,
    });
    setBusy("");
    if (listingError) { setError(listingError.message); return; }
    setNotice("Aset berhasil dipasang di marketplace.");
    await load();
  };

  const cancelListing = async (listing: Listing) => {
    if (!supabase || busy) return;
    setBusy(listing.listing_id); setError(""); setNotice("");
    const { error: cancelError } = await supabase.rpc("caleris_assets_cancel_listing", { p_listing_id: listing.listing_id });
    setBusy("");
    if (cancelError) { setError(cancelError.message); return; }
    setNotice("Listing berhasil ditarik.");
    await load();
  };

  const buyListing = async (listing: Listing) => {
    if (!supabase || busy) return;
    if (!data?.wallet_available) { setError("Wallet pribadi belum tersedia untuk akun ini."); return; }
    if (!window.confirm("Beli " + listing.brand_name + " " + listing.asset_class + " dari " + listing.seller_name + " seharga " + money(listing.asking_price_eur) + "?")) return;
    setBusy(listing.listing_id); setError(""); setNotice("");
    const { data: result, error: purchaseError } = await supabase.rpc("caleris_assets_buy_listing", {
      p_listing_id: listing.listing_id, p_idempotency_key: crypto.randomUUID(),
    });
    setBusy("");
    if (purchaseError) { setError(purchaseError.message); return; }
    setNotice(result?.status === "duplicate" ? "Transaksi ini sudah tercatat." : "Pembelian berhasil. Kepemilikan aset telah berpindah.");
    await load();
  };

  return <main className="workspace assets-marketplace-page">
    <Link className="back-link" to="/dashboard"><ArrowLeft size={16} /> Dashboard</Link>
    <header className="assets-marketplace-header">
      <div><span className="section-eyebrow">CALERIS PRIVATE COLLECTION</span><h1 className="page-title">Assets Marketplace</h1>
        <p className="page-description">Koleksi pribadi member. Beli menggunakan saldo EUR, simpan sebagai aset, atau pasang listing untuk member lain.</p></div>
      <div className="assets-header-mark"><ShoppingBag size={25} /><span>INDIVIDUAL OWNERSHIP</span></div>
    </header>

    {error && <p className="assets-message is-error" role="alert">{error}</p>}
    {notice && <p className="assets-message is-success" role="status">{notice}</p>}

    {loading ? <section className="workspace-card assets-loading">Memuat Assets Marketplace...</section> : data && <>
      <section className="assets-overview">
        <article><span>Personal Wallet</span><strong>{data.wallet_available ? money(data.wallet_balance) : "Unavailable"}</strong><small>Saldo EUR milik member</small></article>
        <article><span>Owned Asset Value</span><strong>{money(data.asset_market_value_eur)}</strong><small>Nilai pasar aset yang masih dimiliki</small></article>
        {data.member_role === "Driver" && <article><span>Asset Reputation Bonus</span><strong>+{data.asset_reputation_bonus}</strong><small>Kontribusi pada Driver Reputation</small></article>}
      </section>

      {!data.wallet_available && <p className="assets-message">Akun ini belum memiliki wallet pribadi yang terhubung. Katalog tetap bisa dilihat, tetapi transaksi belum tersedia.</p>}

      <section className="workspace-card assets-catalog-section">
        <div className="assets-section-heading"><div><span className="section-eyebrow">COLLECTION CATALOG</span><h2>Browse Assets</h2></div><span className="assets-count">{data.catalog.length} tiers</span></div>
        <nav className="assets-category-filter" aria-label="Filter kategori aset">
          {categories.map(([key, label]) => <button type="button" key={key} className={category === key ? "active" : ""} onClick={() => setCategory(key)}>{label}</button>)}
        </nav>
        <div className="assets-product-grid">
          {visibleCatalog.map(item => {
            const Icon = categoryIcon[item.category] ?? Tag;
            return <article className="assets-product-card" key={item.asset_code}>
              <div className="assets-product-art"><span>TIER {item.tier}</span><Icon size={31} strokeWidth={1.35} /></div>
              <div className="assets-product-copy"><span className="assets-product-category">{item.category.replace("_", " ")}</span>
                <h3>{item.brand_name}</h3><p>{item.asset_class}</p>
                <strong>{money(item.price_eur)}</strong>
                <small>Initial market value · {money(item.market_value_eur)}</small>
              </div>
              <button type="button" disabled={!data.wallet_available || busy === item.asset_code} onClick={() => void buy(item)}>
                {busy === item.asset_code ? "Processing..." : "Buy Asset"}
              </button>
            </article>;
          })}
        </div>
      </section>

      <section className="workspace-card assets-owned-section">
        <div className="assets-section-heading"><div><span className="section-eyebrow">YOUR COLLECTION</span><h2>Owned Assets</h2></div><span className="assets-count">{data.owned.length} owned</span></div>
        <div className="assets-owned-list">
          {data.owned.map(asset => <article className="assets-owned-row" key={asset.id}>
            <div><span className="assets-product-category">{asset.category.replace("_", " ")} · Tier {asset.tier}</span><strong>{asset.brand_name} {asset.asset_class}</strong>
              <small>Acquired {dateLabel(asset.acquired_at)} · Market value {money(asset.market_value_eur)}</small></div>
            {asset.is_listed ? <span className="assets-listing-state"><Clock3 size={14} /> Listed</span> : <div className="assets-listing-form">
              <input aria-label={"Asking price for " + asset.brand_name} type="number" min="0.01" step="0.01" placeholder="Asking price (€)" value={listingPrices[asset.id] ?? ""} onChange={event => setListingPrices(prev => ({ ...prev, [asset.id]: event.target.value }))} />
              <button type="button" disabled={busy === asset.id} onClick={() => void listAsset(asset)}>List Asset</button>
            </div>}
          </article>)}
          {!data.owned.length && <p className="assets-empty">Belum ada aset. Mulai koleksi dari katalog di atas.</p>}
        </div>
      </section>

      <section className="workspace-card assets-market-section">
        <div className="assets-section-heading"><div><span className="section-eyebrow">MEMBER-TO-MEMBER MARKET</span><h2>Marketplace Listings</h2></div><span className="assets-count">{data.listings.length} listings</span></div>
        <div className="assets-owned-list">
          {data.listings.map(listing => <article className="assets-owned-row" key={listing.listing_id}>
            <div><span className="assets-product-category">{listing.category.replace("_", " ")} · Tier {listing.tier}</span><strong>{listing.brand_name} {listing.asset_class}</strong>
              <small>Seller: {listing.seller_name} · Market value {money(listing.market_value_eur)} · Listed {dateLabel(listing.created_at)}</small></div>
            <div className="assets-listing-action"><strong>{money(listing.asking_price_eur)}</strong>
              {listing.is_own_listing ? <button type="button" className="secondary" disabled={busy === listing.listing_id} onClick={() => void cancelListing(listing)}>Cancel Listing</button>
                : <button type="button" disabled={!data.wallet_available || busy === listing.listing_id} onClick={() => void buyListing(listing)}>Buy from Member</button>}
            </div>
          </article>)}
          {!data.listings.length && <p className="assets-empty">Belum ada listing dari member lain.</p>}
        </div>
      </section>

      <footer className="assets-marketplace-footnote"><BadgeCheck size={15} /> No individual asset tax. Listing prices do not change the asset's authoritative market value or reputation calculation.</footer>
    </>}
  </main>;
}
