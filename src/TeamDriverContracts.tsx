import {useCallback,useEffect,useMemo,useState} from "react";
import {FileSignature,RefreshCw,ShieldCheck} from "lucide-react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import {MemberProfileLink,TeamProfileLink} from "./EntityProfileLink";
import "./team-contracts.css";
type Member={id:string;public_member_id:string;character_name:string|null;role:string|null;team_id:string|null};
type Team={id:string;name:string};
type Season={id:string;title:string;status:string};
type Contract={id:string;season_id:string;team_id:string;member_id:string;annual_salary:number;status:string;members?:{character_name:string|null;license:string|null}[]};
type Claim={id:string;period_id:string;member_id:string;amount:number;status:string;paid_at:string|null;season_id:string};
type PayrollSplit={id:string;claim_id:string;payer_team_id:string;member_id:string;season_id:string;period_id:string;origin_team_id:string;amount:number;share_percent:number;status:string;paid_at:string|null};
type SalaryBand={license_label:string;salary_min_eur:number;salary_max_eur:number;license_tier:string};
const cash=(value:number)=>"€ "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:2});
const licenseLabel=(value:string|null|undefined)=>String(value||"").trim().toUpperCase()==="A"?"Super License":value||"Lisensi belum tersedia";
export default function TeamDriverContracts({session,isAdmin}:{session:Session;isAdmin:boolean}){
 const [member,setMember]=useState<Member|null>(null),[teams,setTeams]=useState<Team[]>([]),[seasons,setSeasons]=useState<Season[]>([]);
 const [drivers,setDrivers]=useState<Member[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[claims,setClaims]=useState<Claim[]>([]),[payrollSplits,setPayrollSplits]=useState<PayrollSplit[]>([]),[salaryBands,setSalaryBands]=useState<SalaryBand[]>([]);
 const [teamId,setTeamId]=useState(""),[seasonId,setSeasonId]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!supabase)return;setBusy(true);
  const [profile,teamRows,seasonRows,driverRows]=await Promise.all([
   supabase.from("profiles").select("member_id").eq("user_id",session.user.id).maybeSingle(),
   supabase.from("teams").select("id,name").order("name"),
   supabase.from("license_seasons").select("id,title,status").order("created_at",{ascending:false}),
   supabase.from("caleris_member_directory").select("id,public_member_id,character_name,role,team_id").eq("role","Driver").order("character_name")
  ]);
  const current=profile.data?.member_id?await supabase.from("members").select("id,character_name,role,team_id").eq("id",profile.data.member_id).maybeSingle():{data:null,error:null};
  if(profile.error||teamRows.error||seasonRows.error||driverRows.error||current.error){setNotice(profile.error?.message||teamRows.error?.message||seasonRows.error?.message||driverRows.error?.message||current.error?.message||"Gagal memuat data kontrak.");setBusy(false);return;}
  const own=current.data as Member|null;const nextTeams=(teamRows.data||[]) as Team[];
  setMember(own);setTeams(nextTeams);setSeasons((seasonRows.data||[]) as Season[]);setDrivers((driverRows.data||[]) as Member[]);
  const chosen=own?.team_id||(isAdmin?teamId||nextTeams[0]?.id||"":"");if(chosen!==teamId)setTeamId(chosen);
  if(!chosen){setContracts([]);setClaims([]);setPayrollSplits([]);setBusy(false);return;}
  const [c,p,s,b]=await Promise.all([
   supabase.from("economy_driver_contracts").select("*,members(character_name,license)").eq("team_id",chosen).order("created_at",{ascending:false}),
   supabase.from("economy_payroll_claims").select("id,period_id,member_id,amount,status,paid_at,season_id").eq("team_id",chosen).order("created_at",{ascending:false}),
   supabase.from("economy_payroll_claim_splits").select("id,claim_id,payer_team_id,member_id,season_id,period_id,origin_team_id,amount,share_percent,status,paid_at").eq("payer_team_id",chosen).order("created_at",{ascending:false}),
   supabase.from("caleris_driver_salary_bands").select("license_label,license_tier,salary_min_eur,salary_max_eur").order("sort_order")
  ]);
  if(c.error||p.error||s.error||b.error)setNotice(c.error?.message||p.error?.message||s.error?.message||b.error?.message||"Gagal memuat detail kontrak.");else setNotice("");
  setContracts((c.data||[]) as Contract[]);setClaims((p.data||[]) as Claim[]);setPayrollSplits((s.data||[]) as PayrollSplit[]);setSalaryBands((b.data||[]) as SalaryBand[]);setBusy(false);
 },[isAdmin,teamId,session.user.id]);
 useEffect(()=>{void load()},[load]);
 const visibleContracts=useMemo(()=>contracts.filter(c=>!seasonId||c.season_id===seasonId),[contracts,seasonId]);
 const owner=member?.role==="Owner"&&Boolean(member.team_id);const selectedTeam=teams.find(t=>t.id===teamId);const selectedSeason=seasons.find(s=>s.id===seasonId);
 return <section className="workspace team-contracts">
  <header className="team-contracts-heading"><div><span className="section-eyebrow">TEAM PANEL · FINANCIAL MANAGEMENT</span><h1>Driver Contracts</h1><p>Daftar kontrak Driver yang sudah disepakati. Nilai gaji terkunci dan hanya berubah setelah kontrak berakhir atau status Driver berubah melalui workflow resmi.</p></div><span><FileSignature size={16}/> CONTRACT RECORDS</span></header>
  {notice&&<div className="team-contracts-notice" role="status">{notice}</div>}
  <section className="team-contracts-card"><div className="team-contracts-fields">
   <label>Tim<select value={teamId} disabled={!isAdmin} onChange={e=>setTeamId(e.target.value)}>{teams.filter(t=>isAdmin||t.id===member?.team_id).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label>Season<select value={seasonId} onChange={e=>setSeasonId(e.target.value)}><option value="">Semua season</option>{seasons.map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></label>
  </div>{selectedTeam&&<p className="team-contracts-muted">Menampilkan kontrak milik <TeamProfileLink teamId={selectedTeam.id}>{selectedTeam.name}</TeamProfileLink>. {selectedSeason?"Filter season "+selectedSeason.title+".":"Pilih season untuk mempersempit daftar."}</p>}{!owner&&!isAdmin&&<p className="team-contracts-muted"><ShieldCheck size={16}/> Data kontrak hanya tersedia untuk Team Owner.</p>}</section>
  <section className="team-contracts-card"><div className="team-contracts-section-title"><div><span className="section-eyebrow">AGREED CONTRACTS</span><h2>Kontrak Driver</h2></div><span>{visibleContracts.length} kontrak</span></div>
   {busy?<p className="team-contracts-muted">Memuat kontrak...</p>:visibleContracts.length===0?<p className="team-contracts-muted">Belum ada kontrak untuk tim dan season yang dipilih.</p>:visibleContracts.map(c=><article className="team-contract-row" key={c.id}><div><strong><MemberProfileLink memberId={drivers.find(d=>d.id===c.member_id)?.public_member_id}>{c.members?.[0]?.character_name||drivers.find(d=>d.id===c.member_id)?.character_name||"Driver"}</MemberProfileLink></strong><small>{licenseLabel(c.members?.[0]?.license)} · {seasons.find(s=>s.id===c.season_id)?.title||"Season"}</small><small>Gaji tahunan: {cash(c.annual_salary)} · {claims.filter(x=>x.member_id===c.member_id&&x.season_id===c.season_id).length} payroll period</small>
     {(()=>{const band=salaryBands.find(b=>b.license_label.toLowerCase()===String(c.members?.[0]?.license||"").toLowerCase());return band&&Number(c.annual_salary)>=Number(band.salary_min_eur)&&Number(c.annual_salary)<=Number(band.salary_max_eur)?<small className="team-contracts-muted">Band resmi: {cash(Number(band.salary_min_eur))} – {cash(Number(band.salary_max_eur))}</small>:<small className="team-contracts-legacy">LEGACY DATA · di luar rentang lisensi resmi saat ini</small>})()}</div><span className="team-contracts-muted">{c.status==="pending_registration"?"Menunggu registrasi FIA":c.status==="active"?"Active":c.status==="suspended"?"Suspended":"Ended"}</span></article>)}
  </section>
  <section className="team-contracts-card"><div className="team-contracts-section-title"><div><span className="section-eyebrow">PAYROLL CONTRIBUTION</span><h2>Riwayat pembagian gaji</h2></div><span>{payrollSplits.length} pembayaran</span></div>
   {payrollSplits.length===0?<p className="team-contracts-muted">Belum ada pembayaran gaji yang dibebankan ke tim ini.</p>:payrollSplits.map(split=><article className="team-contract-row" key={split.id}><div><strong><MemberProfileLink memberId={drivers.find(d=>d.id===split.member_id)?.public_member_id}>{drivers.find(d=>d.id===split.member_id)?.character_name||"Driver"}</MemberProfileLink></strong><small>{seasons.find(s=>s.id===split.season_id)?.title||"Season"} · {split.share_percent}% bagian tim · {split.status}</small><small>{cash(split.amount)}{split.paid_at?" · "+new Date(split.paid_at).toLocaleDateString("id-ID"):" · Menunggu saldo tim"}</small></div><span className="team-contracts-muted">{split.status==="paid"?"Paid":"Pending"}</span></article>)}
  </section><div className="team-contracts-footer"><button className="economy-secondary-button" onClick={()=>void load()} disabled={busy}><RefreshCw size={14}/> Refresh data</button></div>
 </section>;
}