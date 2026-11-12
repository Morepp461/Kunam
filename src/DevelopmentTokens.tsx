import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,Coins,RefreshCw,Trophy} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Account={id:string;asset_type:"DDP"|"TDP";balance:number;member_id:string|null;team_id:string|null};
type Entry={id:string;delta:number;source_type:string;description:string;created_at:string};
type Member={id:string;role:string|null;team_id:string|null;character_name:string|null};
type Team={id:string;name:string};
export default function DevelopmentTokens({session,asset}:{session:Session;asset:"DDP"|"TDP"}){
 const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Team|null>(null),[account,setAccount]=useState<Account|null>(null),[entries,setEntries]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Akun belum terhubung ke member.");setLoading(false);return}
  const {data:m,error:me}=await supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle();
  if(me||!m){setNotice(me?.message||"Member tidak ditemukan.");setLoading(false);return}
  setMember(m as Member);
  if(asset==="TDP"&&m.team_id){const {data:t}=await supabase.from("teams").select("id,name").eq("id",m.team_id).maybeSingle();setTeam(t as Team|null)}
  const query=supabase.from("caleris_development_accounts").select("*").eq("asset_type",asset).eq(asset==="DDP"?"member_id":"team_id",asset==="DDP"?m.id:m.team_id||"");
  const {data:a,error:ae}=await query.maybeSingle();
  if(ae){setNotice(ae.message);setLoading(false);return}
  setAccount(a as Account|null);
  if(a){const {data:l,error:le}=await supabase.from("caleris_development_ledger").select("id,delta,source_type,description,created_at").eq("account_id",a.id).order("created_at",{ascending:false}).limit(100);if(le)setNotice(le.message);setEntries((l||[]) as Entry[])}else setEntries([]);
  setLoading(false);
 },[session.user.id,asset]);
 useEffect(()=>{void refresh()},[refresh]);
 const balance=Number(account?.balance||0);
 return <section className="workspace development-token-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">DEVELOPMENT ECONOMY</span><h1 className="page-title">{asset} Wallet</h1><p className="page-description">{asset==="DDP"?"Driver Development Points":"Team Development Points"} disimpan terpisah dari saldo ¢p dan hanya bertambah melalui reward resmi atau penyesuaian Admin.</p></header>
  {loading?<div className="workspace-card"><p>Memuat development wallet...</p></div>:<><div className="development-token-hero"><div><span className="section-eyebrow">{asset==="DDP"?"DRIVER DEVELOPMENT POINTS":"TEAM DEVELOPMENT POINTS"}</span><strong>{balance.toLocaleString("id-ID",{maximumFractionDigits:2})}</strong><small>{asset==="DDP"?member?.character_name||"Driver":team?.name||"Team"}</small></div><span className="development-token-icon">{asset==="DDP"?<Trophy size={28}/>:<Coins size={28}/>}</span></div>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">TOKEN LEDGER</span><h2>Riwayat development token</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>{entries.length===0?<p className="muted">Belum ada development token yang diterima.</p>:<div className="development-token-history">{entries.map(e=><article key={e.id}><div><strong>{e.description}</strong><small>{e.source_type.replaceAll("_"," ")} · {new Date(e.created_at).toLocaleString("id-ID")}</small></div><b>+{Number(e.delta).toLocaleString("id-ID",{maximumFractionDigits:2})}</b></article>)}</div>}</section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
