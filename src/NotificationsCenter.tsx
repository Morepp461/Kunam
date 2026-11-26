import {useCallback,useEffect,useRef,useState} from "react";
import {Bell,CheckCheck,ExternalLink,Trash2,X} from "lucide-react";
import {Link} from "react-router-dom";
import {supabase} from "./lib/supabase";
import CaleMascot from "./CaleMascot";

type Notification={id:string;category:string;title:string;body:string;href:string|null;created_at:string;read_at:string|null};
type MemberRole="Driver"|"Owner"|"Principal"|string|null;
const when=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(date)};
function isWarningNotification(item:Notification){return /(warning|warn|fine|punish|suspend|moderation|violation|appeal|error)/i.test(item.category+" "+item.title)}
function destination(item:Notification,role:MemberRole){
 const href=item.href?.trim()||"/dashboard";
 if(["/quests","/quest","quests","quest","/driver-panel/quest","/team-panel/quest"].includes(href)){
  if(role==="Driver")return "/driver-panel/quest";
  if(role==="Owner"||role==="Principal")return "/team-panel/quest";
  return "/dashboard";
 }
 return href.startsWith("/")?href:"/dashboard";
}
export default function NotificationsCenter({memberId,memberRole}:{memberId:string|null;memberRole:MemberRole}){
 const [items,setItems]=useState<Notification[]>([]),[unread,setUnread]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(""),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const load=useCallback(async()=>{
  if(!supabase||!memberId){setItems([]);setUnread(0);setLoading(false);return}
  const [list,count]=await Promise.all([
   supabase.from("caleris_notifications").select("id,category,title,body,href,created_at,read_at").eq("member_id",memberId).order("created_at",{ascending:false}).limit(50),
   supabase.from("caleris_notifications").select("id",{count:"exact",head:true}).eq("member_id",memberId).is("read_at",null)
  ]);
  if(list.error)setError(list.error.message);else{setItems((list.data||[]) as Notification[]);setError("")}
  if(count.error)setError(count.error.message);else setUnread(count.count||0);
  setLoading(false);
 },[memberId]);
 useEffect(()=>{setLoading(true);void load();if(!supabase||!memberId)return;const channel=supabase.channel("caleris-notifications-header-"+memberId).on("postgres_changes",{event:"*",schema:"public",table:"caleris_notifications",filter:"member_id=eq."+memberId},()=>void load()).subscribe();return()=>{void supabase?.removeChannel(channel)}},[load,memberId]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};
  document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)};
 },[open]);
 const markRead=async(id:string)=>{
  if(!supabase||!memberId)return;
  const now=new Date().toISOString();
  const {error:requestError}=await supabase.from("caleris_notifications").update({read_at:now}).eq("id",id).eq("member_id",memberId).is("read_at",null);
  if(requestError){setError(requestError.message);return}
  setItems(current=>current.map(item=>item.id===id?{...item,read_at:now}:item));setUnread(value=>Math.max(0,value-1));
 };
 const markAll=async()=>{
  if(!supabase||!memberId||busy||unread===0)return;
  setBusy(true);const now=new Date().toISOString();
  const {error:requestError}=await supabase.from("caleris_notifications").update({read_at:now}).eq("member_id",memberId).is("read_at",null);
  if(requestError)setError(requestError.message);else{setItems(current=>current.map(item=>({...item,read_at:item.read_at||now})));setUnread(0);setError("")}
  setBusy(false);
 };
 const deleteOne=async(id:string)=>{
  if(!supabase||!memberId||busy)return;
  setBusy(true);const deletedItem=items.find(item=>item.id===id);
  const {error:requestError}=await supabase.rpc("member_delete_caleris_notification",{p_notification_id:id});
  if(requestError)setError(requestError.message);else{setItems(current=>current.filter(item=>item.id!==id));if(deletedItem&&!deletedItem.read_at)setUnread(value=>Math.max(0,value-1));setError("")}
  setBusy(false);
 };
 const deleteAll=async()=>{
  if(!supabase||!memberId||busy||!items.length)return;
  if(!window.confirm("Hapus semua notifikasi? Tindakan ini tidak dapat dibatalkan."))return;
  setBusy(true);const {error:requestError}=await supabase.rpc("member_delete_caleris_notifications");
  if(requestError)setError(requestError.message);else{setItems([]);setUnread(0);setError("")}
  setBusy(false);
 };
 if(!memberId)return null;
 return <div className="header-notifications" ref={root}>
  <button className="header-notifications-trigger" type="button" aria-label={unread?unread+" notifikasi belum dibaca":"Notifikasi"} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{const next=!open;setOpen(next);if(next)void load()}}>
   <Bell size={19}/>{unread>0&&<span className="header-notifications-count">{unread>99?"99+":unread}</span>}
  </button>
  {open&&<section className="header-notifications-popover" role="dialog" aria-label="Notifikasi CALERIS MASTERS">
   <header className="header-notifications-heading"><div><strong>Notifikasi</strong><span>{unread} belum dibaca · {items.length} terbaru</span></div><button type="button" aria-label="Tutup notifikasi" onClick={()=>setOpen(false)}><X size={17}/></button></header>
   <div className="header-notifications-actions"><button type="button" onClick={()=>void markAll()} disabled={busy||unread===0}><CheckCheck size={14}/> Tandai sudah dibaca</button><button type="button" onClick={()=>void deleteAll()} disabled={busy||items.length===0}><Trash2 size={14}/> Hapus semua notifikasi</button></div>
   {error&&<p className="header-notifications-error">{error}</p>}
   <div className="header-notifications-list">
    {loading?<p className="header-notifications-empty">Memuat notifikasi...</p>:!items.length?<p className="header-notifications-empty">Belum ada notifikasi.</p>:items.map(item=><article className={"header-notification-item"+(item.read_at?" is-read":" is-unread")} key={item.id}>
     <Link to={destination(item,memberRole)} onClick={()=>{if(!item.read_at)void markRead(item.id);setOpen(false)}}><span className="header-notification-meta">{isWarningNotification(item)&&<CaleMascot designId="reaction_warning" size={28} className="header-notification-cale"/>}{item.category.replaceAll("_"," ").toUpperCase()} · {when(item.created_at)}</span><strong>{item.title}</strong>{item.body&&<p>{item.body}</p>}<span className="header-notification-link">Buka detail <ExternalLink size={12}/></span></Link>
     {!item.read_at&&<button type="button" aria-label="Tandai sudah dibaca" title="Tandai sudah dibaca" onClick={()=>void markRead(item.id)}><CheckCheck size={15}/></button>}<button type="button" className="header-notification-delete" aria-label="Hapus notifikasi" title="Hapus notifikasi" disabled={busy} onClick={()=>void deleteOne(item.id)}><Trash2 size={15}/></button>
    </article>)}
   </div>
  </section>}
 </div>;
}
