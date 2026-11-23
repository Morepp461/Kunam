import {useCallback,useEffect,useState} from "react";
import {Award,Building2,Flag,RefreshCw,Users} from "lucide-react";
import {supabase} from "./lib/supabase";
import {MemberProfileLink} from "./EntityProfileLink";

type Team={id:string;name:string;division_key:string|null};
type Sponsor={id:string;sponsor_id:string;contract_amount:number;annual_contract_amount:number|null;status:string;sponsor_name?:string};
type Engine={name:string;race_pace:number;qualifying_pace:number;engine_power:number};
const money=(value:number)=>"€"+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:0});

export default function TeamSummary(){
 const [team,setTeam]=useState<Team|null>(null),[sponsors,setSponsors]=useState<Sponsor[]>([]);
 const [sponsorNames,setSponsorNames]=useState<Record<string,string>>({}),[reputation,setReputation]=useState<number|null>(null);
 const [engine,setEngine]=useState<Engine|null>(null),[drivers,setDrivers]=useState<Array<{id:string;character_name:string|null}>>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);setError("");
  const {data:auth}=await supabase.auth.getUser();
  if(!auth.user){setError("Login diperlukan.");setLoading(false);return;}
  const {data:profile,error:profileError}=await supabase.from("profiles").select("member_id").eq("user_id",auth.user.id).maybeSingle();
  if(profileError||!profile?.member_id){setError(profileError?.message||"Profil member tidak ditemukan.");setLoading(false);return;}
  const {data:member,error:memberError}=await supabase.from("members").select("team_id").eq("id",profile.member_id).maybeSingle();
  if(memberError||!member?.team_id){setError(memberError?.message||"Akun belum terhubung ke tim.");setLoading(false);return;}
  const teamId=member.team_id;
  const [teamQ,sponsorQ,repQ,seasonQ,driverQ]=await Promise.all([
   supabase.from("teams").select("id,name,division_key").eq("id",teamId).maybeSingle(),
   supabase.from("caleris_sponsorship_contracts").select("id,sponsor_id,contract_amount,annual_contract_amount,status").eq("target_kind","team").eq("target_team_id",teamId).eq("status","active"),
   supabase.from("caleris_team_reputation").select("score").eq("team_id",teamId).maybeSingle(),
   supabase.from("license_seasons").select("id").eq("status","active").order("starts_on",{ascending:false}).limit(1).maybeSingle(),
   supabase.from("economy_driver_contracts").select("members:members(id,character_name)").eq("team_id",teamId).eq("status","active")
  ]);
  if(teamQ.error){setError(teamQ.error.message);setLoading(false);return;}
  setTeam(teamQ.data as Team|null);setReputation(repQ.error?null:Number(repQ.data?.score??0));
  const active=(sponsorQ.data||[]) as Sponsor[];setSponsors(active);
  const sponsorIds=[...new Set(active.map(s=>s.sponsor_id).filter(Boolean))];
  if(sponsorIds.length){const {data}=await supabase.from("caleris_sponsors").select("id,name").in("id",sponsorIds);setSponsorNames(Object.fromEntries((data||[]).map((s:any)=>[s.id,s.name])))}else setSponsorNames({});
  setDrivers((driverQ.data||[]).map((row:any)=>row.members).filter((member:any)=>member?.id));
  if(seasonQ.data){const {data:a}=await supabase.from("caleris_team_engines").select("engine:caleris_engines(name,race_pace,qualifying_pace,engine_power)").eq("team_id",teamId).eq("season_id",seasonQ.data.id).maybeSingle();setEngine((a?.engine||null) as Engine|null)}else setEngine(null);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const totalCommitment=sponsors.reduce((sum,s)=>sum+Number(s.annual_contract_amount??s.contract_amount??0),0);
 return <section className="workspace">
  <header className="page-heading"><span className="section-eyebrow">TEAM PANEL · OVERVIEW</span><h1 className="page-title">Team Summary</h1><p className="page-description">Ringkasan identitas, line-up, sponsor resmi, dan konfigurasi Engine tim.</p></header>
  {error&&<div className="license-notice" role="status">{error}</div>}
  {loading?<div className="workspace-card">Memuat ringkasan tim...</div>:!team?<div className="workspace-card">Data tim belum tersedia.</div>:<>
   <div className="ce-metrics">
    <article><Building2/><span>TEAM</span><strong>{team.name}</strong><small>{team.division_key||"Division belum ditentukan"}</small></article>
    <article><Award/><span>TEAM REPUTATION</span><strong>{reputation===null?"—":reputation.toLocaleString("id-ID")}</strong><small>Skor asli database</small></article>
    <article><Users/><span>ACTIVE DRIVERS</span><strong>{drivers.length}</strong><small>{drivers.length?drivers.map((driver,index)=><span key={driver.id}><MemberProfileLink memberId={driver.id}>{driver.character_name||"Driver"}</MemberProfileLink>{index<drivers.length-1?" · ":""}</span>):"Belum ada kontrak aktif"}</small></article>
    <article><Flag/><span>OFFICIAL SPONSORS</span><strong>{sponsors.length}</strong><small>{money(totalCommitment)} annual commitment</small></article>
   </div>
   <div className="ce-columns">
    <section className="workspace-card"><div className="ce-title"><h2>Official Sponsors</h2><span>{sponsors.length} active</span></div>
     <div className="ce-finance-summary"><span>Total active commitment</span><strong>{money(totalCommitment)}</strong></div>
     {sponsors.length?sponsors.map(s=><div className="ce-row" key={s.id}><strong>{sponsorNames[s.sponsor_id]||"Official Sponsor"}</strong><span>{money(Number(s.annual_contract_amount??s.contract_amount??0))}</span></div>):<p className="ce-empty">Belum ada kontrak sponsor aktif untuk tim ini.</p>}
    </section>
    <section className="workspace-card"><div className="ce-title"><h2>Season Engine</h2><span>ACTIVE SEASON</span></div>
     {engine?<><strong>{engine.name}</strong><div className="ce-row"><span>Race Pace</span><b>{engine.race_pace}</b></div><div className="ce-row"><span>Qualifying Pace</span><b>{engine.qualifying_pace}</b></div><div className="ce-row"><span>Engine Power</span><b>{engine.engine_power}</b></div></>:<p className="ce-empty">Belum ada Engine yang ditetapkan untuk season aktif.</p>}
    </section>
   </div>
   <div className="ce-actions"><button className="economy-secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh data</button></div>
  </>}
 </section>;
}
