import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,RefreshCw,Trophy,Coins,ShoppingBag} from "lucide-react";
import {Link} from "react-router-dom";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";

type Account={id:string;asset_type:"DDP"|"TDP";balance:number;member_id:string|null;team_id:string|null};
type Member={id:string;role:string|null;team_id:string|null;character_name:string|null};
type Team={id:string;name:string};
type Attribute={id:string;key:string;value:number;updated_at:string};
type Snapshot={id:string;season_id:string;asset_type:string;snapshot_stage:"season_end"|"season_baseline";attributes:Record<string,number>;created_at:string};
type Season={id:string;title:string;status:string};
const DRIVER=[["race_pace","Race Pace"],["qualifying_pace","Qualifying Pace"],["experience","Experience"],["aggression","Aggression"],["defensive_strength","Defensive Strength"],["overtake_skill","Overtake Skill"],["mistake_rate","Mistake Rate"],["tyre_management","Tyre Management"]] as const;
const TEAM=[["race_pace","Race Pace"],["qualifying_pace","Qualifying Pace"],["engine_power","Engine Power"],["aero_power","Aero Power"],["low_speed_corners","Low Speed Corners"],["high_speed_corners","High Speed Corners"],["traction","Traction"],["mechanical_grip","Mechanical Grip"],["team_tyre_management","Team Tyre Management"],["strategy_quality","Strategy Quality"],["team_morale","Team Morale"],["reliability","Reliability"],["car_tyre_wear","Car Tyre Wear"],["pit_stop_efficiency","Pit Stop Efficiency"],["drs_efficiency","DRS Efficiency"],["ers_efficiency","ERS Efficiency"]] as const;
const money=(n:number)=>Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function DevelopmentTokens({session,asset}:{session:Session;asset:"DDP"|"TDP"}){
 const [member,setMember]=useState<Member|null>(null),[team,setTeam]=useState<Team|null>(null),[account,setAccount]=useState<Account|null>(null);
 const [attributes,setAttributes]=useState<Attribute[]>([]),[snapshots,setSnapshots]=useState<Snapshot[]>([]),[seasons,setSeasons]=useState<Season[]>([]);
 const [selected,setSelected]=useState(""),[amount,setAmount]=useState("1"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const definitions=asset==="DDP"?DRIVER:TEAM;
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle();
  if(pe||!p?.member_id){setNotice(pe?.message||"Akun belum terhubung ke member.");setLoading(false);return;}
  const {data:m,error:me}=await supabase.from("members").select("id,role,team_id,character_name").eq("id",p.member_id).maybeSingle();
  if(me||!m){setNotice(me?.message||"Member tidak ditemukan.");setLoading(false);return;}
  setMember(m as Member);
  let ownerId=m.id;
  if(asset==="TDP"&&m.team_id){const {data:t}=await supabase.from("teams").select("id,name").eq("id",m.team_id).maybeSingle();setTeam(t as Team|null);ownerId=m.team_id;}
  else setTeam(null);
  const accountQuery=supabase.from("caleris_development_accounts").select("id,asset_type,balance,member_id,team_id").eq("asset_type",asset).eq(asset==="DDP"?"member_id":"team_id",asset==="DDP"?m.id:(m.team_id||""));
  const {data:a,error:ae}=await accountQuery.maybeSingle();
  if(ae){setNotice(ae.message);setLoading(false);return;}setAccount(a as Account|null);
  const attrTable=asset==="DDP"?"caleris_driver_development_attributes":"caleris_team_development_parts";
  const keyColumn=asset==="DDP"?"attribute_key":"part_key";
  const ownerColumn=asset==="DDP"?"member_id":"team_id";
  const {data:rows,error:re}=await supabase.from(attrTable).select("id,current_value,updated_at,"+keyColumn).eq(ownerColumn,ownerId).order(keyColumn);
  if(re)setNotice(re.message);
  setAttributes((rows||[]).map((r:any)=>({id:r.id,key:r[keyColumn],value:Number(r.current_value),updated_at:r.updated_at})));
  const [{data:ss,error:se},{data:seasonRows}]=await Promise.all([
   supabase.from("caleris_development_season_snapshots").select("id,season_id,asset_type,snapshot_stage,attributes,created_at").eq("asset_type",asset).eq(asset==="DDP"?"member_id":"team_id",ownerId).order("created_at",{ascending:false}).limit(40),
   supabase.from("license_seasons").select("id,title,status")
  ]);
  if(se)setNotice(se.message);
  setSnapshots((ss||[]) as Snapshot[]);setSeasons((seasonRows||[]) as Season[]);
  setLoading(false);
 },[session.user.id,asset]);
 useEffect(()=>{void refresh()},[refresh]);
 const balance=Number(account?.balance||0);
 const current=useMemo(()=>Object.fromEntries(attributes.map(a=>[a.key,a.value])),[attributes]);
 const selectedLabel=definitions.find(x=>x[0]===selected)?.[1]||"Pilih atribut";
 const cost=Number(amount||0);
 const validAmount=Number.isInteger(cost)&&cost>0&&cost<=balance;
 const upgrade=async()=>{
  if(!selected||!validAmount){setNotice("Pilih atribut dan nominal token yang valid. Biaya tidak boleh melebihi saldo token.");return;}
  const attr=attributes.find(a=>a.key===selected);if(!attr){setNotice("Atribut tidak ditemukan.");return;}
  if(attr.value+cost>100){setNotice("Nilai atribut maksimal 100.");return;}
  setSaving(true);setNotice("");
  const {data,error}=await supabase!.functions.invoke("economy-workflows",{body:{action:"upgrade_development_attribute",scope:asset==="DDP"?"driver":"team",attributeKey:selected,newValue:attr.value+cost}});
  setSaving(false);
  if(error||data?.error){setNotice(data?.error||error?.message||"Upgrade gagal.");return;}
  setAmount("1");await refresh();setNotice("Upgrade berhasil. Preview atribut sudah diperbarui.");
 };
 const history=[...snapshots].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
 const seasonName=(id:string)=>seasons.find(s=>s.id===id)?.title||"Season";
 const latestEnd=history.find(s=>s.snapshot_stage==="season_end");
 const latestBaseline=history.find(s=>s.snapshot_stage==="season_baseline");
 return <section className="workspace development-token-workspace">
  <div className="development-page-actions"><Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link><Link className="economy-secondary-button" to="/shop"><ShoppingBag size={15}/> Shop</Link></div>
  <header className="page-heading"><span className="section-eyebrow">DEVELOPMENT ECONOMY</span><h1 className="page-title">{asset==="DDP"?"Driver Development":"Team Car Development"}</h1><p className="page-description">{asset==="DDP"?"Development atribut pribadi driver.":"Development 16 atribut mobil milik tim."} Upgrade menggunakan token {asset} dan setiap perubahan tercatat.</p></header>
  {loading?<div className="workspace-card">Memuat data development...</div>:<>
   <div className="development-token-hero"><div><span className="section-eyebrow">{asset==="DDP"?"DRIVER DEVELOPMENT POINTS":"TEAM DEVELOPMENT POINTS"}</span><strong>{money(balance)}</strong><small>{asset==="DDP"?member?.character_name||"Driver":team?.name||"Tim belum tersedia"}</small></div><span className="development-token-icon">{asset==="DDP"?<Trophy size={28}/>:<Coins size={28}/>}</span></div>
   <section className="workspace-card development-panel-card"><div className="section-title-row"><div><span className="section-eyebrow">01 · ATTRIBUTE PREVIEW</span><h2>Preview Atribut</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</button></div>
    <div className="development-attribute-grid">{definitions.map(([key,label])=>{const value=Number(current[key]??50);return <article className="development-attribute-card" key={key}><div><strong>{label}</strong><b>{value}/100</b></div><div className="development-attribute-track"><i style={{width:Math.max(0,Math.min(100,value))+"%"}}/></div></article>})}</div>
   </section>
   <section className="workspace-card development-panel-card"><div className="section-title-row"><div><span className="section-eyebrow">02 · ATTRIBUTE UPGRADE</span><h2>Upgrade Atribut</h2></div><strong className="development-token-balance">{money(balance)} {asset}</strong></div>
    <p className="economy-form-hint">1 token = +1 nilai atribut. Nilai maksimal setiap atribut adalah 100.</p>
    <div className="development-upgrade-form"><label>Atribut<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Pilih atribut</option>{definitions.map(([key,label])=><option key={key} value={key}>{label} · Saat ini {current[key]??50}</option>)}</select></label><label>Jumlah token<input type="number" min="1" step="1" max={balance} value={amount} onChange={e=>setAmount(e.target.value)}/></label></div>
    {selected&&<p className="economy-form-hint">Hasil: {Number(current[selected]??50)} → {Number(current[selected]??50)+Math.max(0,cost)} · Sisa token setelah upgrade: {money(Math.max(0,balance-cost))}</p>}
    <button className="economy-primary-button" disabled={saving||!validAmount||!selected||Number(current[selected]??50)+cost>100} onClick={()=>void upgrade()}>{saving?"Memproses...":"Upgrade Atribut"}</button>
   </section>
   <section className="workspace-card development-panel-card"><div className="section-title-row"><div><span className="section-eyebrow">03 · SEASON ATTRIBUTE HISTORY</span><h2>Riwayat Development</h2></div></div>
    {latestEnd||latestBaseline?<div className="development-snapshot-comparison"><article><span>Snapshot akhir · {latestEnd?seasonName(latestEnd.season_id):"—"}</span>{definitions.map(([key,label])=><p key={key}><b>{label}</b><strong>{latestEnd?.attributes?.[key]??"—"}</strong></p>)}</article><article><span>Baseline awal · {latestBaseline?seasonName(latestBaseline.season_id):"—"}</span>{definitions.map(([key,label])=><p key={key}><b>{label}</b><strong>{latestBaseline?.attributes?.[key]??"—"}</strong></p>)}</article></div>:<p className="muted">Belum ada snapshot season. Snapshot pertama akan muncul setelah Admin menutup season.</p>}
    <div className="development-snapshot-list">{history.map(s=><article key={s.id}><div><strong>{seasonName(s.season_id)} · {s.snapshot_stage==="season_end"?"Akhir Season":"Baseline Season"}</strong><small>{new Date(s.created_at).toLocaleString("id-ID")}</small></div><span>{Object.keys(s.attributes||{}).length} atribut</span></article>)}</div>
   </section>
  </>}
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}