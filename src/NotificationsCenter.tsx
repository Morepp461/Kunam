import {useCallback,useEffect,useState} from "react";
import {Bell,CheckCheck,ExternalLink} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";

type Notification={id:string;category:string;title:string;body:string;href:string|null;created_at:string;read_at:string|null};
const when=(value:string)=>new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
export default function NotificationsCenter({memberId}:{memberId:string|null}){
 const [items,setItems]=useState<Notification[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!supabase||!memberId){setItems([]);setLoading(false);return}
  const {data,error:requestError}=await supabase.from("caleris_notifications").select("id,category,title,body,href,created_at,read_at").eq("member_id",memberId).order("created_at",{ascending:false}).limit(8);
  if(requestError)setError(requestError.message);else{setItems((data||[]) as Notification[]);setError("")}
  setLoading(false);
 },[memberId]);
 useEffect(()=>{void load();if(!supabase||!memberId)return;const channel=supabase.channel("caleris-notifications-"+memberId).on("postgres_changes",{event:"INSERT",schema:"public",table:"caleris_notifications",filter:"member_id=eq."+memberId},()=>void load()).subscribe();return()=>{void supabase?.removeChannel(channel)}},[load,memberId]);
 const markRead=async(id:string)=>{if(!supabase||!memberId)return;const {error:requestError}=await supabase.from("caleris_notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("member_id",memberId);if(requestError)setError(requestError.message);else setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item))};
 const markAll=async()=>{if(!supabase||!memberId)return;const {error:requestError}=await supabase.from("caleris_notifications").update({read_at:new Date().toISOString()}).eq("member_id",memberId).is("read_at",null);if(requestError)setError(requestError.message);else setItems(current=>current.map(item=>({...item,read_at:item.read_at||new Date().toISOString()})))};
 const unread=items.filter(item=>!item.read_at).length;
 if(!memberId)return null;
 return <section className="workspace-card notifications-center">
  <div className="notifications-center-head"><div><span className="section-eyebrow">CHARACTER INBOX</span><h2><Bell size={17}/> Notifikasi {unread>0&&<span>{unread}</span>}</h2></div>{unread>0&&<button type="button" onClick={()=>void markAll()}><CheckCheck size={14}/> Tandai semua dibaca</button>}</div>
  {loading?<p className="notifications-empty">Memuat notifikasi...</p>:!items.length?<p className="notifications-empty">Belum ada notifikasi baru.</p>:<div className="notifications-list">{items.map(item=><article className={item.read_at?"is-read":"is-unread"} key={item.id}>
   <div className="notifications-copy"><span>{item.category.replaceAll("_"," ").toUpperCase()} · {when(item.created_at)}</span><strong>{item.title}</strong><p>{item.body}</p><Link to={item.href||"/dashboard"}>{item.href?"Buka detail":"Lihat dashboard"} <ExternalLink size={12}/></Link></div>
   {!item.read_at&&<button type="button" aria-label="Tandai notifikasi dibaca" onClick={()=>void markRead(item.id)}><CheckCheck size={15}/></button>}
  </article>)}</div>}
  {error&&<p className="notifications-error">{error}</p>}
 </section>;
}
