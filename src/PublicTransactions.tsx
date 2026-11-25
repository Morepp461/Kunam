import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ArrowUpRight, BadgeCheck, ChevronLeft, ChevronRight, Clock3, Coins, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";

type Transaction = {
  id: string;
  event_type: string;
  amount: number;
  description: string;
  created_at: string;
  source_name: string;
  destination_name: string;
  is_reversed: boolean;
  reversal_of: string | null;
  total_count: number;
};

const labels: Record<string,string> = {
  checkin_reward: "Check-in Reward",
  prize: "Competition Prize",
  bank_reward: "Bank Reward",
  sponsor_payout: "Sponsor Payout",
  bank_funding: "Bank Funding",
  tax: "Tax",
  fine: "Penalty",
  transfer: "Wallet Transfer",
  admin_adjustment: "Admin Adjustment",
  reversal: "Transaction Reversal"
};
const money = (value:number) => "€ " + Number(value || 0).toLocaleString("id-ID",{maximumFractionDigits:2});
const date = (value:string) => new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

export default function PublicTransactions() {
  const [rows,setRows] = useState<Transaction[]>([]);
  const [filter,setFilter] = useState("all");
  const [page,setPage] = useState(0);
  const [total,setTotal] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const pageSize = 25;

  const refresh = useCallback(async () => {
    if (!supabase) { setError("Koneksi database belum tersedia."); setLoading(false); return; }
    setLoading(true);
    const query = supabase.from("public_economy_transaction_feed").select("*",{count:"exact"});
    const filtered = filter==="all" ? query : query.eq("event_type",filter);
    const {data,error:requestError,count} = await filtered.order("created_at",{ascending:false}).order("id",{ascending:false}).range(page*pageSize,page*pageSize+pageSize-1);
    if(requestError) { setError(requestError.message); setRows([]); setTotal(0); }
    else {
      const result = (data||[]) as Transaction[];
      setRows(result);
      setTotal(Number(count||0));
      setError(null);
    }
    setLoading(false);
  },[filter,page]);
  useEffect(()=>{void refresh()},[refresh]);

  const pageCount = Math.max(1,Math.ceil(total/pageSize));
  const totals = useMemo(()=>({
    visible:rows.length,
    reversed:rows.filter(row=>row.is_reversed||row.event_type==="reversal").length
  }),[rows]);

  return <section className="workspace public-transactions-workspace">
    <header className="public-transactions-heading">
      <div><span className="section-eyebrow">CALERIS MASTERS · FINANCIAL TRANSPARENCY</span><h1 className="page-title">Transaction History</h1><p className="page-description">Pusat informasi sistem ekonomi dan catatan transaksi resmi CALERIS MASTERS.</p></div>
      <button type="button" className="public-transactions-refresh" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
    </header>

    <div className="public-transactions-info-grid">
      <article><span className="public-transactions-info-icon"><Coins size={18}/></span><div><strong>Ledger Resmi</strong><p>Setiap transaksi berasal dari pencatatan wallet resmi dan memiliki nominal dalam Euro (€).</p></div></article>
      <article><span className="public-transactions-info-icon"><ShieldCheck size={18}/></span><div><strong>Catatan Terverifikasi</strong><p>Transaksi pembatalan dan koreksi ditampilkan sebagai bagian dari riwayat, bukan dihapus diam-diam.</p></div></article>
      <article><span className="public-transactions-info-icon"><Clock3 size={18}/></span><div><strong>Riwayat Terbaru</strong><p>Daftar diperbarui langsung dari database saat halaman dibuka atau tombol refresh digunakan.</p></div></article>
    </div>

    <section className="public-transactions-panel">
      <div className="public-transactions-panel-head">
        <div><span className="section-eyebrow">PUBLIC LEDGER</span><h2>Daftar Transaksi</h2><p>{total.toLocaleString("id-ID")} transaksi tercatat · {totals.reversed} koreksi/pembatalan pada halaman ini</p></div>
        <label className="public-transactions-filter">Jenis transaksi
          <select value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}>
            <option value="all">Semua transaksi</option>
            {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>

      {error&&<div className="public-transactions-error"><BadgeCheck size={16}/><span>Data transaksi belum dapat dimuat: {error}</span></div>}
      {loading?<div className="public-transactions-empty"><RefreshCw className="public-transactions-spin" size={20}/>Memuat ledger transaksi...</div>
      :!rows.length?<div className="public-transactions-empty"><ArrowLeftRight size={25}/><strong>Belum ada transaksi untuk ditampilkan</strong><span>Transaksi resmi akan muncul di sini setelah tercatat pada ledger CALERIS MASTERS.</span></div>
      :<div className="public-transactions-table-wrap"><table className="public-transactions-table">
        <thead><tr><th>Waktu</th><th>Jenis</th><th>Dari</th><th>Ke</th><th>Deskripsi</th><th className="amount">Nominal</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}>
          <td data-label="Waktu">{date(row.created_at)}</td>
          <td data-label="Jenis"><span className="public-transactions-type">{labels[row.event_type]||row.event_type}</span></td>
          <td data-label="Dari">{row.source_name}</td>
          <td data-label="Ke">{row.destination_name}</td>
          <td data-label="Deskripsi">{row.description}</td>
          <td data-label="Nominal" className="amount">{money(row.amount)}</td>
          <td data-label="Status"><span className={"public-transactions-status"+(row.is_reversed||row.event_type==="reversal"?" reversed":"")}>{row.is_reversed?"Dikoreksi":row.event_type==="reversal"?"Pembatalan":"Tercatat"}</span></td>
        </tr>)}</tbody>
      </table></div>}

      <footer className="public-transactions-pagination"><span>Menampilkan {total?Math.min(page*pageSize+1,total):0}–{Math.min((page+1)*pageSize,total)} dari {total}</span><div><button type="button" onClick={()=>setPage(value=>Math.max(0,value-1))} disabled={page===0||loading} aria-label="Halaman sebelumnya"><ChevronLeft size={16}/></button><strong>{page+1} / {pageCount}</strong><button type="button" onClick={()=>setPage(value=>Math.min(pageCount-1,value+1))} disabled={page>=pageCount-1||loading} aria-label="Halaman berikutnya"><ChevronRight size={16}/></button></div></footer>
    </section>
    <p className="public-transactions-footnote"><ArrowUpRight size={14}/> Informasi yang ditampilkan mencakup jenis transaksi, pihak pengirim/penerima, deskripsi, waktu, nominal, dan status koreksi. Data internal wallet, metadata sistem, serta identitas pembuat transaksi tidak dipublikasikan.</p>
  </section>;
}
