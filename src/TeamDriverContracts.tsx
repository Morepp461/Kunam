import {useCallback,useEffect,useMemo,useState} from "react";
import {Banknote,FileSignature,ShieldCheck} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import "./team-contracts.css";
type Member={id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string};
type Season={id:string;title:string;status:string};
type Contract={id:string;season_id:string;team_id:string;member_id:string;annual_salary:number;status:string;members?:{character_name:string|null}};
type Claim={id:string;period_id:string;member_id:string;amount:number;status:string;paid_at:string|null;season_id:string};
export default function TeamDriverContracts({session,isAdmin}:{session:Session;isAdmin:boolean}){
 const [member,setMember]=useState<Member|null>(null),[teams,setTeams]=useState<Team[]>([]),[seasons,setSeasons]=useState<Season[]>([]),[drivers,setDrivers]=useState<Member[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[claims,setClaims]=useState<Claim[]>([]);
 const [teamId,setTeamId]=useState(""),[seasonId,setSeasonId]=useState(""),[driverId,setDriverId]=useState(""),[salary,setSalary]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{if(!supabase)return;const authUser=session.user;
  const [profile,teamRows,seasonRows,driverRows]=await Promise.all([supabase.from("profiles").select("member_id").eq("user_id",authUser.id).maybeSingle(),supabase.from("teams").select("id,name").order("name"),supabase.from("license_seasons").select("id,title,status").order("created_at",{ascending:false}),supabase.from("members").select("id,character_name,role,team_id").eq("role","Driver").order("character_name")]);
  const current=profile.data?.member_id?await supabase.from("members").select("id,character_name,role,team_id").eq("id",profile.data.member_id).maybeSingle():{data:null};
  setMember((current.data||null) as Member|null);setTeams((teamRows.data||[]) as Team[]);setSeasons((seasonRows.data||[]) as Season[]);setDrivers((driverRows.data||[]) as Member[]);
  const own=current.data?.team_id||"";const chosen=teamId||(isAdmin?teamRows.data?.[0]?.id||"":own);if(!teamId&&chosen)setTeamId(chosen);
  if(chosen){const [c,p]=await Promise.all([supabase.from("economy_driver_contracts").select("*,members(character_name)").eq("team_id",chosen).order("created_at",{ascending:false}),supabase.from("economy_payroll_claims").select("id,period_id,member_id,amount,status,paid_at,season_id").eq("team_id",chosen).order("created_at",{ascending:false})]);if(c.error||p.error)setNotice(c.error?.message||p.error?.message||"Gagal memuat kontrak.");setContracts((c.data||[]) as Contract[]);setClaims((p.data||[]) as Claim[])}else{setContracts([]);setClaims([])}
 },[isAdmin,teamId]);
 useEffect(()=>{void load()},[load]);
 const owner=member?.role==="Owner"&&Boolean(member.team_id);const canManage=isAdmin||owner;
 const availableDrivers=useMemo(()=>drivers.filter(d=>d.team_id===teamId),[drivers,teamId]);
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase||!canManage||!teamId||!seasonId||!driverId)return;const amount=Number(salary);if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100){setNotice("Gaji tahunan harus lebih besar dari nol dan maksimal dua desimal.");return}
  setBusy(true);const {error}=await supabase.from("economy_driver_contracts").upsert({season_id:seasonId,team_id:teamId,member_id:driverId,annual_salary:amount,status:"active",created_by:session.user.id,updated_by:session.user.id},{onConflict:"season_id,member_id"});setBusy(false);if(error)setNotice(error.message);else{setNotice("Kontrak gaji berhasil disimpan.");setSalary("");setDriverId("");await load()}
 };
 const updateStatus=async(c:Contract,status:string)=>{if(!supabase||!canManage)return;setBusy(true);const {error}=await supabase.from("economy_driver_contracts").update({status}).eq("id",c.id);setBusy(false);if(error)setNotice(error.message);else{setNotice("Status kontrak diperbarui.");await load()}};
 const season=seasons.find(s=>s.id===seasonId);
 return <section className="workspace team-contracts"><header className="team-contracts-heading"><div><span className="section-eyebrow">TEAM PANEL · FINANCIAL MANAGEMENT</span><h1>Driver Contracts</h1><p>Atur gaji tahunan Driver per season. Payroll dibayarkan otomatis pada round terakhir setiap Race Period.</p></div><span><FileSignature size={16}/> CONTRACTS</span></header>
  {notice&&<div className="team-contracts-notice">{notice}</div>}
  <section className="team-contracts-card"><div className="team-contracts-fields"><label>Tim<select value={teamId} disabled={!isAdmin} onChange={e=>setTeamId(e.target.value)}>{teams.filter(t=>isAdmin||t.id===member?.team_id).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Season<select value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Pilih season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label></div>
   {!canManage?<p className="team-contracts-muted"><ShieldCheck size={16}/> Pengaturan kontrak hanya tersedia untuk Team Owner.</p>:<form className="team-contracts-form" onSubmit={create}><label>Driver<select required value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Pilih Driver</option>{availableDrivers.map(d=><option key={d.id} value={d.id}>{d.character_name||"Driver"}</option>)}</select></label><label>Gaji per tahun (¢p)<input type="number" min="0.01" step="0.01" required value={salary} onChange={e=>setSalary(e.target.value)} placeholder="Masukkan gaji tahunan"/></label><button disabled={busy||!seasonId||!driverId}><Banknote size={16}/>{busy?"Menyimpan...":"Simpan kontrak"}</button></form>}
   {season&&<p className="team-contracts-muted">Payroll season {season.title} dibagi rata berdasarkan jumlah Race Period yang terdaftar. Nilai pembayaran menggunakan pembulatan dua desimal; selisih pembulatan disesuaikan pada Race Period terakhir.</p>}
  </section>
  <section className="team-contracts-card"><div className="team-contracts-section-title"><div><span className="section-eyebrow">CURRENT CONTRACTS</span><h2>Kontrak Driver</h2></div><span>{contracts.length} kontrak</span></div>
   {contracts.length===0?<p className="team-contracts-muted">Belum ada kontrak pada tim dan season yang dipilih.</p>:contracts.filter(c=>!seasonId||c.season_id===seasonId).map(c=><article className="team-contract-row" key={c.id}><div><strong>{c.members?.character_name||drivers.find(d=>d.id===c.member_id)?.character_name||"Driver"}</strong><small>{seasons.find(s=>s.id===c.season_id)?.title||"Season"} · ¢p {Number(c.annual_salary).toLocaleString("id-ID",{maximumFractionDigits:2})}/tahun</small><small>Status: {c.status} · {claims.filter(x=>x.member_id===c.member_id&&x.season_id===c.season_id).length} payroll period</small></div>{canManage&&<select value={c.status} disabled={busy||claims.some(x=>x.member_id===c.member_id&&x.season_id===c.season_id)} onChange={e=>void updateStatus(c,e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="ended">Ended</option></select>}</article>)}
  </section>
 </section>
}