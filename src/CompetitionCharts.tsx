import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "./lib/supabase";

export type CompetitionChartMode = "driver-ranking" | "team-ranking" | "engine-ranking" | "statistic" | "comparison";
type ChartRow = { name: string; points: number; wins: number; starts?: number; division?: string };
type ChartState = { loading: boolean; season: string; rows: ChartRow[]; message: string };
const TITLES: Record<CompetitionChartMode,string> = { "driver-ranking":"Driver Ranking", "team-ranking":"Team Ranking", "engine-ranking":"Engine Ranking", statistic:"Competition Statistics", comparison:"Driver Comparison" };
function divisionMatches(name:string,division:string){if(division==="global")return true;const value=name.toLowerCase();return division==="caleris-premio"?value.includes("premio"):value.includes("zwei");}

export default function CompetitionCharts({mode,divisionKey}:{mode:CompetitionChartMode;divisionKey:string}){
 const [state,setState]=useState<ChartState>({loading:true,season:"",rows:[],message:""});
 useEffect(()=>{let active=true;const load=async()=>{
  setState({loading:true,season:"",rows:[],message:""});
  if(!supabase){setState({loading:false,season:"",rows:[],message:"Koneksi database belum tersedia."});return;}
  try{
   const {data:activeSeason,error:activeError}=await supabase.from("license_seasons").select("id,title").eq("status","active").order("starts_on",{ascending:false}).limit(1).maybeSingle();
   if(activeError)throw activeError;
   let season=activeSeason;
   if(!season){const {data:completedSeason,error:completedError}=await supabase.from("license_seasons").select("id,title").eq("status","completed").order("ends_on",{ascending:false}).limit(1).maybeSingle();if(completedError)throw completedError;season=completedSeason;}
   if(!season){if(active)setState({loading:false,season:"",rows:[],message:"Belum ada season aktif atau season selesai untuk divisualisasikan."});return;}
   const {data,error}=await supabase.rpc("caleris_get_season_community_data",{p_season:season.id});if(error)throw error;
   const divisions=Array.isArray(data?.divisions)?data.divisions:[];
   const selectedDivisions=divisions.filter((division:any)=>divisionMatches(String(division.division_name||""),divisionKey));
   const divisionIds=new Set(selectedDivisions.map((division:any)=>String(division.id)));
   const rounds=(Array.isArray(data?.rounds)?data.rounds:[]).filter((round:any)=>divisionIds.has(String(round.season_division_id)));
   const roundById=new Map(rounds.map((round:any)=>[String(round.id),round]));
   const entries=(Array.isArray(data?.race_results)?data.race_results:[]).filter((entry:any)=>roundById.has(String(entry.round_id)));
   const driverNames=new Map<string,string>(),teamNames=new Map<string,string>(),winCounts=new Map<string,number>();
   entries.forEach((entry:any)=>{const memberId=String(entry.member_id||""),teamId=String(entry.team_id||"");if(memberId&&!driverNames.has(memberId)&&entry.driver_name_snapshot)driverNames.set(memberId,String(entry.driver_name_snapshot));if(teamId&&!teamNames.has(teamId)&&entry.team_name_snapshot)teamNames.set(teamId,String(entry.team_name_snapshot));if(memberId&&Number(entry.finishing_position)===1)winCounts.set(memberId,(winCounts.get(memberId)||0)+1);});
   const standingsSource=Array.isArray(data?.current_driver_standings)&&data.current_driver_standings.length?data.current_driver_standings:data?.driver_standings;
   const standings=(Array.isArray(standingsSource)?standingsSource:[]).filter((row:any)=>divisionIds.has(String(row.season_division_id)));
   const driverRows:ChartRow[]=standings.map((row:any)=>({name:driverNames.get(String(row.member_id))||("Driver "+String(row.member_id||"").slice(0,6)),points:Number(row.final_points??row.points_total??0),wins:winCounts.get(String(row.member_id))||0,division:selectedDivisions.find((division:any)=>String(division.id)===String(row.season_division_id))?.division_name||""})).sort((a,b)=>b.points-a.points);
   let rows:ChartRow[]=[],message="";
   if(mode==="driver-ranking"){rows=driverRows.slice(0,12);if(!rows.length)message="Belum ada klasemen Driver resmi pada season ini.";}
   else if(mode==="team-ranking"){const teams=(Array.isArray(data?.team_standings)?data.team_standings:[]).filter((row:any)=>divisionIds.has(String(row.season_division_id)));rows=teams.map((row:any)=>({name:teamNames.get(String(row.team_id))||("Team "+String(row.team_id||"").slice(0,6)),points:Number(row.final_points||0),wins:0})).sort((a,b)=>b.points-a.points).slice(0,12);if(!rows.length)message="Belum ada klasemen Team resmi pada season ini.";}
   else if(mode==="statistic"){rows=rounds.filter((round:any)=>!round.session_type||String(round.session_type).toLowerCase()==="race").sort((a:any,b:any)=>Number(a.round_number)-Number(b.round_number)).map((round:any)=>{const raceEntries=entries.filter((entry:any)=>String(entry.round_id)===String(round.id));return{name:"R"+round.round_number,points:raceEntries.length,wins:raceEntries.filter((entry:any)=>Number(entry.finishing_position)===1).length,starts:raceEntries.length,division:round.division_name||""};});if(!rows.length||!rows.some(row=>row.starts))message="Belum ada hasil race resmi untuk divisualisasikan.";}
   else if(mode==="comparison"){rows=driverRows.filter(row=>row.points>0||row.wins>0).slice(0,12);if(!rows.length)message="Belum ada data Driver yang cukup untuk dibandingkan.";}
   else message="Ranking engine belum memiliki sumber klasifikasi resmi yang terhubung. Tidak ada estimasi atau angka buatan yang ditampilkan.";
   if(active)setState({loading:false,season:String(season.title||""),rows,message});
  }catch(error){if(active)setState({loading:false,season:"",rows:[],message:error instanceof Error?error.message:"Data statistik gagal dimuat."});}
 };void load();return()=>{active=false};},[mode,divisionKey]);
 const comparisonTooltip=({active,payload}:any)=>{if(!active||!payload?.length)return null;const row=payload[0].payload as ChartRow;return <div className="cm-chart-tooltip"><strong>{row.name}</strong><span>{row.points.toLocaleString("id-ID")} poin</span><span>{row.wins} kemenangan</span></div>;};
 return <section className="workspace-card cm-chart-card"><div className="section-title-row"><div><span className="section-eyebrow">OFFICIAL COMPETITION DATA</span><h2>{TITLES[mode]}</h2><p className="muted">{state.season?"Season "+state.season:"Season terbaru yang tersedia"}</p></div><span className="empty-tag">{state.loading?"LOADING":state.message?"NO DATA":"OFFICIAL DATA"}</span></div>
  {state.loading?<p className="muted">Memuat statistik resmi...</p>:state.message?<div className="cm-chart-empty"><strong>Data belum tersedia</strong><p>{state.message}</p></div>:<div className="cm-chart-visual"><ResponsiveContainer width="100%" height={320}>
   {mode==="driver-ranking"||mode==="team-ranking"?<BarChart data={state.rows} margin={{top:12,right:16,left:0,bottom:44}}><CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" interval={0} angle={-24} textAnchor="end" height={64} tick={{fill:"#aeb1b4",fontSize:10}}/><YAxis allowDecimals={false} tick={{fill:"#aeb1b4",fontSize:10}}/><Tooltip contentStyle={{background:"#171717",border:"1px solid rgba(198,163,58,.4)",borderRadius:6,color:"#eeeae0"}}/><Bar dataKey="points" name="Poin" fill="#c6a33a" radius={[4,4,0,0]}/></BarChart>
   :mode==="statistic"?<LineChart data={state.rows} margin={{top:12,right:16,left:0,bottom:12}}><CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fill:"#aeb1b4",fontSize:10}}/><YAxis allowDecimals={false} tick={{fill:"#aeb1b4",fontSize:10}}/><Tooltip contentStyle={{background:"#171717",border:"1px solid rgba(198,163,58,.4)",borderRadius:6,color:"#eeeae0"}}/><Legend wrapperStyle={{color:"#aeb1b4",fontSize:11}}/><Line type="monotone" dataKey="starts" name="Race starts" stroke="#c6a33a" strokeWidth={2} dot={{r:3}}/><Line type="monotone" dataKey="wins" name="Race wins" stroke="#9d3943" strokeWidth={2} dot={{r:3}}/></LineChart>
   :<ScatterChart margin={{top:12,right:18,left:8,bottom:12}}><CartesianGrid stroke="rgba(255,255,255,.08)" strokeDasharray="3 3"/><XAxis type="number" dataKey="points" name="Poin" tick={{fill:"#aeb1b4",fontSize:10}}/><YAxis type="number" dataKey="wins" name="Kemenangan" allowDecimals={false} tick={{fill:"#aeb1b4",fontSize:10}}/><Tooltip content={comparisonTooltip}/><Scatter name="Driver" data={state.rows} fill="#c6a33a"/></ScatterChart>}
  </ResponsiveContainer></div>}
 </section>;
}
