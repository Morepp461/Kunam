import {useCallback,useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ShieldCheck,Trophy,RefreshCw,Save,AlertTriangle,Handshake} from "lucide-react";
import {supabase} from "./lib/supabase";

type Round={id:string;round_number:number;title:string;season_division_id:string;status:string;season_division?:{division_name:string;license_seasons?:{title:string}}};
type Member={id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string};
type Fine={id:string;target_kind:string;target_member_id:string|null;target_team_id:string|null;amount:number;reason:string;regulation_reference:string|null;issued_at:string};
type Move={id:string;driver_member_id:string;buyer_team_id:string;seller_team_id:string;move_type:string;agreed_amount:number|null;status:string};
export default function FIAOperations(){
 const [rounds,setRounds]=useState<Round[]>([]),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]),[fines,setFines]=useState<Fine[]>([]),[moves,setMoves]=useState<Move[]>([]);
 const [roundId,setRoundId]=useState(""),[winnerId,setWinnerId]=useState(""),[poleId,setPoleId]=useState("");
 const [targetKind,setTargetKind]=useState<"member"|"team">("member"),[targetId,setTargetId]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[regulation,setRegulation]=useState("");
 const [saving,setSaving]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const [r,m,t,f,mv]=await Promise.all([
   supabase.from("license_rounds").select("id,round_number,title,season_division_id,status,license_season_divisions(division_name,license_seasons(title))").eq("status","closed").order("round_number",{ascending:false}),
   supabase.from("members").select("id,character_name,role,team_id").order("character_name"),
   supabase.from("teams").select("id,name").order("name"),
   supabase.from("caleris_fines").select("*").order("issued_at",{ascending:false}).limit(100),
   supabase.from("caleris_driver_move_negotiations").select("id,driver_member_id,buyer_team_id,seller_team_id,move_type,agreed_amount,status").eq("status","pending_fia").order("created_at")
  ]);
  const error=[r.error,m.error,t.error,f.error,mv.error].find(Boolean);if(error)setNotice(error.message);
  const existing=(await supabase.from("caleris_race_results").select("round_id")).data||[];
  const used=new Set(existing.map(x=>x.round_id));
  setRounds((r.data||[]).filter(x=>!used.has(x.id)).map((x:any)=>({...x,season_division:x.license_season_divisions})) as Round[]);
  setMembers((m.data||[]) as Member[]);setTeams((t.data||[]) as Team[]);setFines((f.data||[]) as Fine[]);setMoves((mv.data||[]) as Move[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const selectedRound=rounds.find(r=>r.id===roundId);
 const eligibleDrivers=useMemo(()=>members.filter(m=>m.role==="Driver"),[members]);
 const targetOptions=targetKind==="member"?members.map(m=>({id:m.id,label:(m.character_name||"Member")+" · "+(m.role||"No role")})):teams.map(t=>({id:t.id,label:t.name}));
 const recordResult=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!roundId||!winnerId||!poleId)return;
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("fia_record_race_result",{p_round_id:roundId,p_winner_member_id:winnerId,p_pole_member_id:poleId});
  setSaving(false);if(error){setNotice(error.message);return}
  setNotice("Hasil race tersimpan. DDP/TDP hanya dibagikan jika aturan untuk divisi ini aktif.");setRoundId("");setWinnerId("");setPoleId("");await refresh();
 };
 const issueFine=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!targetId)return;
  const value=Number(amount);if(!Number.isFinite(value)||value<=0||Math.round(value*100)!==value*100){setNotice("Nominal denda tidak valid.");return}
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("fia_issue_fine",{p_target_kind:targetKind,p_target_id:targetId,p_amount:value,p_reason:reason,p_regulation_reference:regulation||null});
  setSaving(false);if(error){setNotice(error.message);return}
  setNotice("Denda berhasil dicatat dan diposting ke ledger. Saldo target dapat menjadi negatif.");setAmount("");setReason("");setRegulation("");setTargetId("");await refresh();
 };
 const targetName=(f:Fine)=>f.target_kind==="member"?members.find(m=>m.id===f.target_member_id)?.character_name||"Member":teams.find(t=>t.id===f.target_team_id)?.name||"Team";
 const reviewMove=async(id:string,approve:boolean)=>{if(!supabase)return;setSaving(true);setNotice("");const {error}=await supabase.rpc("fia_review_driver_move",{p_negotiation_id:id,p_approve:approve});setSaving(false);setNotice(error?.message||(approve?"Transfer disetujui.":"Transfer ditolak."));await refresh()};
 return <section className="workspace fia-operations">
  <header className="page-heading"><span className="section-eyebrow">FIA PANEL · RACE CONTROL</span><h1 className="page-title">Race & Punishment Operations</h1><p className="page-description">Input hasil resmi race, kelola penghargaan development, dan catat denda FIA melalui ledger ekonomi.</p></header>
  <div className="ops-grid">
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">OFFICIAL CLASSIFICATION</span><h2>Record race result</h2></div><Trophy size={19}/></div>
    <form className="economy-form" onSubmit={recordResult}>
     <label>Closed round<select value={roundId} onChange={e=>{setRoundId(e.target.value);setWinnerId("");setPoleId("")}} required><option value="">Pilih round yang sudah ditutup</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.season_division?.license_seasons?.title||"Season"} · {r.season_division?.division_name||"Division"} · R{r.round_number} · {r.title}</option>)}</select></label>
     <label>Race winner<select value={winnerId} onChange={e=>setWinnerId(e.target.value)} required><option value="">Pilih driver pemenang</option>{eligibleDrivers.map(m=><option key={m.id} value={m.id}>{m.character_name||"Driver"}</option>)}</select></label>
     <label>Pole sitter<select value={poleId} onChange={e=>setPoleId(e.target.value)} required><option value="">Pilih pole sitter</option>{eligibleDrivers.map(m=><option key={m.id} value={m.id}>{m.character_name||"Driver"}</option>)}</select></label>
     {selectedRound&&<p className="economy-form-hint">{selectedRound.season_division?.division_name} · {selectedRound.season_division?.license_seasons?.title}. Database memvalidasi bahwa kedua driver terdaftar pada divisi round tersebut.</p>}
     <button className="economy-primary-button" disabled={saving||!roundId||!winnerId||!poleId}><Save size={15}/>{saving?"Menyimpan...":"Simpan hasil resmi"}</button>
    </form>
   </section>
   <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">FIA DISCIPLINARY</span><h2>Issue fine</h2></div><AlertTriangle size={19}/></div>
    <form className="economy-form" onSubmit={issueFine}>
     <label>Jenis target<select value={targetKind} onChange={e=>{setTargetKind(e.target.value as "member"|"team");setTargetId("")}}><option value="member">Member</option><option value="team">Team</option></select></label>
     <label>Target<select value={targetId} onChange={e=>setTargetId(e.target.value)} required><option value="">Pilih target</option>{targetOptions.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
     <label>Nominal denda (¢p)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
     <label>Regulation reference<input value={regulation} onChange={e=>setRegulation(e.target.value)} maxLength={120} placeholder="Opsional"/></label>
     <label>Alasan denda<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} required/></label>
     <p className="economy-form-hint">Dana masuk ke VreeoBank. Sesuai aturan Economy Engine, denda dapat membuat wallet target menjadi negatif.</p>
     <button className="economy-primary-button" disabled={saving||!targetId}><ShieldCheck size={15}/>{saving?"Memproses...":"Terbitkan denda"}</button>
    </form>
   </section>
  </div>
  <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">TRANSFER REVIEW</span><h2>Driver transfer approvals</h2></div><Handshake size={19}/></div>{moves.length===0?<p className="economy-empty">Tidak ada transfer yang menunggu FIA.</p>:<div className="ops-record-list">{moves.map(m=><article key={m.id}><div><strong>{members.find(x=>x.id===m.driver_member_id)?.character_name||"Driver"} · {money(m.agreed_amount||0)}</strong><small>{teams.find(x=>x.id===m.buyer_team_id)?.name||"Buyer"} ← {teams.find(x=>x.id===m.seller_team_id)?.name||"Seller"} · {m.move_type.toUpperCase()}</small></div><div className="ops-record-actions"><button onClick={()=>void reviewMove(m.id,true)} disabled={saving}>Approve</button><button onClick={()=>void reviewMove(m.id,false)} disabled={saving}>Reject</button></div></article>)}</div>}</section>
  <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">DISCIPLINARY RECORD</span><h2>Fine history</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
   {fines.length===0?<p className="economy-empty">Belum ada denda FIA.</p>:<div className="ops-record-list">{fines.map(f=><article key={f.id}><div><strong>{targetName(f)} · {money(f.amount)}</strong><small>{f.reason}{f.regulation_reference?" · "+f.regulation_reference:""} · {new Date(f.issued_at).toLocaleString("id-ID")}</small></div><span className="empty-tag">{f.target_kind.toUpperCase()}</span></article>)}</div>}
  </section>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
const money=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
