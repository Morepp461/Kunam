import { useCallback, useEffect, useState } from "react";
import { Activity, Award, BarChart3, Crown, Newspaper, RefreshCw, Trophy, Wallet } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./caleris-ecosystem.css";
type Mode = "owner" | "finance" | "news" | "hall";
type NewsItem = { id:string; title:string; body:string; category:string; date:string; source:string };
type TeamInfo = { id:string; name:string; division_key:string|null };
type Standing = { id:string; final_position:number|null; final_points:number|null; driver_name_snapshot?:string|null; team_name_snapshot?:string|null; season_division_id:string };
const currency=(v:number)=>"€"+new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(v||0);
const dateLabel=(v:string)=>new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
export default function CalerisEcosystem({mode}:{mode:Mode}){
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[team,setTeam]=useState<TeamInfo|null>(null);
 const [wallet,setWallet]=useState(0),[valuation,setValuation]=useState<number|null>(null),[reputation,setReputation]=useState<number|null>(null);
 const [development,setDevelopment]=useState<{part_key:string;current_value:number}[]>([]);
 const [contracts,setContracts]=useState<{id:string;member_id:string;annual_salary:number;status:string;driver_name:string}[]>([]);
 const [raceForm,setRaceForm]=useState<{id:string;round_id:string;finishing_position:number|null;finish_status:string;driver_name_snapshot:string|null}[]>([]);
 const [hqFacilities,setHqFacilities]=useState<{facility_key:string;level:number;condition:number;asset_value:number}[]>([]);
 const [loanRisk,setLoanRisk]=useState({active:0,overdue:0});
 const [teamTarget,setTeamTarget]=useState<{vision:string|null;long_term_target:string|null}>({vision:null,long_term_target:null});
 const [sponsors,setSponsors]=useState<{id:string;contract_amount:number;annual_contract_amount:number|null;status:string}[]>([]);
 const [news,setNews]=useState<NewsItem[]>([]);
 const [achievements,setAchievements]=useState<{id:string;title:string;description:string|null;awarded_at:string;target_kind:string}[]>([]);
 const [drivers,setDrivers]=useState<Standing[]>([]),[teams,setTeams]=useState<Standing[]>([]),[refreshKey,setRefreshKey]=useState(0);
 const [driverRecords,setDriverRecords]=useState<{name:string;starts:number;wins:number;podiums:number;fastestLaps:number}[]>([]);
 const [teamRecords,setTeamRecords]=useState<{name:string;starts:number;wins:number;podiums:number}[]>([]);
 const [teamHistories,setTeamHistories]=useState<{team_id:string;history:string|null;founded_year:number|null}[]>([]);
 const load=useCallback(async()=>{
  if(!supabase){setError("Koneksi Supabase belum tersedia.");setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const {data:auth}=await supabase.auth.getUser();if(!auth.user)throw new Error("Login diperlukan untuk membuka modul ini.");
   const {data:profile}=await supabase.from("profiles").select("member_id").eq("user_id",auth.user.id).maybeSingle();
   let currentTeam:TeamInfo|null=null;
   if(profile?.member_id){const {data:member}=await supabase.from("members").select("team_id").eq("id",profile.member_id).maybeSingle();if(member?.team_id){const {data}=await supabase.from("teams").select("id,name,division_key").eq("id",member.team_id).maybeSingle();currentTeam=data as TeamInfo|null;}}
   setTeam(currentTeam);
   if(currentTeam){
    const [walletRes,valueRes,repRes,devRes,sponsorRes,loanRes,hqRes,profileRes,seasonRes]=await Promise.all([
     supabase.from("economy_wallet_accounts").select("balance").eq("account_kind","team").eq("team_id",currentTeam.id).maybeSingle(),
     supabase.from("caleris_team_valuations").select("total_valuation").eq("team_id",currentTeam.id).order("assessed_at",{ascending:false}).limit(1).maybeSingle(),
     supabase.from("caleris_team_reputation").select("score").eq("team_id",currentTeam.id).maybeSingle(),
     supabase.from("caleris_team_development_parts").select("part_key,current_value").eq("team_id",currentTeam.id).order("part_key"),
     supabase.from("caleris_sponsorship_contracts").select("id,contract_amount,annual_contract_amount,status").eq("target_kind","team").eq("target_team_id",currentTeam.id).eq("status","active"),
     supabase.from("economy_cash_loans").select("total_due,amount_repaid,status").eq("loan_type","team").eq("team_id",currentTeam.id).in("status",["active","overdue"]),
     supabase.from("caleris_team_hq_facilities").select("facility_key,level,condition,asset_value").eq("team_id",currentTeam.id),
     supabase.from("caleris_team_profiles").select("vision,long_term_target").eq("team_id",currentTeam.id).maybeSingle(),
     supabase.from("license_seasons").select("id").neq("status","draft").order("starts_on",{ascending:false}).limit(1).maybeSingle()
    ]);
    if(walletRes.error)throw walletRes.error;setWallet(Number(walletRes.data?.balance??0));
    setValuation(valueRes.error?null:Number(valueRes.data?.total_valuation??0));setReputation(repRes.error?null:Number(repRes.data?.score??0));
    setDevelopment((devRes.data??[]) as {part_key:string;current_value:number}[]);
    setSponsors((sponsorRes.data??[]) as {id:string;contract_amount:number;annual_contract_amount:number|null;status:string}[]);
    setLoanRisk({active:(loanRes.data??[]).reduce((sum:any,row:any)=>sum+Math.max(0,Number(row.total_due)-Number(row.amount_repaid)),0),overdue:(loanRes.data??[]).filter((row:any)=>row.status==="overdue").reduce((sum:any,row:any)=>sum+Math.max(0,Number(row.total_due)-Number(row.amount_repaid)),0)});
    setHqFacilities((hqRes.data??[]) as {facility_key:string;level:number;condition:number;asset_value:number}[]);
    setTeamTarget({vision:profileRes.data?.vision??null,long_term_target:profileRes.data?.long_term_target??null});
    if(seasonRes.data?.id){
      const {data:seasonContracts}=await supabase.from("economy_driver_contracts").select("id,member_id,annual_salary,status").eq("team_id",currentTeam.id).eq("season_id",seasonRes.data.id).eq("status","active");
      const memberIds=(seasonContracts??[]).map((row:any)=>row.member_id);
      const {data:memberRows}=memberIds.length?await supabase.from("members").select("id,character_name").in("id",memberIds):{data:[]};
      const nameMap=new Map((memberRows??[]).map((m:any)=>[m.id,m.character_name]));
      setContracts((seasonContracts??[]).map((row:any)=>({...row,driver_name:nameMap.get(row.member_id)??"Driver"})));
    }else setContracts([]);
    const {data:publishedRaces}=await supabase.from("caleris_race_results").select("round_id").not("published_at","is",null);
    const publishedRoundIds=[...new Set((publishedRaces??[]).map((row:any)=>row.round_id).filter(Boolean))];
    if(publishedRoundIds.length){
      const {data:entries}=await supabase.from("caleris_race_result_entries").select("id,round_id,finishing_position,finish_status,driver_name_snapshot").eq("team_id",currentTeam.id).in("round_id",publishedRoundIds).order("recorded_at",{ascending:false}).limit(8);
      setRaceForm((entries??[]) as any);
    }else setRaceForm([]);
   }else{setWallet(0);setValuation(null);setReputation(null);setDevelopment([]);setSponsors([]);setContracts([]);setRaceForm([]);setHqFacilities([]);setLoanRisk({active:0,overdue:0});setTeamTarget({vision:null,long_term_target:null});}
   if(mode==="news"){
    const [ann,stories,races]=await Promise.all([
     supabase.from("caleris_announcements").select("id,title,body,category,published_at,created_at").eq("is_published",true).order("published_at",{ascending:false}).limit(30),
     supabase.from("caleris_sponsorship_story_events").select("id,headline,body,event_type,visibility,created_at").eq("visibility","public").order("created_at",{ascending:false}).limit(20),
     supabase.from("caleris_race_results").select("id,round_id,published_at").not("published_at","is",null).order("published_at",{ascending:false}).limit(20)
    ]);
    const items:NewsItem[]=[
     ...(ann.data??[]).map((x:any)=>({id:x.id,title:x.title,body:x.body,category:x.category??"Announcement",date:x.published_at??x.created_at,source:"FIA Announcement"})),
     ...(stories.data??[]).map((x:any)=>({id:x.id,title:x.headline,body:x.body,category:x.event_type??"Paddock Story",date:x.created_at,source:"Paddock Story"}))
    ];
    if(races.data?.length){const roundIds=[...new Set(races.data.map((x:any)=>x.round_id).filter(Boolean))];const {data:rounds}=await supabase.from("license_rounds").select("id,title,circuit_name,round_number").in("id",roundIds);const roundMap=new Map((rounds??[]).map((x:any)=>[x.id,x]));for(const race of races.data as any[]){const round=roundMap.get(race.round_id) as any;items.push({id:race.id,title:round?.title??"Official race result",body:[round?.circuit_name,round?.round_number?"Round "+round.round_number:""].filter(Boolean).join(" · "),category:"Race Result",date:race.published_at,source:"Official Classification"});}}
    setNews(items.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,40));
   }
   if(mode==="hall"){
    const [ach,driverRows,teamRows,publishedRows,historyRows]=await Promise.all([
     supabase.from("caleris_achievements").select("id,title,description,awarded_at,target_kind").order("awarded_at",{ascending:false}).limit(100),
     supabase.from("license_final_standings").select("id,final_position,final_points,driver_name_snapshot,team_name_snapshot,season_division_id").eq("final_position",1).order("updated_at",{ascending:false}).limit(50),
     supabase.from("license_team_final_standings").select("id,final_position,final_points,team_name_snapshot,season_division_id").eq("final_position",1).order("updated_at",{ascending:false}).limit(50),
     supabase.from("caleris_race_results").select("round_id").not("published_at","is",null),
     supabase.from("caleris_team_profiles").select("team_id,history,founded_year").not("history","is",null)
    ]);
    setAchievements((ach.data??[]) as any);setDrivers((driverRows.data??[]) as Standing[]);setTeams((teamRows.data??[]) as Standing[]);
    setTeamHistories((historyRows.data??[]) as any);
    const roundIds=[...new Set((publishedRows.data??[]).map((row:any)=>row.round_id).filter(Boolean))];
    if(roundIds.length){
     const {data:entries}=await supabase.from("caleris_race_result_entries").select("driver_name_snapshot,team_name_snapshot,finishing_position,fastest_lap_ms").in("round_id",roundIds);
     const dm=new Map<string,{name:string;starts:number;wins:number;podiums:number;fastestLaps:number}>();
     const tm=new Map<string,{name:string;starts:number;wins:number;podiums:number}>();
     for(const row of entries??[]){
      const dn=String(row.driver_name_snapshot??"Unknown Driver");const d=dm.get(dn)??{name:dn,starts:0,wins:0,podiums:0,fastestLaps:0};
      d.starts++;if(row.finishing_position===1)d.wins++;if(row.finishing_position!==null&&row.finishing_position<=3)d.podiums++;if(row.fastest_lap_ms!==null)d.fastestLaps++;dm.set(dn,d);
      const tn=String(row.team_name_snapshot??"Unknown Team");const t=tm.get(tn)??{name:tn,starts:0,wins:0,podiums:0};
      t.starts++;if(row.finishing_position===1)t.wins++;if(row.finishing_position!==null&&row.finishing_position<=3)t.podiums++;tm.set(tn,t);
     }
     setDriverRecords([...dm.values()].sort((x,y)=>y.wins-x.wins||y.podiums-x.podiums||y.starts-x.starts).slice(0,10));
     setTeamRecords([...tm.values()].sort((x,y)=>y.wins-x.wins||y.podiums-x.podiums||y.starts-x.starts).slice(0,10));
    }else{setDriverRecords([]);setTeamRecords([]);}
   }
  }catch(e){setError(e instanceof Error?e.message:"Data gagal dimuat.");}finally{setLoading(false);}
 },[mode,refreshKey]);
 useEffect(()=>{void load();},[load]);
 const titles:Record<Mode,[string,string,string]>={owner:["Team Owner Command Center","STRATEGIC OPERATIONS","Ringkasan kondisi tim dari sumber data resmi CALERIS."],finance:["Financial Intelligence Center","FINANCIAL INTELLIGENCE","Pantau kas tim, valuasi, sponsorship aktif, dan kondisi aset."],news:["Caleris Newsroom","PADDOCK MEDIA","Berita resmi, hasil balapan, cerita sponsorship, dan perkembangan paddock."],hall:["Hall of Fame & Historical Archive","CALERIS HISTORY","Arsip juara, pencapaian, dan catatan resmi lintas musim."]};
 const [title,eyebrow,description]=titles[mode];
 if(loading)return <section className="workspace caleris-ecosystem"><p>Memuat data resmi...</p></section>;
 return <section className="workspace caleris-ecosystem">
  <header className="ce-heading"><div><span className="section-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><button onClick={()=>setRefreshKey(v=>v+1)}><RefreshCw size={15}/> Refresh</button></header>
  {error&&<p className="ce-error">{error}</p>}
  {(mode==="owner"||mode==="finance")&&<>{!team?<div className="workspace-card"><p>Akun ini belum terhubung ke tim. Informasi keuangan tim hanya tersedia untuk anggota tim yang berwenang.</p></div>:<>
   <div className="ce-metrics"><article><Wallet/><span>TEAM WALLET</span><strong>{currency(wallet)}</strong></article><article><BarChart3/><span>TEAM VALUATION</span><strong>{valuation===null?"—":currency(valuation)}</strong></article><article><Award/><span>REPUTATION SCORE</span><strong>{reputation===null?"—":reputation}</strong></article><article><Activity/><span>ACTIVE SPONSORS</span><strong>{sponsors.length}</strong></article></div>
   <div className="ce-columns"><section className="workspace-card"><div className="ce-title"><h2>Driver Contracts</h2><span>{contracts.length} active</span></div>{contracts.length?contracts.map(contract=><div className="ce-row" key={contract.id}><strong>{contract.driver_name}</strong><span>{currency(Number(contract.annual_salary))} / season</span></div>):<p className="ce-empty">Belum ada kontrak driver aktif pada season terbaru.</p>}</section><section className="workspace-card"><div className="ce-title"><h2>HQ Facilities</h2><span>{hqFacilities.length} facilities</span></div>{hqFacilities.map(f=><div className="ce-row" key={f.facility_key}><strong>{f.facility_key.replaceAll("_"," ")}</strong><span>Lv. {f.level} · {Number(f.condition).toFixed(0)}%</span></div>)}{!hqFacilities.length&&<p className="ce-empty">Data fasilitas belum tersedia.</p>}</section></div>
   <div className="ce-columns"><section className="workspace-card"><div className="ce-title"><h2>Financial Risk</h2><span>Active team loans</span></div><div className="ce-finance-summary"><span>Outstanding debt</span><strong>{currency(loanRisk.active)}</strong></div><div className="ce-finance-summary"><span>Overdue exposure</span><strong>{currency(loanRisk.overdue)}</strong></div></section><section className="workspace-card"><div className="ce-title"><h2>Season Target</h2><span>Team strategy</span></div><p className="ce-note">{teamTarget.vision||"Visi tim belum ditentukan."}</p><strong>{teamTarget.long_term_target||"Target jangka panjang belum ditentukan."}</strong></section></div>
   <section className="workspace-card"><div className="ce-title"><h2>Recent Race Performance</h2><span>Published official results</span></div>{raceForm.length?raceForm.map(entry=><div className="ce-row" key={entry.id}><strong>{entry.driver_name_snapshot??"Driver"}</strong><span>{entry.finishing_position?"P"+entry.finishing_position:entry.finish_status}</span></div>):<p className="ce-empty">Belum ada hasil balapan resmi yang dipublikasikan untuk tim ini.</p>}</section>
   <div className="ce-columns"><section className="workspace-card"><div className="ce-title"><h2>Active Sponsorship</h2><span>{sponsors.length} contracts</span></div>{sponsors.length?sponsors.map(s=><div className="ce-row" key={s.id}><strong>Contract</strong><span>{currency(Number(s.annual_contract_amount??s.contract_amount))} / season</span></div>):<p className="ce-empty">Belum ada kontrak sponsorship aktif.</p>}</section><section className="workspace-card"><div className="ce-title"><h2>Car Development</h2><span>{development.length} attributes</span></div>{development.slice(0,8).map(p=><div className="ce-development" key={p.part_key}><span>{p.part_key.replaceAll("_"," ")}</span><strong>{Number(p.current_value).toFixed(0)}</strong><i><b style={{width:Math.max(0,Math.min(100,Number(p.current_value)))+"%"}}/></i></div>)}{!development.length&&<p className="ce-empty">Data development belum tersedia.</p>}</section></div>
   <section className="workspace-card"><div className="ce-title"><h2>Financial Intelligence</h2><span>Official Economy Engine</span></div><p className="ce-note">Saldo diambil langsung dari wallet tim. Transaksi dan pembayaran tetap dikelola oleh Economy Engine, tidak ada saldo bayangan di dashboard ini.</p><div className="ce-finance-summary"><span>Available cash</span><strong>{currency(wallet)}</strong></div><div className="ce-finance-summary"><span>Active sponsor commitment</span><strong>{currency(sponsors.reduce((sum,s)=>sum+Number(s.annual_contract_amount??s.contract_amount),0))}</strong></div></section>
  </>}</>}
  {mode==="news"&&<div className="ce-news-list">{news.map(item=><article className="ce-news-card" key={item.id}><div><span className="section-eyebrow">{item.source} · {item.category}</span><time>{dateLabel(item.date)}</time></div><h2>{item.title}</h2><p>{item.body}</p></article>)}{!news.length&&<div className="workspace-card ce-empty"><Newspaper/><strong>Belum ada berita yang dipublikasikan.</strong></div>}</div>}
  {mode==="hall"&&<div className="ce-hall-grid">
      <section className="workspace-card"><div className="ce-title"><h2>All-time Driver Records</h2><span>Official results</span></div>{driverRecords.map((r,i)=><div className="ce-hall-row" key={r.name}><Trophy/><div><strong>#{i+1} {r.name}</strong><small>{r.wins} wins · {r.podiums} podiums · {r.fastestLaps} fastest laps · {r.starts} starts</small></div></div>)}{!driverRecords.length&&<p className="ce-empty">Belum ada statistik historis resmi.</p>}</section>
      <section className="workspace-card"><div className="ce-title"><h2>All-time Constructor Records</h2><span>Official results</span></div>{teamRecords.map((r,i)=><div className="ce-hall-row" key={r.name}><Award/><div><strong>#{i+1} {r.name}</strong><small>{r.wins} wins · {r.podiums} podiums · {r.starts} entries</small></div></div>)}{!teamRecords.length&&<p className="ce-empty">Belum ada statistik konstruktor historis.</p>}</section>
      <section className="workspace-card ce-achievements"><div className="ce-title"><h2>Team History Archive</h2><span>{teamHistories.length} records</span></div>{teamHistories.map(item=><div className="ce-achievement" key={item.team_id}><strong>{item.founded_year??"—"} · Team history</strong><p>{item.history}</p></div>)}{!teamHistories.length&&<p className="ce-empty">Belum ada sejarah tim yang dicatat.</p>}</section><section className="workspace-card"><div className="ce-title"><h2><Crown size={18}/> Driver Champions</h2><span>{drivers.length} records</span></div>{drivers.map(x=><div className="ce-hall-row" key={x.id}><Trophy/><div><strong>{x.driver_name_snapshot??"Driver"}</strong><small>{x.team_name_snapshot??"Team"} · {x.final_points??0} points</small></div></div>)}{!drivers.length&&<p className="ce-empty">Belum ada juara pembalap yang difinalisasi.</p>}</section><section className="workspace-card"><div className="ce-title"><h2><Trophy size={18}/> Constructor Champions</h2><span>{teams.length} records</span></div>{teams.map(x=><div className="ce-hall-row" key={x.id}><Award/><div><strong>{x.team_name_snapshot??"Team"}</strong><small>{x.final_points??0} points</small></div></div>)}{!teams.length&&<p className="ce-empty">Belum ada juara konstruktor yang difinalisasi.</p>}</section><section className="workspace-card ce-achievements"><div className="ce-title"><h2><Award size={18}/> Achievement Archive</h2><span>{achievements.length} records</span></div>{achievements.map(a=><div className="ce-achievement" key={a.id}><strong>{a.title}</strong><p>{a.description}</p><small>{a.target_kind} · {dateLabel(a.awarded_at)}</small></div>)}{!achievements.length&&<p className="ce-empty">Belum ada achievement yang tercatat.</p>}</section></div>}
 </section>;
}
