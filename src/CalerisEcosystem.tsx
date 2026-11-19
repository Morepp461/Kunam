import { useCallback, useEffect, useState } from "react";
import { Activity, Award, BarChart3, Crown, Newspaper, RefreshCw, Trophy, Wallet } from "lucide-react";
import { supabase } from "./lib/supabase";
import "./caleris-ecosystem.css";
type Mode = "owner" | "finance" | "news" | "hall";
type NewsItem = { id:string; title:string; body:string; category:string; date:string; source:string; imageUrl?:string|null; lead?:string; facts?:string[] };
type TeamInfo = { id:string; name:string; division_key:string|null };
type Standing = { id:string; final_position:number|null; final_points:number|null; driver_name_snapshot?:string|null; team_name_snapshot?:string|null; season_division_id:string };
const currency=(v:number)=>"€"+new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(v||0);
const dateLabel=(v:string)=>new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
const newsroomCategory=(value:string)=>({general:"Umum",sporting:"Olahraga",disciplinary:"Disiplin",schedule:"Jadwal",administrative:"Administrasi",announcement:"Pengumuman",sponsorship:"Sponsorship",sponsor:"Sponsorship",contract_signed:"Kontrak Baru",contract_renewed:"Perpanjangan Kontrak",contract_ended:"Akhir Kerja Sama","Official Classification":"Hasil Balapan"}[value]??value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase()));
const newsroomSource=(value:string)=>({"Official Bulletin":"Papan Pengumuman","Paddock Report":"Kabar Paddock","Race Desk":"Meja Redaksi Balap"}[value]??value);
const raceEditorial=(id:string,winnerName:string,poleName:string|null,roundTitle:string,location:string)=>{
 const angles=[
  ["Amankan Kemenangan di "+roundTitle,winnerName+" tercatat sebagai pemenang "+roundTitle+" dalam klasifikasi resmi."],
  ["Sorotan "+roundTitle+": "+winnerName+" Teratas","Nama "+winnerName+" berada di posisi teratas klasifikasi resmi "+roundTitle+"."],
  ["Peta Persaingan "+roundTitle+" Terjawab","Klasifikasi resmi "+roundTitle+" menempatkan "+winnerName+" sebagai pemenang."],
  ["Dari Garis Start ke Hasil Akhir","Catatan resmi "+roundTitle+" memastikan "+winnerName+" sebagai pemenang balapan."],
  ["Hasil Resmi "+roundTitle+": "+winnerName+" Jadi Nama Utama","Meja redaksi merangkum hasil yang sudah dipublikasikan. "+winnerName+" tercatat sebagai pemenang."],
  ["Satu Nama di Puncak "+roundTitle+": "+winnerName,"Klasifikasi akhir yang dipublikasikan menempatkan "+winnerName+" di posisi pemenang."]
 ];
 const hash=[...id].reduce((sum,char)=>sum+char.charCodeAt(0),0),angle=angles[hash%angles.length];
 return {title:angle[0].includes(winnerName)?angle[0]:winnerName+" "+angle[0],lead:angle[1],body:["Klasifikasi resmi "+roundTitle+" kini sudah dipublikasikan.",winnerName+" tercatat sebagai pemenang berdasarkan hasil resmi.",poleName?poleName+" tercatat sebagai peraih pole position.":null,location?"Catatan lokasi: "+location+".":null].filter(Boolean).join("\n\n")};
};

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
 const [news,setNews]=useState<NewsItem[]>([]),[selectedArticle,setSelectedArticle]=useState<NewsItem|null>(null);
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
     supabase.from("caleris_announcements").select("id,title,body,category,division_key,published_at,created_at").eq("is_published",true).order("published_at",{ascending:false}).limit(30),
     supabase.from("caleris_sponsorship_story_events").select("id,headline,body,event_type,visibility,created_at,contract_id").eq("visibility","public").order("created_at",{ascending:false}).limit(20),
     supabase.from("caleris_race_results").select("id,round_id,winner_member_id,pole_member_id,published_at").not("published_at","is",null).order("published_at",{ascending:false}).limit(20)
    ]);
    const items:NewsItem[]=[
     ...(ann.data??[]).map((x:any)=>({id:x.id,title:x.title,body:x.body,lead:String(x.body??"").split(/\n|(?<=[.!?])\s/)[0]?.slice(0,260)??"",category:newsroomCategory(String(x.category??"Pengumuman")),date:x.published_at??x.created_at,source:"Papan Pengumuman",facts:[x.division_key?String(x.division_key).toUpperCase():"CALERIS MASTERS"]})),
     ...(stories.data??[]).map((x:any)=>({id:x.id,title:x.headline,body:x.body,lead:String(x.body??"").split(/\n|(?<=[.!?])\s/)[0]?.slice(0,260)??"",category:newsroomCategory(String(x.event_type??"Kabar Paddock")),date:x.created_at,source:"Kabar Paddock"}))
    ];
    if(stories.data?.length){
     const contractIds=[...new Set(stories.data.map((x:any)=>x.contract_id).filter(Boolean))];
     const {data:storyContracts}=contractIds.length?await supabase.from("caleris_sponsorship_contracts").select("id,target_team_id").in("id",contractIds):{data:[] as any[]};
     const storyTeamIds=[...new Set((storyContracts??[]).map((x:any)=>x.target_team_id).filter(Boolean))];
     const {data:storyTeams}=storyTeamIds.length?await supabase.from("caleris_team_profiles").select("team_id,logo_url").in("team_id",storyTeamIds):{data:[] as any[]};
     const contractMap=new Map((storyContracts??[]).map((x:any)=>[x.id,x.target_team_id]));
     const logoMap=new Map((storyTeams??[]).map((x:any)=>[x.team_id,x.logo_url]));
     for(const item of items.filter(x=>x.source==="Kabar Paddock")){const source=(stories.data??[]).find((x:any)=>x.id===item.id);const teamId=contractMap.get(source?.contract_id);item.imageUrl=teamId?logoMap.get(teamId)??null:null;}
    }
    if(races.data?.length){
     const roundIds=[...new Set(races.data.map((x:any)=>x.round_id).filter(Boolean))];
     const memberIds=[...new Set(races.data.flatMap((x:any)=>[x.winner_member_id,x.pole_member_id]).filter(Boolean))];
     const [rounds,members]=await Promise.all([
      supabase.from("license_rounds").select("id,title,circuit_name,round_number").in("id",roundIds),
      supabase.from("members").select("id,character_name,team_id").in("id",memberIds)
     ]);
     const roundMap=new Map((rounds.data??[]).map((x:any)=>[x.id,x]));
     const memberMap=new Map((members.data??[]).map((x:any)=>[x.id,x]));
     const teamIds=[...new Set((members.data??[]).map((x:any)=>x.team_id).filter(Boolean))];
     const [profiles,teamProfiles]=await Promise.all([
      memberIds.length?supabase.from("profiles").select("member_id,avatar_url").in("member_id",memberIds):Promise.resolve({data:[] as any[]}),
      teamIds.length?supabase.from("caleris_team_profiles").select("team_id,logo_url").in("team_id",teamIds):Promise.resolve({data:[] as any[]})
     ]);
     const avatarMap=new Map((profiles.data??[]).map((x:any)=>[x.member_id,x.avatar_url]));
     const logoMap=new Map((teamProfiles.data??[]).map((x:any)=>[x.team_id,x.logo_url]));
     for(const race of races.data as any[]){
      const round=roundMap.get(race.round_id) as any,winner=memberMap.get(race.winner_member_id) as any,pole=memberMap.get(race.pole_member_id) as any;
      const location=[round?.circuit_name,round?.round_number?"ROUND "+round.round_number:null].filter(Boolean).join(" · ");
      const winnerName=winner?.character_name??"Pemenang belum tercatat";
      const roundTitle=round?.title??"Putaran ini";
      const editorial=raceEditorial(race.id,winnerName,pole?.character_name??null,roundTitle,location);
      items.push({id:race.id,title:editorial.title,body:editorial.body,lead:editorial.lead,category:(["Kemenangan","Klasifikasi Resmi","Sorotan Putaran","Catatan Balapan","Hasil Balapan","Sorotan Pole Position"][[...race.id].reduce((sum,char)=>sum+char.charCodeAt(0),0)%6]),date:race.published_at,source:"Meja Redaksi Balap",imageUrl:avatarMap.get(race.winner_member_id)??(winner?.team_id?logoMap.get(winner.team_id):null)??null,facts:[location,winner?"PEMENANG · "+winnerName:null,pole?"POLE POSITION · "+pole.character_name:null].filter(Boolean) as string[]});
     }
    }
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
 const titles:Record<Mode,[string,string,string]>={owner:["Team Owner Command Center","STRATEGIC OPERATIONS","Ringkasan kondisi tim dari sumber data resmi CALERIS."],finance:["Financial Intelligence Center","FINANCIAL INTELLIGENCE","Pantau kas tim, valuasi, sponsorship aktif, dan kondisi aset."],news:["Caleris Newsroom","KABAR PADDOCK","Hasil balapan, kabar tim, cerita sponsor, dan pengumuman resmi Caleris Masters."],hall:["Hall of Fame & Historical Archive","CALERIS HISTORY","Arsip juara, pencapaian, dan catatan resmi lintas musim."]};
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
  {mode==="news"&&<div className="vp-newsroom">
   <div className="vp-masthead"><div className="vp-masthead-side">KABAR PADDOCK<br/>SEJAK CALERIS</div><div className="vp-masthead-title">Vreeo Pedia</div><div className="vp-masthead-side vp-masthead-right">JURNAL RESMI<br/>DUNIA BALAP</div></div>
   <div className="vp-edition"><span>CALERIS MASTERS · BERITA & HASIL RESMI</span><span>{news.length} BERITA EDISI INI</span></div>
   {news.length? <div className="vp-paper-grid">{news.map((item,index)=><button type="button" className={index===0?"vp-story vp-story-lead":`vp-story ${index%4===1?"vp-story-photo":index%4===2?"vp-story-brief":index%4===3?"vp-story-note":"vp-story-standard"}`} key={item.id} onClick={()=>setSelectedArticle(item)}>
    <div className="vp-story-meta"><span>{newsroomSource(item.source)} / {item.category}</span><time>{dateLabel(item.date)}</time></div>
    {item.imageUrl&&<img className="vp-story-image" src={item.imageUrl} alt="" loading="lazy"/>}
    <h2>{item.title}</h2><p className="vp-story-leadtext">{item.lead||item.body.slice(0,220)}</p>
    {item.facts?.length? <div className="vp-story-facts">{item.facts.map((fact,i)=><span key={i}>{fact}</span>)}</div>:null}
    <span className="vp-read">BACA SELENGKAPNYA ↗</span>
   </button>)}</div>:<div className="vp-empty"><Newspaper/><strong>Belum ada berita di edisi ini</strong><span>Berita resmi, hasil balapan, dan kabar paddock akan muncul di sini setelah dipublikasikan.</span></div>}
   {selectedArticle&&<div className="vp-reader-backdrop" role="presentation" onClick={()=>setSelectedArticle(null)}><article className="vp-reader" role="dialog" aria-modal="true" aria-labelledby="vp-reader-title" onClick={e=>e.stopPropagation()}>
    <button type="button" className="vp-reader-close" onClick={()=>setSelectedArticle(null)}>TUTUP ✕</button><div className="vp-reader-masthead">VREEO PEDIA <span>KABAR PADDOCK</span></div>
    <div className="vp-reader-meta">{selectedArticle.source} · {selectedArticle.category} · {dateLabel(selectedArticle.date)}</div>
    <h2 id="vp-reader-title">{selectedArticle.title}</h2>
    {selectedArticle.imageUrl&&<img className="vp-reader-image" src={selectedArticle.imageUrl} alt=""/>}
    {selectedArticle.lead&&<p className="vp-reader-lead">{selectedArticle.lead}</p>}
    <div className="vp-reader-body">{selectedArticle.body.split("\n").map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>
    {selectedArticle.facts?.length?<div className="vp-reader-facts"><h3>FAKTA RESMI</h3>{selectedArticle.facts.map((fact,i)=><p key={i}>{fact}</p>)}</div>:null}
    <footer>VREEO PEDIA · MEDIA RESMI CALERIS MASTERS</footer>
   </article></div>}
  </div>}
  {mode==="hall"&&<div className="ce-hall-grid">
      <section className="workspace-card"><div className="ce-title"><h2>All-time Driver Records</h2><span>Official results</span></div>{driverRecords.map((r,i)=><div className="ce-hall-row" key={r.name}><Trophy/><div><strong>#{i+1} {r.name}</strong><small>{r.wins} wins · {r.podiums} podiums · {r.fastestLaps} fastest laps · {r.starts} starts</small></div></div>)}{!driverRecords.length&&<p className="ce-empty">Belum ada statistik historis resmi.</p>}</section>
      <section className="workspace-card"><div className="ce-title"><h2>All-time Constructor Records</h2><span>Official results</span></div>{teamRecords.map((r,i)=><div className="ce-hall-row" key={r.name}><Award/><div><strong>#{i+1} {r.name}</strong><small>{r.wins} wins · {r.podiums} podiums · {r.starts} entries</small></div></div>)}{!teamRecords.length&&<p className="ce-empty">Belum ada statistik konstruktor historis.</p>}</section>
      <section className="workspace-card ce-achievements"><div className="ce-title"><h2>Team History Archive</h2><span>{teamHistories.length} records</span></div>{teamHistories.map(item=><div className="ce-achievement" key={item.team_id}><strong>{item.founded_year??"—"} · Team history</strong><p>{item.history}</p></div>)}{!teamHistories.length&&<p className="ce-empty">Belum ada sejarah tim yang dicatat.</p>}</section><section className="workspace-card"><div className="ce-title"><h2><Crown size={18}/> Driver Champions</h2><span>{drivers.length} records</span></div>{drivers.map(x=><div className="ce-hall-row" key={x.id}><Trophy/><div><strong>{x.driver_name_snapshot??"Driver"}</strong><small>{x.team_name_snapshot??"Team"} · {x.final_points??0} points</small></div></div>)}{!drivers.length&&<p className="ce-empty">Belum ada juara pembalap yang difinalisasi.</p>}</section><section className="workspace-card"><div className="ce-title"><h2><Trophy size={18}/> Constructor Champions</h2><span>{teams.length} records</span></div>{teams.map(x=><div className="ce-hall-row" key={x.id}><Award/><div><strong>{x.team_name_snapshot??"Team"}</strong><small>{x.final_points??0} points</small></div></div>)}{!teams.length&&<p className="ce-empty">Belum ada juara konstruktor yang difinalisasi.</p>}</section><section className="workspace-card ce-achievements"><div className="ce-title"><h2><Award size={18}/> Achievement Archive</h2><span>{achievements.length} records</span></div>{achievements.map(a=><div className="ce-achievement" key={a.id}><strong>{a.title}</strong><p>{a.description}</p><small>{a.target_kind} · {dateLabel(a.awarded_at)}</small></div>)}{!achievements.length&&<p className="ce-empty">Belum ada achievement yang tercatat.</p>}</section></div>}
 </section>;
}
