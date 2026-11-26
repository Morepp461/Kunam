import {useCallback,useEffect,useState} from "react";
import {Pencil,RefreshCw,ShieldCheck,X} from "lucide-react";
import {supabase} from "./lib/supabase";
import "./admin-profile-adjustments.css";

type Snapshot={
 target_type:"member"|"team";
 display_name:string;
 role:string;
 xp_total:number|null;
 level:number|null;
 wallet_id:string;
 wallet_kind:string;
 wallet_balance:number;
};
type HistoryRow={
 kind:"xp"|"wallet";
 signed_amount:number;
 description:string;
 created_at:string;
 metadata?:Record<string,unknown>;
};

export default function AdminProfileAdjustments({memberId=null,teamId=null,targetLabel}:{memberId?:string|null;teamId?:string|null;targetLabel:string}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [history,setHistory]=useState<HistoryRow[]>([]);
 const [open,setOpen]=useState(false);
 const [kind,setKind]=useState<"xp"|"wallet">("wallet");
 const [operation,setOperation]=useState<"add"|"subtract">("add");
 const [amount,setAmount]=useState("");
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState("");

 const load=useCallback(async()=>{
  if(!supabase){setSnapshot(null);setLoading(false);return;}
  setLoading(true);
  const args={p_member_id:memberId,p_team_id:teamId};
  const {data,error}=await supabase.rpc("caleris_admin_get_profile_adjustment_snapshot",args);
  if(error||!data){setSnapshot(null);setLoading(false);return;}
  setSnapshot(data as Snapshot);
  const {data:rows,error:historyError}=await supabase.rpc("caleris_admin_get_profile_adjustment_history",args);
  setHistory(!historyError&&Array.isArray(rows)?rows as HistoryRow[]:[]);
  setLoading(false);
 },[memberId,teamId]);

 useEffect(()=>{void load()},[load]);

 const submit=async()=>{
  if(!supabase||!snapshot||busy)return;
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0||reason.trim().length<3){setNotice("Nominal dan alasan wajib diisi dengan benar.");return;}
  if(kind==="xp"&&(!memberId||!Number.isInteger(value))){setNotice("XP harus berupa bilangan bulat dan hanya tersedia untuk profil Driver/Owner.");return;}
  const before=kind==="xp"?Number(snapshot.xp_total||0):Number(snapshot.wallet_balance||0);
  const signed=operation==="add"?value:-value;
  const after=before+signed;
  if(after<0){setNotice("Saldo atau total XP tidak mencukupi untuk pengurangan ini.");return;}
  const unit=kind==="xp"?"XP":"¢p";
  const target=snapshot.display_name||targetLabel;
  if(!window.confirm("Konfirmasi penyesuaian?\nTarget: "+target+"\nJenis: "+(kind==="xp"?"XP":"Wallet")+"\nPerubahan: "+(signed>0?"+":"")+signed.toLocaleString("id-ID")+" "+unit+"\nSebelum: "+before.toLocaleString("id-ID")+"\nSesudah: "+after.toLocaleString("id-ID")+"\nAlasan: "+reason.trim()))return;

  setBusy(true);setNotice("");
  const requestId=crypto.randomUUID();
  const result=kind==="xp"
   ?await supabase.rpc("caleris_admin_adjust_xp",{p_member_id:memberId,p_amount:signed,p_source_id:"admin-profile-xp:"+requestId,p_description:reason.trim()})
   :await supabase.rpc("caleris_admin_adjust_profile_wallet",{p_wallet_account_id:snapshot.wallet_id,p_operation:operation,p_amount:value,p_reason:reason.trim(),p_idempotency_key:"admin-profile-wallet:"+requestId});
  setBusy(false);
  if(result.error){setNotice(result.error.message);return;}
  setAmount("");setReason("");setNotice("Penyesuaian berhasil dicatat dalam audit ledger.");
  await load();
 };

 if(loading||!snapshot)return null;
 const money=(value:number)=>"¢p "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:2});
 return <section className="workspace-card admin-profile-adjustments">
  <div className="admin-profile-adjustments-head">
   <div><span className="section-eyebrow">ADMIN CONTROL · AUDITED</span><h2>Profile adjustments</h2><p>Penyesuaian hanya tersedia bagi Site Admin dan selalu masuk ke ledger.</p></div>
   <button type="button" className="action primary" onClick={()=>{setNotice("");setOpen(true)}}><Pencil size={15}/> Edit / Adjust</button>
  </div>
  <div className="admin-profile-adjustments-stats">
   {snapshot.target_type==="member"&&<div><span>Community XP</span><strong>{Number(snapshot.xp_total||0).toLocaleString("id-ID")} XP</strong><small>Level {Number(snapshot.level||0)}</small></div>}
   <div><span>{snapshot.wallet_kind==="team"?"Team Wallet":"Personal Wallet"}</span><strong>{money(Number(snapshot.wallet_balance||0))}</strong><small>{snapshot.role}</small></div>
  </div>
  <div className="admin-profile-adjustments-history">
   <div className="admin-profile-adjustments-history-title"><strong>Riwayat penyesuaian</strong><button type="button" className="icon-button" onClick={()=>void load()} aria-label="Refresh history"><RefreshCw size={14}/></button></div>
   {history.length?history.slice(0,8).map((item,index)=><div className="admin-profile-adjustment-row" key={item.reference||index}>
    <span className="admin-profile-adjustment-kind">{item.kind==="xp"?"XP":"WALLET"}</span>
    <span className="admin-profile-adjustment-copy"><strong>{item.description}</strong><small>{new Date(item.created_at).toLocaleString("id-ID")}</small></span>
    <strong className={item.signed_amount<0?"is-negative":"is-positive"}>{item.signed_amount>0?"+":""}{Number(item.signed_amount).toLocaleString("id-ID")} {item.kind==="xp"?"XP":"¢p"}</strong>
   </div>):<p className="admin-profile-adjustments-empty">Belum ada riwayat penyesuaian.</p>}
  </div>
  {notice&&!open&&<p className="admin-profile-adjustments-notice" role="status">{notice}</p>}
  {open&&<div className="admin-profile-adjustments-overlay" role="presentation" onClick={()=>{if(!busy)setOpen(false)}}>
   <section className="workspace-card admin-profile-adjustments-modal" role="dialog" aria-modal="true" aria-labelledby="admin-profile-adjust-title" onClick={event=>event.stopPropagation()}>
    <header><div><span className="section-eyebrow">SITE ADMIN ONLY</span><h2 id="admin-profile-adjust-title">Edit / Adjust · {targetLabel}</h2></div><button type="button" className="icon-button" disabled={busy} onClick={()=>setOpen(false)} aria-label="Close"><X size={18}/></button></header>
    <div className="admin-profile-adjustments-form">
     {snapshot.target_type==="member"&&<label>Jenis penyesuaian<select value={kind} onChange={event=>setKind(event.target.value as "xp"|"wallet")}><option value="xp">Community XP</option><option value="wallet">Personal Wallet</option></select></label>}
     <label>Operasi<select value={operation} onChange={event=>setOperation(event.target.value as "add"|"subtract")}><option value="add">Tambah</option><option value="subtract">Kurangi</option></select></label>
     <label>Nominal ({kind==="xp"?"XP":"¢p"})<input type="number" min="0.01" step={kind==="xp"?"1":"0.01"} value={amount} onChange={event=>setAmount(event.target.value)} placeholder="Masukkan nominal" /></label>
     <label>Alasan wajib<textarea rows={3} maxLength={240} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Tuliskan alasan penyesuaian (3–240 karakter)"/></label>
     {notice&&<p className="admin-profile-adjustments-notice" role="status">{notice}</p>}
     <p className="admin-profile-adjustments-warning"><ShieldCheck size={15}/> Target dan nilai sebelum/sesudah akan dikonfirmasi sebelum transaksi. VreeoBank tidak disentuh oleh penyesuaian profil.</p>
     <div className="admin-profile-adjustments-actions"><button type="button" className="action primary" disabled={busy||!amount||reason.trim().length<3} onClick={()=>void submit()}>{busy?"Menyimpan...":"Konfirmasi penyesuaian"}</button><button type="button" className="action" disabled={busy} onClick={()=>setOpen(false)}>Batal</button></div>
    </div>
   </section>
  </div>}
 </section>;
}
