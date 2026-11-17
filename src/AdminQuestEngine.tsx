import {useCallback,useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {ArrowLeft,Coins,RefreshCw,Save,Wallet} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Difficulty="easy"|"normal"|"hard"|"elite";
type Reward={difficulty:Difficulty;reward_amount:number;updated_at:string};
type Counts={role_scope:string;quest_type:string;total:number};
const labels:Record<Difficulty,string>={easy:"Easy",normal:"Normal",hard:"Hard",elite:"Elite"};
const order:Difficulty[]=["easy","normal","hard","elite"];
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});
export default function AdminQuestEngine({session}:{session:Session}){
 const [rows,setRows]=useState<Reward[]>([]),[amounts,setAmounts]=useState<Record<Difficulty,string>>({easy:"250",normal:"500",hard:"1000",elite:"2500"});
 const [counts,setCounts]=useState<Counts[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[processing,setProcessing]=useState(false);
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);setNotice("Koneksi Supabase belum tersedia.");return;}
  setLoading(true);setNotice("");
  const [r,c]=await Promise.all([
   supabase.from("caleris_quest_difficulty_rewards").select("difficulty,reward_amount,updated_at").order("difficulty"),
   supabase.from("caleris_quest_catalog").select("role_scope,quest_type,is_active").eq("is_active",true)
  ]);
  const err=r.error||c.error;if(err){setNotice(err.message);setLoading(false);return;}
  const rewards=(r.data||[]) as Reward[];setRows(rewards);
  setAmounts(Object.fromEntries(rewards.map(x=>[x.difficulty,String(x.reward_amount)])) as Record<Difficulty,string>);
  const map=new Map<string,number>();for(const x of c.data||[]){const key=x.role_scope+":"+x.quest_type;map.set(key,(map.get(key)||0)+1);}
  setCounts(Array.from(map.entries()).map(([key,total])=>({role_scope:key.split(":")[0],quest_type:key.split(":")[1],total})));
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const save=async()=>{
  if(!supabase)return;
  const rewards=order.map(difficulty=>({difficulty,reward_amount:Number(amounts[difficulty])}));
  for(const item of rewards){if(!Number.isFinite(item.reward_amount)||item.reward_amount<=0||Math.round(item.reward_amount*100)!==item.reward_amount*100){setNotice("Nominal setiap tingkat kesulitan harus lebih besar dari nol dan maksimal dua desimal.");return;}}
  setSaving(true);setNotice("");
  const {data,error}=await supabase.rpc("admin_update_quest_reward_amounts",{p_rewards:rewards});
  setSaving(false);
  if(error){setNotice(error.message);return;}
  setNotice("Nominal reward berhasil diperbarui ("+Number(data?.updated||0)+" tingkat). Assignment yang sudah terbentuk tetap memakai nominal saat assignment dibuat.");await load();
 };
 const processPending=async()=>{
  if(!supabase)return;setProcessing(true);setNotice("");
  const {data,error}=await supabase.rpc("admin_process_pending_quest_rewards");
  setProcessing(false);
  if(error){setNotice(error.message);return;}
  setNotice("Pemrosesan selesai. Dibayar: "+Number(data?.paid||0)+" · Menunggu: "+Number(data?.pending||0));
  await load();
 };
 return <section className="workspace admin-quest-workspace">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={15}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">ADMIN CONTROL · ECONOMY</span><h1 className="page-title">Quest Engine</h1><p className="page-description">Kelola nominal reward berdasarkan tingkat kesulitan dan proses reward yang menunggu pendanaan VreeoBank.</p></header>
  <div className="admin-quest-summary">{counts.map(x=><article key={x.role_scope+":"+x.quest_type}><span>{x.role_scope==="driver"?"Driver":"Team Owner"} · {x.quest_type==="daily"?"Daily":"Period"}</span><strong>{x.total} quest</strong></article>)}</div>
  <section className="workspace-card admin-quest-card"><div className="section-title-row"><div><span className="section-eyebrow">REWARD CONFIGURATION</span><h2>Nominal berdasarkan kesulitan</h2></div><Coins size={19}/></div>
   {loading?<p>Memuat konfigurasi...</p>:<div className="admin-quest-reward-list">{order.map(difficulty=><label className="admin-quest-reward-row" key={difficulty}><span><strong>{labels[difficulty]}</strong><small>Reward per quest selesai</small></span><div><span>€</span><input type="number" min="0.01" step="0.01" value={amounts[difficulty]} onChange={e=>setAmounts(v=>({...v,[difficulty]:e.target.value}))}/></div><b>{money(Number(amounts[difficulty]||0))}</b></label>)}</div>}
   <button className="admin-quest-save" disabled={loading||saving} onClick={()=>void save()}><Save size={15}/>{saving?"Menyimpan...":"Simpan nominal reward"}</button>
  </section>
  <section className="workspace-card admin-quest-card"><div className="section-title-row"><div><span className="section-eyebrow">VREEOBANK SETTLEMENT</span><h2>Reward tertunda</h2></div><Wallet size={19}/></div><p>Reward yang sudah selesai tetapi belum terbayar akan dicoba ulang dari saldo VreeoBank.</p><button className="admin-quest-save secondary" disabled={processing} onClick={()=>void processPending()}><RefreshCw size={15}/>{processing?"Memproses...":"Proses reward tertunda"}</button></section>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
