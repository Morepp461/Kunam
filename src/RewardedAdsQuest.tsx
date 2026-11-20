import {useCallback,useEffect,useState} from "react";
import {CalendarClock,CheckCircle2,Clock3,PlayCircle,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";

type Milestone={ads:number;reward:number;claimed:boolean};
type Board={enabled:boolean;provider:string;timezone:string;daily_limit:number;ads_watched:number;milestones:Milestone[];date:string;ready_for_ads:boolean};
const money=(v:number)=>"€ "+Number(v||0).toLocaleString("id-ID",{maximumFractionDigits:2});

export default function RewardedAdsQuest(){
 const [board,setBoard]=useState<Board|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!supabase){setError("Koneksi database belum tersedia.");setLoading(false);return;}
  setLoading(true);setError("");
  const {data,error:requestError}=await supabase.rpc("member_get_rewarded_ads_board");
  if(requestError||!data){setBoard(null);setError(requestError?.message||"Rewarded Ads Quest belum dapat dimuat.");setLoading(false);return;}
  setBoard(data as Board);setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const count=board?.ads_watched??0;
 return <section className="rewarded-ads-card">
  <div className="rewarded-ads-header">
   <div><span className="section-eyebrow">DAILY BONUS · REWARDED ADS</span><h2>Rewarded Ads Quest</h2><p>Slot bonus terpisah dari tiga Daily Quest reguler. Maksimal lima iklan valid per hari.</p></div>
   <span className="rewarded-ads-icon"><PlayCircle size={22}/></span>
  </div>
  {loading?<div className="rewarded-ads-state">Memuat progress iklan...</div>:error?<div className="rewarded-ads-state is-error">{error}</div>:board&&<>
   <div className="rewarded-ads-progress"><div><span>Iklan terverifikasi hari ini</span><strong>{count} / {board.daily_limit}</strong></div><div className="rewarded-ads-track"><i style={{width:(count/Math.max(1,board.daily_limit)*100)+"%"}}/></div></div>
   <div className="rewarded-ads-milestones">{board.milestones.map(item=><article key={item.ads} className={item.claimed?"is-claimed":count>=item.ads?"is-reached":""}>
    <div><span>Milestone {item.ads} iklan</span><strong>{money(item.reward)}</strong></div>
    <small>{item.claimed?<><CheckCircle2 size={13}/> Sudah dibayarkan</>:count>=item.ads?"Menunggu pembayaran terverifikasi":"Belum tercapai"}</small>
   </article>)}</div>
   <div className="rewarded-ads-note">
    <ShieldCheck size={16}/>
    <span>{board.ready_for_ads?"Integrasi iklan siap. Reward hanya dihitung dari callback server Google yang valid.":"Iklan tidak dapat dimuat."}</span>
   </div>
   <div className="rewarded-ads-reset"><CalendarClock size={14}/> Reset setiap hari pukul 00.00 WIB <span>·</span><Clock3 size={14}/> {board.date}</div>
  </>}
 </section>;
}
