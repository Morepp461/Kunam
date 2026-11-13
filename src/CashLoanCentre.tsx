import {useCallback,useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {Banknote,CalendarClock,CheckCircle2,Clock3,Info,ShieldCheck} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./cash-loan.css";

type Rate={tenor_seasons:number;total_interest_rate:number};
type Preview={member_id:string;team_id?:string;season_id:string;season_title:string;wallet_id:string;season_income:number;max_loan:number;has_open_loan:boolean;race_period_count:number;interest_rates:Rate[]};
type Loan={id:string;principal:number;tenor_seasons:number;total_interest_rate:number;interest_amount:number;total_due:number;amount_repaid:number;status:string;created_at:string;paid_at:string|null};
type Installment={id:string;loan_id:string;season_id:string;period_id:string;due_amount:number;status:string;attempted_at:string;paid_at:string|null};
const money=(v:number)=>"¢p "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
const date=(v:string)=>new Intl.DateTimeFormat("id-ID",{dateStyle:"medium"}).format(new Date(v));
export default function CashLoanCentre({session}:{session:Session}){
 const [preview,setPreview]=useState<Preview|null>(null),[loans,setLoans]=useState<Loan[]>([]),[installments,setInstallments]=useState<Installment[]>([]),[loanMode,setLoanMode]=useState<"personal"|"team">("personal");
 const [amount,setAmount]=useState(""),[tenor,setTenor]=useState("1"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const selectedRate=preview?.interest_rates.find(r=>r.tenor_seasons===Number(tenor));
 const principal=Number(amount)||0;
 const interest=selectedRate?Math.round(principal*selectedRate.total_interest_rate)/100:0;
 const total=principal+interest;
 const estimatedInstallments=(preview?.race_period_count||0)*Number(tenor);
 const refresh=useCallback(async()=>{
  if(!supabase){setLoading(false);setNotice({kind:"error",text:"Koneksi Supabase belum tersedia."});return}
  setLoading(true);
  const p=await supabase.functions.invoke("economy-workflows",{body:{action:loanMode==="team"?"team_cash_loan_preview":"cash_loan_preview"}});
  const previewResult=p.data?.result as Preview|undefined;
  let loanQuery=supabase.from("economy_cash_loans").select("id,principal,tenor_seasons,total_interest_rate,interest_amount,total_due,amount_repaid,status,created_at,paid_at").eq("loan_type",loanMode).order("created_at",{ascending:false});
  if(loanMode==="team"){
   if(previewResult?.team_id)loanQuery=loanQuery.eq("team_id",previewResult.team_id);
   else loanQuery=loanQuery.eq("team_id","00000000-0000-0000-0000-000000000000");
  }else loanQuery=loanQuery.eq("profile_user_id",session.user.id);
  const l=await loanQuery;
  if(p.error||p.data?.error){setNotice({kind:"error",text:p.data?.error||p.error?.message||"Gagal memuat perhitungan pinjaman."});setPreview(null)}
  else setPreview(p.data?.result as Preview);
  if(l.error)setNotice({kind:"error",text:l.error.message});
  const rows=(l.data||[]) as Loan[];setLoans(rows);
  if(rows.length){const ids=rows.map(x=>x.id);const {data,error}=await supabase.from("economy_cash_loan_installments").select("id,loan_id,season_id,period_id,due_amount,status,attempted_at,paid_at").in("loan_id",ids).order("attempted_at",{ascending:false});if(error)setNotice({kind:"error",text:error.message});setInstallments((data||[]) as Installment[])}else setInstallments([]);
  setLoading(false);
 },[session.user.id,loanMode]);
 useEffect(()=>{void refresh()},[refresh]);
 const activeLoan=loans.find(l=>l.status==="active"||l.status==="overdue");
 const canApply=Boolean(preview&&preview.max_loan>0&&!preview.has_open_loan&&principal>0&&principal<=preview.max_loan&&selectedRate&&estimatedInstallments>0);
 const installmentSummary=useMemo(()=>installments.reduce((a,x)=>({paid:a.paid+(x.status==="paid"?1:0),overdue:a.overdue+(x.status==="overdue"?1:0)}),{paid:0,overdue:0}),[installments]);
 const submit=async(e:FormEvent)=>{e.preventDefault();if(!supabase||!canApply)return;
  if(!Number.isFinite(principal)||principal<=0||Math.round(principal*100)!==principal*100){setNotice({kind:"error",text:"Nominal harus positif dan maksimal dua angka desimal."});return}
  setSaving(true);setNotice(null);
  const {data,error}=await supabase.functions.invoke("economy-workflows",{body:{action:loanMode==="team"?"apply_team_cash_loan":"apply_cash_loan",amount:principal,tenorSeasons:Number(tenor)}});
  setSaving(false);
  if(error||data?.error){setNotice({kind:"error",text:data?.error||error?.message||"Pengajuan pinjaman gagal."});return}
  setNotice({kind:"success",text:loanMode==="team"?"Pinjaman tim berhasil dicairkan ke Team Wallet dan dicatat ke ledger.":"Pinjaman pribadi berhasil dicairkan dan dicatat ke ledger."});setAmount("");await refresh();
 };
 return <section className="workspace cash-loan-page">
  <header className="page-heading"><span className="section-eyebrow">FINANCIAL CENTRE · VREEOBANK</span><h1 className="page-title">Cash Loan</h1><p className="page-description">Ajukan pinjaman pribadi atau pinjaman tim berdasarkan income season aktif.</p><div className="ops-tabs" role="group" aria-label="Jenis pinjaman"><button type="button" className={loanMode==="personal"?"active":""} onClick={()=>setLoanMode("personal")}>Pinjaman Pribadi</button><button type="button" className={loanMode==="team"?"active":""} onClick={()=>setLoanMode("team")}>Pinjaman Tim</button></div></header>
  {loading?<div className="workspace-card cash-loan-state"><Clock3/><p>Memuat informasi pinjaman...</p></div>:!preview?<div className="workspace-card cash-loan-state"><ShieldCheck/><strong>Pinjaman belum tersedia</strong><p>Pastikan akun sudah terhubung dengan karakter member dan terdapat season aktif.</p></div>:<>
   <div className="cash-loan-overview"><article><span>Season aktif</span><strong>{preview.season_title}</strong></article><article><span>Income diterima</span><strong>{money(preview.season_income)}</strong></article><article><span>Batas pinjaman · 5× income</span><strong>{money(preview.max_loan)}</strong></article></div>
   <div className="cash-loan-layout">
    <section className="workspace-card cash-loan-form-card"><div className="cash-loan-card-heading"><div><span className="section-eyebrow">NEW APPLICATION</span><h2>{loanMode==="team"?"Pinjaman untuk Team Wallet":"Pinjaman pribadi"}</h2></div><Banknote size={22}/></div>
     {preview.has_open_loan?<div className="cash-loan-blocked"><Info/><strong>Masih ada pinjaman berjalan</strong><p>Pengajuan baru tersedia setelah seluruh angsuran pinjaman sebelumnya lunas.</p></div>:<form onSubmit={submit}>
      <label className="cash-loan-field">Nominal pinjaman (¢p)<input type="number" min="0.01" max={preview.max_loan} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Masukkan nominal" required/></label>
      <label className="cash-loan-field">Tenor<select value={tenor} onChange={e=>setTenor(e.target.value)}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} Season</option>)}</select></label>
      <div className="cash-loan-estimate"><div><span>Bunga total</span><strong>{selectedRate?.total_interest_rate??0}%</strong></div><div><span>Nominal bunga</span><strong>{money(interest)}</strong></div><div><span>Total pelunasan</span><strong>{money(total)}</strong></div><div><span>Estimasi angsuran</span><strong>{estimatedInstallments} Race Period</strong></div></div>
      <p className="cash-loan-note">Angsuran diproses otomatis pada akhir setiap Race Period setelah payroll. Pinjaman tim dibebankan ke Team Wallet dan kewajibannya tetap melekat pada tim ketika owner berganti. Jika saldo tidak cukup, angsuran dicatat sebagai tunggakan dan akan dicoba kembali pada Race Period berikutnya.</p>
      <button className="cash-loan-submit" disabled={!canApply||saving}>{saving?"Memproses...":"Ajukan dan cairkan pinjaman"}</button>
     </form>}
    </section>
    <section className="workspace-card cash-loan-rates"><div className="cash-loan-card-heading"><div><span className="section-eyebrow">INTEREST TABLE</span><h2>Tabel bunga</h2></div><CalendarClock size={22}/></div><p>Bunga tetap berdasarkan total tenor, bukan bunga berbunga.</p><div className="cash-loan-rate-list">{preview.interest_rates.map(rate=><article className={Number(tenor)===rate.tenor_seasons?"selected":""} key={rate.tenor_seasons}><strong>{rate.tenor_seasons} Season</strong><b>{rate.total_interest_rate}%</b><small>{money(principal+Math.round(principal*rate.total_interest_rate)/100)} total jika pinjam {money(principal)}</small></article>)}</div></section>
   </div>
   {activeLoan&&<section className="workspace-card cash-loan-current"><div className="cash-loan-card-heading"><div><span className="section-eyebrow">ACTIVE LOAN</span><h2>Pinjaman berjalan</h2></div><span className={"cash-loan-status "+activeLoan.status}>{activeLoan.status==="overdue"?"Tunggakan":"Aktif"}</span></div><div className="cash-loan-overview"><article><span>Pokok</span><strong>{money(activeLoan.principal)}</strong></article><article><span>Total tagihan</span><strong>{money(activeLoan.total_due)}</strong></article><article><span>Sisa kewajiban</span><strong>{money(activeLoan.total_due-activeLoan.amount_repaid)}</strong></article></div><p className="cash-loan-note">Tenor {activeLoan.tenor_seasons} season · Bunga {activeLoan.total_interest_rate}% · {installmentSummary.paid} angsuran lunas · {installmentSummary.overdue} tunggakan.</p></section>}
   <section className="workspace-card cash-loan-history"><div className="cash-loan-card-heading"><div><span className="section-eyebrow">LOAN HISTORY</span><h2>Riwayat pinjaman</h2></div><span>{loans.length} pinjaman</span></div>{loans.length===0?<p className="cash-loan-note">Belum ada riwayat pinjaman.</p>:loans.map(loan=><article className="cash-loan-history-row" key={loan.id}><div><strong>{money(loan.principal)} · {loan.tenor_seasons} Season</strong><small>{date(loan.created_at)} · Bunga {loan.total_interest_rate}%</small><small>{money(loan.amount_repaid)} / {money(loan.total_due)} dibayar</small></div><span className={"cash-loan-status "+loan.status}>{loan.status==="paid"?"Lunas":loan.status==="overdue"?"Tunggakan":"Aktif"}</span></article>)}</section>
  </>}
  {notice&&<div className={"cash-loan-notice "+notice.kind} role="status">{notice.kind==="success"?<CheckCircle2 size={16}/>:<Info size={16}/>} {notice.text}</div>}
 </section>;
}
