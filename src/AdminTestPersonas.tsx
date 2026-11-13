import {useCallback,useEffect,useState} from "react";
import {RefreshCw,ShieldCheck} from "lucide-react";
import {supabase} from "./lib/supabase";
type Team={id:string;name:string};
type Persona={member_id:string;persona_label:"Owner"|"Driver";character_name:string|null;team_id:string|null;team_name:string|null;is_active:boolean};
export default function AdminTestPersonas(){
 const [teams,setTeams]=useState<Team[]>([]),[personas,setPersonas]=useState<Persona[]>([]);
 const [teamId,setTeamId]=useState(""),[ownerName,setOwnerName]=useState(""),[driverName,setDriverName]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setNotice("");
  const [{data:t,error:te},{data:p,error:pe}]=await Promise.all([supabase.from("teams").select("id,name").order("name"),supabase.rpc("admin_list_test_personas")]);
  if(te||pe)setNotice(te?.message||pe?.message||"Gagal memuat persona.");
  setTeams((t||[]) as Team[]);setPersonas((p||[]) as Persona[]);
  if(!teamId&&t?.length)setTeamId(t[0].id);
  setLoading(false);
 },[teamId]);
 useEffect(()=>{void refresh()},[refresh]);
 const create=async()=>{if(!supabase||!teamId)return;setBusy(true);setNotice("");const {error}=await supabase.rpc("admin_create_test_persona_pair",{p_team_id:teamId,p_owner_name:ownerName.trim(),p_driver_name:driverName.trim()});if(error)setNotice(error.message);else{setOwnerName("");setDriverName("");setNotice("Persona Owner dan Driver berhasil dibuat di Testing.");await refresh()}setBusy(false)};
 const switchPersona=async(memberId:string)=>{if(!supabase)return;setBusy(true);setNotice("");const {error}=await supabase.rpc("admin_switch_test_persona",{p_member_id:memberId});if(error){setNotice(error.message);setBusy(false);return}window.location.assign("/dashboard")};
 return <section className="workspace admin-test-personas">
  <header className="page-heading"><span className="section-eyebrow">ADMIN · TESTING TOOLS</span><h1 className="page-title">Admin Test Personas</h1><p className="page-description">Satu akun Admin dapat berganti konteks Owner dan Driver pada tim yang sama. Hak Admin tetap aktif.</p></header>
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">PERSONA SETUP</span><h2>Buat pasangan persona</h2></div><ShieldCheck size={22}/></div>
   <p className="muted">Pembuatan persona hanya diizinkan database yang ditandai Testing.</p>
   <label>Tim<select value={teamId} onChange={e=>setTeamId(e.target.value)}><option value="">Pilih tim</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label>Nama karakter Owner<input value={ownerName} onChange={e=>setOwnerName(e.target.value)} maxLength={80} placeholder="Nama persona Owner"/></label>
   <label>Nama karakter Driver<input value={driverName} onChange={e=>setDriverName(e.target.value)} maxLength={80} placeholder="Nama persona Driver"/></label>
   <button className="action primary" disabled={busy||loading||!teamId||ownerName.trim().length<2||driverName.trim().length<2||personas.length>0} onClick={()=>void create()}>{busy?"Memproses...":"Buat Owner + Driver"}</button>
  </section>
  <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">AVAILABLE CONTEXTS</span><h2>Persona akun Admin</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
   {loading?<p>Memuat persona...</p>:personas.length===0?<p className="muted">Belum ada pasangan persona untuk akun ini.</p>:<div className="development-token-history">{personas.map(p=><article key={p.member_id}><div><strong>{p.persona_label} · {p.character_name||"Tanpa nama"}</strong><small>{p.team_name||"Tanpa tim"}{p.is_active?" · Konteks aktif":""}</small></div><button className="action" disabled={busy||p.is_active} onClick={()=>void switchPersona(p.member_id)}>{p.is_active?"Aktif":"Gunakan persona"}</button></article>)}</div>}
  </section>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}