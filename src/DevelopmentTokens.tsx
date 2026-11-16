import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,RefreshCw,Trophy,Coins,Wallet} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Account={id:string;asset_type:"DDP"|"TDP";balance:number;member_id:string|null;team_id:string|null};
type Member={id:string;role:string|null;team_id:string|null;character_name:string|null};
type Team={id:string;name:string};
type CashWallet={id:string;balance:number};
type Attribute={id:string;key:string;value:number;updated_at:string};
type Price={key:string;cash_eur_per_point:number};
type Snapshot={id:string;season_id:string;asset_type:string;snapshot_stage:"season_end"|"season_baseline";attributes:Record<string,number>;created_at:string};
type Season={id:string;title:string;status:string};
const DRIVER=[["race_pace","Race Pace"],["qualifying_pace","Qualifying Pace"],["experience","Experience"],["aggression","Aggression"],["defensive_strength","Defensive Strength"],["overtake_skill","Overtake Skill"],["mistake_rate","Mistake Rate"],["tyre_management","Tyre Management"]] as const;
const TEAM=[["race_pace","Race Pace"],["qualifying_pace","Qualifying Pace"],["engine_power","Engine Power"],["aero_power","Aero Power"],["low_speed_corners","Low Speed Corners"],["high_speed_corners","High Speed Corners"],["traction","Traction"],["mechanical_grip","Mechanical Grip"],["team_tyre_management","Team Tyre Management"],["strategy_quality","Strategy Quality"],["team_morale","Team Morale"],["reliability","Reliability"],["car_tyre_wear","Car Tyre Wear"],["pit_stop_efficiency","Pit Stop Efficiency"],["drs_efficiency","DRS Efficiency"],["ers_efficiency","ERS Efficiency"]] as const;
const money=(n:number)=>"€ "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function DevelopmentTokens({session,asset}:{session:Session;asset:"DDP"|"TDP"}){
 const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Team|null>(null);
 const [account,setAccount]=useState<Account|null>(null),[cashWallet,setCashWallet]=useState<CashWallet|null>(null);
 const [attributes,setAttributes]=useState<Attribute[]>([]),[prices,setPrices]=useState<Record<string,number>>({});
 const [snapshots,setSnapshots]=useState<Snapshot[]>([]),[seasons,setSeasons]=useState<Season[]>([]);
 const [selected,setSelected]=useState(""),[amount,setAmount]=useState("1"),[paymentMethod,setPaymentMethod]=useState<"cash"|"token">("cash");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const definitions=asset==="DDP"?DRIVER:TEAM;
 const refresh=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Akun belum terhubung ke member.");setLoading(false);return;}
  const {data:m,error:me}=await supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle();
  if(me||!m){setNotice(me?.message||"Member tidak ditemukan.");setLoading(false);return;}
  setMember(m as Member);
  let ownerId=m.id;
  let teamData:Team|null=null;
  if(asset==="TDP"){
   if(!m.team_id){setTeam(null);setAccount(null);setCashWallet(null);setAttributes([]);setLoading(false);setNotice("Member belum memiliki tim untuk mengelola Development mobil.");return;}
   const {data:t,error:te}=await supabase.from("teams").select("id,name").eq("id",m.team_id).maybeSingle();
   if(te){setNotice(te.message);setLoading(false);return;}
   teamData=t as Team|null;setTeam(teamData);ownerId=m.team_id;
  }else setTeam(null);

  const attrTable=asset==="DDP"?"caleris_driver_development_attributes":"caleris_team_development_parts";
  const keyColumn=asset==="DDP"?"attribute_key":"part_key";
  const ownerColumn=asset==="DDP"?"member_id":"team_id";
  const cashWalletQuery=asset==="DDP"
   ?supabase.from("economy_wallet_accounts").select("id,balance").eq("account_kind","driver").eq("member_id",m.id).eq("is_active",true).maybeSingle()
   :supabase.from("economy_wallet_accounts").select("id,balance").eq("account_kind","team").eq("team_id",ownerId).eq("is_active",true).maybeSingle();
  const devAccountQuery=supabase.from("caleris_development_accounts").select("id,asset_type,balance,member_id,team_id").eq("asset_type",asset).eq(asset==="DDP"?"member_id":"team_id",ownerId).maybeSingle();
  const priceQuery=asset==="DDP"
   ?supabase.from("caleris_driver_development_pricing").select("attribute_key,cash_eur_per_point").eq("cash_is_configured",true)
   :supabase.from("caleris_team_development_pricing").select("part_key,cash_eur_per_point").eq("cash_is_configured",true);
  const [{data:a,error:ae},{data:w,error:we},{data:rows,error:re},{data:priceRows,error:priceError},{data:ss,error:se},{data:seasonRows,error:sre}]=await Promise.all([
   devAccountQuery,cashWalletQuery,
   supabase.from(attrTable).select("id,current_value,updated_at,"+keyColumn).eq(ownerColumn,ownerId).order(keyColumn),
   priceQuery,
   supabase.from("caleris_development_season_snapshots").select("id,season_id,asset_type,snapshot_stage,attributes,created_at").eq("asset_type",asset).eq(asset==="DDP"?"member_id":"team_id",ownerId).order("created_at",{ascending:false}).limit(40),
   supabase.from("license_seasons").select("id,title,status")
  ]);
  const errors=[ae,we,re,priceError,se,sre].filter(Boolean);
  if(errors.length){setNotice(errors.map(e=>e?.message).join(" · "));setLoading(false);return;}
  setAccount(a as Account|null);setCashWallet(w as CashWallet|null);
  setAttributes((rows||[]).map((r:any)=>({id:r.id,key:r[keyColumn],value:Number(r.current_value),updated_at:r.updated_at})));
  setPrices(Object.fromEntries((priceRows||[]).map((r:any)=>[asset==="DDP"?r.attribute_key:r.part_key,Number(r.cash_eur_per_point)])));
  setSnapshots((ss||[]) as Snapshot[]);setSeasons((seasonRows||[]) as Season[]);
  setLoading(false);
 },[session.user.id,asset]);
 useEffect(()=>{void refresh()},[refresh]);
 const cashBalance=Number(cashWallet?.balance||0),tokenBalance=Number(account?.balance||0);
 const current=useMemo(()=>Object.fromEntries(attributes.map(a=>[a.key,a.value])),[attributes]);
 const delta=Number(amount||0),oldValue=Number(current[selected]??50),newValue=oldValue+delta;
 const cashRate=Number(prices[selected]||0),cashCost=delta*cashRate,tokenCost=delta;
 const validDelta=Number.isFinite(delta)&&delta>0&&Math.round(delta*100)===delta*100&&newValue<=100;
 const validPayment=paymentMethod==="cash"?cashRate>0&&cashCost<=cashBalance:tokenCost<=tokenBalance;
 const upgrade=async()=>{
  if(!supabase||!selected||!validDelta||!validPayment){setNotice("Periksa atribut, kenaikan nilai, metode pembayaran, dan saldo yang tersedia.");return;}
  setSaving(true);setNotice("");
  const {data,error}=await supabase.functions.invoke("economy-workflows",{body:{action:"upgrade_development_attribute",scope:asset==="DDP"?"driver":"team",attributeKey:selected,newValue,paymentMethod}});
  setSaving(false);
  if(error||data?.error){setNotice(data?.error||error?.message||"Upgrade gagal.");return;}
  await refresh();
  setAmount("1");
  setNotice(paymentMethod==="cash"?"Upgrade berhasil. Saldo wallet dipotong dan Development Treasury menerima pembayaran.":"Upgrade berhasil menggunakan token race reward gratis.");
 };
 const history=[...snapshots].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
 const seasonName=(id:string)=>seasons.find(s=>s.id===id)?.title||"Season";
 const latestEnd=history.find(s=>s.snapshot_stage==="season_end");
 const latestBaseline=history.find(s=>s.snapshot_stage==="season_baseline");
 return <section className="workspace development-token-workspace">
  <div className="development-page-actions"><Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link></div>
  <header className="page-heading"><span className="section-eyebrow">DEVELOPMENT ECONOMY</span><h1 className="page-title">{asset==="DDP"?"Driver Development":"Team Car Development"}</h1><p className="page-description">{asset==="DDP"?"Development delapan atribut pribadi Driver.":"Development enam belas part mobil milik tim."} Upgrade utama menggunakan saldo wallet; token hanya untuk development gratis dari race reward.</p></header>
  {loading?<div className="workspace-card">Memuat data Development...</div>:<>
   <div className="development-balance-grid">
    <article className="development-token-hero"><div><span className="section-eyebrow">WALLET CASH</span><strong>{money(cashBalance)}</strong><small>{asset==="DDP"?member?.character_name||"Driver":team?.name||"Team"}</small></div><span className="development-token-icon"><Wallet size={27}/></span></article>
    <article className="development-token-hero development-reward-balance"><div><span className="section-eyebrow">{asset==="DDP"?"RACE REWARD · DDP":"RACE REWARD · TDP"}</span><strong>{Number(tokenBalance).toLocaleString("id-ID",{maximumFractionDigits:2})}</strong><small>1 token = +1 atribut gratis · tidak bisa dibeli</small></div><span className="development-token-icon"><Trophy size={27}/></span></article>
   </div>
   <section className="workspace-card development-panel-card"><div className="section-title-row"><div><span className="section-eyebrow">01 · ATTRIBUTE PREVIEW</span><h2>Preview Atribut</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div>
    <div className="development-attribute-grid">{definitions.map(([key,label])=>{const value=Number(current[key]??50);return <article className="development-attribute-card" key={key}><div><strong>{label}</strong><b>{value}/100</b></div><div className="development-attribute-track"><i style={{width:Math.max(0,Math.min(100,value))+"%"}}/></div></article>})}</div>
   </section>
   <section className="workspace-card development-panel-card"><div className="section-title-row"><div><span className="section-eyebrow">02 · ATTRIBUTE UPGRADE</span><h2>Upgrade Atribut</h2></div><strong className="development-token-balance">{money(cashBalance)}</strong></div>
    <div className="development-upgrade-form"><label>Atribut<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Pilih atribut</option>{definitions.map(([key,label])=><option key={key} value={key}>{label} · {Number(current[key]??50)}/100 · {money(prices[key]||0)}/poin</option>)}</select></label><label>Kenaikan poin<input type="number" min="0.01" step="0.01" max={Math.max(0,100-oldValue)} value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
    <label className="development-payment-method">Metode pembayaran<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as "cash"|"token")}><option value="cash">Wallet Cash · {money(cashBalance)}</option><option value="token">Race Reward Token · {Number(tokenBalance).toLocaleString("id-ID")} tersedia</option></select></label>
    {selected&&<div className="development-cost-preview"><p><span>Hasil atribut</span><strong>{oldValue} → {newValue}/100</strong></p><p><span>Harga cash per poin</span><strong>{money(cashRate)}</strong></p>{paymentMethod==="cash"?<p><span>Total pembayaran</span><strong>{money(cashCost)}</strong></p>:<p><span>Token gratis digunakan</span><strong>{tokenCost.toLocaleString("id-ID",{maximumFractionDigits:2})} {asset}</strong></p>}<p><span>Sisa wallet setelah upgrade</span><strong>{paymentMethod==="cash"?money(Math.max(0,cashBalance-cashCost)):money(cashBalance)}</strong></p>{paymentMethod==="token"&&<p><span>Sisa token</span><strong>{Math.max(0,tokenBalance-tokenCost).toLocaleString("id-ID",{maximumFractionDigits:2})} {asset}</strong></p>}</div>}
    <p className="economy-form-hint">Nilai maksimum atribut 100. Cash dibayar dari wallet Driver/Team ke Development Treasury. Token hanya berasal dari hasil race dan tidak memiliki harga tunai.</p>
    <button className="economy-primary-button" disabled={saving||!selected||!validDelta||!validPayment} onClick={()=>void upgrade()}>{saving?"Memproses...":paymentMethod==="cash"?"Konfirmasi Upgrade & Bayar":"Upgrade Gratis dengan Race Token"}</button>
   </section>
   <section className="workspace-card development-panel-card"><div className="section-title-row"><div><span className="section-eyebrow">03 · SEASON ATTRIBUTE HISTORY</span><h2>Riwayat Development</h2></div></div>
    {latestEnd||latestBaseline?<div className="development-snapshot-comparison"><article><span>Snapshot akhir · {latestEnd?seasonName(latestEnd.season_id):"—"}</span>{definitions.map(([key,label])=><p key={key}><b>{label}</b><strong>{latestEnd?.attributes?.[key]??"—"}</strong></p>)}</article><article><span>Baseline awal · {latestBaseline?seasonName(latestBaseline.season_id):"—"}</span>{definitions.map(([key,label])=><p key={key}><b>{label}</b><strong>{latestBaseline?.attributes?.[key]??"—"}</strong></p>)}</article></div>:<p className="muted">Belum ada snapshot season. Snapshot pertama akan muncul setelah Admin menutup season.</p>}
    <div className="development-snapshot-list">{history.map(s=><article key={s.id}><div><strong>{seasonName(s.season_id)} · {s.snapshot_stage==="season_end"?"Akhir Season":"Baseline Season"}</strong><small>{new Date(s.created_at).toLocaleString("id-ID")}</small></div><span>{Object.keys(s.attributes||{}).length} atribut</span></article>)}</div>
   </section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
