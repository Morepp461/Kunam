import {useCallback,useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ShieldCheck,Trophy,RefreshCw,Save,AlertTriangle,Handshake} from "lucide-react";
import {supabase} from "./lib/supabase";

type Round={id:string;round_number:number;title:string;season_division_id:string;status:string;season_division?:{division_name:string;license_seasons?:{title:string}}};
type Member={id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string};
type Fine={id:string;target_kind:string;target_member_id:string|null;target_team_id:string|null;amount:number;reason:string;regulation_reference:string|null;issued_at:string};
type Move={id:string;driver_member_id:string;buyer_team_id:string;seller_team_id:string;move_type:string;agreed_amount:number|null;loan_starts_on:string|null;loan_ends_on:string|null;loan_salary_share_percent:number|null;status:string};
type Takeover={id:string;target_team_id:string;buyer_member_id:string;seller_member_id:string;agreed_amount:number|null;status:string};
export default function FIAOperations(){
 const [rounds,setRounds]=useState<Round[]>([]),[classificationRounds,setClassificationRounds]=useState<Round[]>([]),[members,setMembers]=useState<Member[]>([]),[teams,setTeams]=useState<Team[]>([]),[fines,setFines]=useState<Fine[]>([]),[moves,setMoves]=useState<Move[]>([]),[takeovers,setTakeovers]=useState<Takeover[]>([]),[registrations,setRegistrations]=useState<{member_id:string;season_division_id:string}[]>([]);
 const [roundId,setRoundId]=useState(""),[winnerId,setWinnerId]=useState(""),[poleId,setPoleId]=useState("");
 const [classificationRoundId,setClassificationRoundId]=useState(""),[classificationMemberId,setClassificationMemberId]=useState(""),[classificationStatus,setClassificationStatus]=useState<"finished"|"dnf"|"dns"|"dsq">("finished"),[classificationPosition,setClassificationPosition]=useState(""),[classificationNote,setClassificationNote]=useState(""),[fastestLap,setFastestLap]=useState("");
 const [targetKind,setTargetKind]=useState<"member"|"team">("member"),[targetId,setTargetId]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[regulation,setRegulation]=useState("");
 const [saving,setSaving]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const [r,m,t,f,mv,tv,reg]=await Promise.all([
   supabase.from("license_rounds").select("id,round_number,title,season_division_id,status,license_season_divisions(division_name,license_seasons(title))").eq("status","closed").order("round_number",{ascending:false}),
   supabase.from("caleris_member_directory").select("id,character_name,role,team_id").order("character_name"),
   supabase.from("caleris_team_directory").select("id,name").order("name"),
   supabase.from("caleris_fines").select("*").order("issued_at",{ascending:false}).limit(100),
   supabase.from("caleris_driver_move_negotiations").select("id,driver_member_id,buyer_team_id,seller_team_id,move_type,agreed_amount,loan_starts_on,loan_ends_on,loan_salary_share_percent,status").eq("status","pending_fia").order("created_at"),
   supabase.from("caleris_team_takeovers").select("id,target_team_id,buyer_member_id,seller_member_id,agreed_amount,status").eq("status","pending_fia").order("created_at"),
   supabase.from("license_season_members").select("member_id,season_division_id").eq("is_hiatus",false)
  ]);
  const error=[r.error,m.error,t.error,f.error,mv.error,tv.error,reg.error].find(Boolean);if(error)setNotice(error.message);
  const existing=(await supabase.from("caleris_race_results").select("round_id")).data||[];
  const used=new Set(existing.map(x=>x.round_id));
  setClassificationRounds((r.data||[]).map((x:any)=>({...x,season_division:x.license_season_divisions})) as Round[]);
  setRounds((r.data||[]).filter(x=>!used.has(x.id)).map((x:any)=>({...x,season_division:x.license_season_divisions})) as Round[]);
  setRegistrations((reg.data||[]) as {member_id:string;season_division_id:string}[]);
  setMembers((m.data||[]) as Member[]);setTeams((t.data||[]) as Team[]);setFines((f.data||[]) as Fine[]);setMoves((mv.data||[]) as Move[]);setTakeovers((tv.data||[]) as Takeover[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const selectedRound=rounds.find(r=>r.id===roundId);
 const selectedClassificationRound=classificationRounds.find(r=>r.id===classificationRoundId);
 const eligibleClassificationDrivers=useMemo(()=>members.filter(m=>m.role==="Driver"&&registrations.some(x=>x.member_id===m.id&&x.season_division_id===selectedClassificationRound?.season_division_id)),[members,registrations,selectedClassificationRound]);
 const eligibleDrivers=useMemo(()=>members.filter(m=>m.role==="Driver"),[members]);
 const targetOptions=targetKind==="member"?members.map(m=>({id:m.id,label:(m.character_name||"Member")+" · "+(m.role||"No role")})):teams.map(t=>({id:t.id,label:t.name}));
 const recordResult=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!roundId||!winnerId||!poleId)return;
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("fia_record_race_result",{p_round_id:roundId,p_winner_member_id:winnerId,p_pole_member_id:poleId});
  setSaving(false);if(error){setNotice(error.message);return}
  setNotice("Hasil race tersimpan. DDP/TDP hanya dibagikan jika aturan untuk divisi ini aktif.");setRoundId("");setWinnerId("");setPoleId("");await refresh();
 };
 const recordClassification=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!classificationRoundId||!classificationMemberId)return;
  const position=classificationStatus==="finished"?Number(classificationPosition):null;
  const lapMatch=fastestLap.trim().match(/^(\d{1,3}):(\d{2})[.,](\d{3})$/);const fastestLapMs=fastestLap.trim()?lapMatch?Number(lapMatch[1])*60000+Number(lapMatch[2])*1000+Number(lapMatch[3]):null:null;
  if(fastestLap.trim()&&!fastestLapMs){setNotice("Format fastest lap harus m:ss.mmm, contoh 1:32.456.");return;}
  if(classificationStatus==="finished"&&(!Number.isInteger(position)||Number(position)<1)){setNotice("Finishing position harus berupa angka bulat positif.");return;}
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("fia_record_race_result_entry",{p_round_id:classificationRoundId,p_member_id:classificationMemberId,p_finish_status:classificationStatus,p_finishing_position:position,p_note:classificationNote||null,p_fastest_lap_ms:fastestLapMs});
  setSaving(false);if(error){setNotice(error.message);return;}
  setNotice("Klasifikasi driver berhasil dicatat.");setClassificationMemberId("");setClassificationPosition("");setClassificationNote("");setFastestLap("");await refresh();
 };
 const issueFine=async(e:FormEvent)=>{
  e.preventDefault();if(!supabase||!targetId)return;
  const value=Number(amount);if(!Number.isFinite(value)||value<=0||Number(value.toFixed(2))!==value){setNotice("Nominal denda tidak valid.");return}
  setSaving(true);setNotice("");
  const {error}=await supabase.rpc("fia_issue_fine",{p_target_kind:targetKind,p_target_id:targetId,p_amount:value,p_reason:reason,p_regulation_reference:regulation||null});
  setSaving(false);if(error){setNotice(error.message);return}
  setNotice("Denda berhasil dicatat dan diposting ke ledger. Saldo target dapat menjadi negatif.");setAmount("");setReason("");setRegulation("");setTargetId("");await refresh();
 };
 const targetName=(f:Fine)=>f.target_kind==="member"?members.find(m=>m.id===f.target_member_id)?.character_name||"Member":teams.find(t=>t.id===f.target_team_id)?.name||"Team";
 const reviewMove=async(id:string,approve:boolean)=>{if(!supabase)return;setSaving(true);setNotice("");const {error}=await supabase.rpc("fia_review_driver_move",{p_negotiation_id:id,p_approve:approve});setSaving(false);const current=moves.find(x=>x.id===id);setNotice(error?.message||(approve?(current?.move_type==="loan"?"Driver Loan disetujui. Aktivasi menunggu tanggal mulai dan saldo tim peminjam.":"Transfer disetujui dan menunggu Transfer Window."):"Perpindahan Driver ditolak."));await refresh()};
 const reviewTakeover=async(id:string,approve:boolean)=>{if(!supabase)return;setSaving(true);setNotice("");const {error}=await supabase.rpc("fia_review_team_takeover",{p_takeover_id:id,p_approve:approve});setSaving(false);setNotice(error?.message||(approve?"Take Over selesai: pembayaran dan perpindahan kepemilikan tercatat di ledger.":"Take Over ditolak."));await refresh()};
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
  <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">OFFICIAL CLASSIFICATION</span><h2>Race classification detail</h2></div><Trophy size={19}/></div>
   <form className="economy-form" onSubmit={recordClassification}>
    <label>Closed round<select value={classificationRoundId} onChange={e=>{setClassificationRoundId(e.target.value);setClassificationMemberId("");}} required><option value="">Pilih round</option>{classificationRounds.map(r=><option key={r.id} value={r.id}>{r.season_division?.license_seasons?.title||"Season"} · {r.season_division?.division_name||"Division"} · R{r.round_number} · {r.title}</option>)}</select></label>
    <label>Registered driver<select value={classificationMemberId} onChange={e=>setClassificationMemberId(e.target.value)} required><option value="">Pilih driver terdaftar</option>{eligibleClassificationDrivers.map(m=><option key={m.id} value={m.id}>{m.character_name||"Driver"}</option>)}</select></label>
    <label>Finish status<select value={classificationStatus} onChange={e=>{setClassificationStatus(e.target.value as typeof classificationStatus);setClassificationPosition("");}}><option value="finished">Finished</option><option value="dnf">DNF</option><option value="dns">DNS</option><option value="dsq">DSQ</option></select></label>
    {classificationStatus==="finished"&&<label>Finishing position<input type="number" min="1" step="1" value={classificationPosition} onChange={e=>setClassificationPosition(e.target.value)} required/></label>}
    <label>Fastest lap time (optional)<input value={fastestLap} onChange={e=>setFastestLap(e.target.value)} placeholder="m:ss.mmm · contoh 1:32.456"/></label><label>Notes (optional)<textarea rows={2} maxLength={500} value={classificationNote} onChange={e=>setClassificationNote(e.target.value)}/></label>
    <p className="economy-form-hint">FIA hanya dapat mencatat driver yang terdaftar pada divisi round. Status finish, DNF, DNS, dan DSQ disimpan sebagai klasifikasi resmi. Fastest lap yang dicatat menjadi sumber pembaruan lap record Circuit Pool.</p>
    <button className="economy-primary-button" disabled={saving||!classificationRoundId||!classificationMemberId}><Save size={15}/>{saving?"Menyimpan...":"Simpan klasifikasi"}</button>
   </form>
  </section>
  <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">TRANSFER REVIEW</span><h2>Driver transfer approvals</h2></div><Handshake size={19}/></div>{moves.length===0?<p className="economy-empty">Tidak ada transfer yang menunggu FIA.</p>:<div className="ops-record-list">{moves.map(m=><article key={m.id}><div><strong>{members.find(x=>x.id===m.driver_member_id)?.character_name||"Driver"} · {money(m.agreed_amount||0)}</strong><small>{teams.find(x=>x.id===m.buyer_team_id)?.name||"Buyer"} ← {teams.find(x=>x.id===m.seller_team_id)?.name||"Seller"} · {m.move_type.toUpperCase()}{m.move_type==="loan"?` · ${m.loan_starts_on} → ${m.loan_ends_on} · Peminjam ${m.loan_salary_share_percent}% / Asal ${100-(m.loan_salary_share_percent||0)}%`:""}</small></div><div className="ops-record-actions"><button onClick={()=>void reviewMove(m.id,true)} disabled={saving}>Approve</button><button onClick={()=>void reviewMove(m.id,false)} disabled={saving}>Reject</button></div></article>)}</div>}</section>
  <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">TEAM ACQUISITION REVIEW</span><h2>Take Over approvals</h2></div></div>{takeovers.length===0?<p className="economy-empty">Tidak ada Take Over yang menunggu FIA.</p>:<div className="ops-record-list">{takeovers.map(t=><article key={t.id}><div><strong>{teams.find(x=>x.id===t.target_team_id)?.name||"Team"} · {money(t.agreed_amount||0)}</strong><small>Buyer: {members.find(x=>x.id===t.buyer_member_id)?.character_name||"Member"} · Seller: {members.find(x=>x.id===t.seller_member_id)?.character_name||"Member"}</small></div><div className="ops-record-actions"><button onClick={()=>void reviewTakeover(t.id,true)} disabled={saving}>Approve</button><button onClick={()=>void reviewTakeover(t.id,false)} disabled={saving}>Reject</button></div></article>)}</div>}<p className="economy-form-hint">Persetujuan FIA langsung mengeksekusi pembayaran dari personal wallet pembeli ke Team Owner wallet penjual, lalu mengubah pembeli menjadi Owner dan melepas Owner lama dari tim.</p></section>
  <section className="economy-panel"><div className="economy-panel-heading"><div><span className="section-eyebrow">DISCIPLINARY RECORD</span><h2>Fine history</h2></div><button className="economy-secondary-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
   {fines.length===0?<p className="economy-empty">Belum ada denda FIA.</p>:<div className="ops-record-list">{fines.map(f=><article key={f.id}><div><strong>{targetName(f)} · {money(f.amount)}</strong><small>{f.reason}{f.regulation_reference?" · "+f.regulation_reference:""} · {new Date(f.issued_at).toLocaleString("id-ID")}</small></div><span className="empty-tag">{f.target_kind.toUpperCase()}</span></article>)}</div>}
  </section>
  {notice&&<div className="license-notice" role="status">{notice}</div>}
 </section>;
}
const money=(n:number)=>"¢p "+Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:2});
