import {useCallback,useEffect,useMemo,useState} from "react";
import {Flag,RefreshCw,Save,Trophy,Plus,Trash2} from "lucide-react";
import {supabase} from "./lib/supabase";

type Round={id:string;round_number:number;title:string;session_type:"race"|"sprint";checkin_closes_at:string;season_division_id:string;license_season_divisions?:{division_name:string;license_seasons?:{title:string}}};
type Driver={id:string;character_name:string|null;team_id:string|null;teams?:{name:string}|null};
type Row={member_id:string;name:string;team_id:string|null;team_name:string;status:"finished"|"dnf"|"dns"|"dsq";position:string;grid:string;finishTime:string;fastestLap:string;stints:string[];note:string};
const compounds=[["soft","Soft","red"],["medium","Medium","yellow"],["hard","Hard","white"],["intermediate","Intermediate","green"],["wet","Wet","blue"]] as const;
const parseTime=(raw:string,allowHours=false):number|null=>{
 const v=raw.trim().replace(",",".");
 const m=v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{3})$/);
 if(m){const hours=Number(m[1]||0),minutes=Number(m[2]),seconds=Number(m[3]),ms=Number(m[4]);if(minutes>59||seconds>59||(!allowHours&&hours>0))return null;return ((hours*60+minutes)*60+seconds)*1000+ms;}
 const short=v.match(/^(\d{1,2}):(\d{2})\.(\d{3})$/);
 if(short){const minutes=Number(short[1]),seconds=Number(short[2]);if(seconds>59)return null;return (minutes*60+seconds)*1000+Number(short[3]);}
 return null;
};
export default function RaceControl(){
 const [rounds,setRounds]=useState<Round[]>([]),[drivers,setDrivers]=useState<Driver[]>([]),[roundId,setRoundId]=useState(""),[rows,setRows]=useState<Row[]>([]),[dotd,setDotd]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
 const refresh=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const [r,m]=await Promise.all([
   supabase.from("license_rounds").select("id,round_number,title,session_type,checkin_closes_at,season_division_id,license_season_divisions(division_name,license_seasons(title))").neq("status","closed").order("round_number"),
   supabase.from("members").select("id,character_name,team_id,teams(name)").eq("role","Driver").order("character_name")
  ]);
  const error=r.error||m.error;if(error)setNotice({kind:"error",text:error.message});
  setRounds((r.data||[]) as unknown as Round[]);setDrivers((m.data||[]) as unknown as Driver[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const selected=rounds.find(x=>x.id===roundId);
 const eligible=useMemo(()=>drivers, [drivers]);
 const change=(id:string,patch:Partial<Row>)=>setRows(current=>current.map(row=>row.member_id===id?{...row,...patch}:row));
 const selectRound=async(id:string)=>{
  setRoundId(id);setDotd("");setNotice(null);const round=rounds.find(x=>x.id===id);if(!round)return;
  const {data,error}=await supabase!.from("license_season_members").select("member_id").eq("season_division_id",round.season_division_id).eq("is_hiatus",false);
  if(error){setNotice({kind:"error",text:error.message});return;}
  const ids=(data||[]).map(x=>x.member_id);const participants=drivers.filter(d=>ids.includes(d.id));
  const {data:existing}=await supabase!.from("caleris_race_result_entries").select("member_id,finish_status,finishing_position,grid_position,finish_time_ms,fastest_lap_ms,note").eq("round_id",id);
  const prior=new Map((existing||[]).map(x=>[x.member_id,x]));
  const {data:stints}=await supabase!.from("caleris_race_stints").select("member_id,tyre_compound").eq("round_id",id).order("stint_number");
  const tyreMap=new Map<string,string[]>();(stints||[]).forEach(x=>tyreMap.set(x.member_id,[...(tyreMap.get(x.member_id)||[]),x.tyre_compound]));
  setRows(participants.map((d,i)=>{const p=prior.get(d.id);return {member_id:d.id,name:d.character_name||"Driver",team_id:d.team_id,team_name:d.teams?.name||"Independent",status:(p?.finish_status||"finished") as Row["status"],position:p?.finishing_position?String(p.finishing_position):"",grid:p?.grid_position?String(p.grid_position):String(i+1),finishTime:"",fastestLap:"",stints:tyreMap.get(d.id)||["medium"],note:p?.note||""}}));
 };
 const save=async()=>{
  if(!supabase||!selected)return;setNotice(null);
  const errors:string[]=[];
  const payload=rows.map((r,i)=>{
   const grid=Number(r.grid),position=r.status==="finished"?Number(r.position):null;
   const finish=r.status==="finished"?parseTime(r.finishTime,true):null;
   const fastest=r.fastestLap.trim()?parseTime(r.fastestLap,false):null;
   if(!Number.isInteger(grid)||grid<1)errors.push(r.name+": grid position tidak valid.");
   if(r.status==="finished"&&(!Number.isInteger(position)||position!<1||finish===null))errors.push(r.name+": posisi finish dan waktu wajib valid.");
   if(r.fastestLap.trim()&&fastest===null)errors.push(r.name+": format fastest lap harus m:ss.mmm.");
   if(!r.stints.length)errors.push(r.name+": minimal satu stint ban wajib dipilih.");
   return {member_id:r.member_id,finish_status:r.status,finishing_position:position,grid_position:grid,finish_time_ms:finish,fastest_lap_ms:fastest,note:r.note||null,stints:r.stints};
  });
  if(errors.length){setNotice({kind:"error",text:errors.slice(0,4).join(" ")});return;}
  const positions=payload.filter(x=>x.finish_status==="finished").map(x=>x.finishing_position);
  if(new Set(positions).size!==positions.length||!positions.includes(1)){setNotice({kind:"error",text:"Posisi finish harus unik dan mencakup P1."});return;}
  if(new Set(payload.map(x=>x.grid_position)).size!==payload.length||!payload.some(x=>x.grid_position===1)){setNotice({kind:"error",text:"Grid harus unik dan memiliki satu pole sitter di P1."});return;}
  if(!payload.some(x=>x.fastest_lap_ms!==null)){setNotice({kind:"error",text:"Fastest lap minimal harus dicatat untuk satu Driver."});return;}
  if(dotd&&!payload.some(x=>x.member_id===dotd)){setNotice({kind:"error",text:"Driver of the Day tidak valid."});return;}
  setBusy(true);
  const {data,error}=await supabase.rpc("fia_submit_race_classification",{p_round_id:roundId,p_entries:payload,p_driver_of_day_member_id:dotd||null});
  setBusy(false);
  if(error){setNotice({kind:"error",text:error.message});return;}
  setNotice({kind:"success",text:"Hasil resmi tersimpan. Standings, race rewards, inactivity, payroll, dan cicilan diproses otomatis. Prizepool: "+String(data?.prizepool?.status||"menunggu final round")+"."});
  setRoundId("");setRows([]);setDotd("");await refresh();
 };
 const finished=rows.filter(r=>r.status==="finished").length;
 return <section className="workspace race-control">
  <header className="page-heading"><span className="section-eyebrow">FIA PANEL · OFFICIAL RACE CONTROL</span><h1 className="page-title">Race Input</h1><p className="page-description">Masukkan seluruh klasifikasi dari hasil game. Saat disahkan, engine kompetisi dan ekonomi memproses hasilnya dalam satu transaksi.</p></header>
  <section className="workspace-card race-control-toolbar">
   <label>Season · Division · Round<select value={roundId} onChange={e=>void selectRound(e.target.value)}><option value="">Pilih round yang akan disahkan</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.license_season_divisions?.license_seasons?.title||"Season"} · {r.license_season_divisions?.division_name||"Division"} · R{r.round_number} · {r.title} · {r.session_type||"race"}</option>)}</select></label>
   <button className="action" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
   {selected&&<p className="race-control-hint"><Flag size={15}/> {selected.title} · {selected.license_season_divisions?.division_name} · Check-in ditutup {new Date(selected.checkin_closes_at).toLocaleString("id-ID")}. Hasil hanya dapat disahkan setelah waktu penutupan.</p>}
  </section>
  {selected&&<section className="workspace-card">
   <div className="section-title-row"><div><span className="section-eyebrow">OFFICIAL CLASSIFICATION</span><h2>Race result sheet</h2></div><span className="empty-tag">{finished}/{rows.length} FINISHED</span></div>
   <label className="race-dotd">Driver of the Day<select value={dotd} onChange={e=>setDotd(e.target.value)}><option value="">Pilih Driver (opsional)</option>{rows.map(r=><option key={r.member_id} value={r.member_id}>{r.name}</option>)}</select></label>
   <div className="race-input-table-wrap"><table className="race-input-table"><thead><tr><th>Pos</th><th>Driver / Team</th><th>Grid</th><th>Status</th><th>Time</th><th>Fastest Lap</th><th>Stops / Tyre Stints</th></tr></thead><tbody>
    {rows.map(row=><tr key={row.member_id}>
     <td><input className="race-pos-input" type="number" min="1" value={row.position} disabled={row.status!=="finished"} onChange={e=>change(row.member_id,{position:e.target.value})} placeholder="—"/></td>
     <td><strong>{row.name}</strong><small>{row.team_name}</small></td>
     <td><input className="race-pos-input" type="number" min="1" value={row.grid} onChange={e=>change(row.member_id,{grid:e.target.value})}/></td>
     <td><select value={row.status} onChange={e=>change(row.member_id,{status:e.target.value as Row["status"],position:e.target.value==="finished"?row.position:""})}><option value="finished">Finished</option><option value="dnf">DNF</option><option value="dns">DNS</option><option value="dsq">DSQ</option></select></td>
     <td><input className="race-time-input" value={row.finishTime} disabled={row.status!=="finished"} onChange={e=>change(row.member_id,{finishTime:e.target.value})} placeholder="1:37:42.851"/></td>
     <td><input className="race-time-input" value={row.fastestLap} onChange={e=>change(row.member_id,{fastestLap:e.target.value})} placeholder="1:41.781"/></td>
     <td><div className="race-stints">{row.stints.map((compound,i)=><div className="race-stint" key={i}><select value={compound} aria-label={"Compound stint "+(i+1)} onChange={e=>change(row.member_id,{stints:row.stints.map((x,j)=>j===i?e.target.value:x)})}>{compounds.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span className={"race-tyre-dot "+compound}/><button type="button" aria-label="Hapus stint" onClick={()=>change(row.member_id,{stints:row.stints.filter((_,j)=>j!==i)})} disabled={row.stints.length===1}><Trash2 size={13}/></button></div>)}<button type="button" className="race-add-stint" onClick={()=>change(row.member_id,{stints:[...row.stints,"medium"]})}><Plus size={13}/> Pit stop</button></div></td>
    </tr>)}
   </tbody></table></div>
   <div className="race-tyre-legend">{compounds.map(([value,label])=><span key={value}><i className={"race-tyre-dot "+value}/>{label}</span>)}</div>
   <p className="race-control-hint">Time menggunakan format h:mm:ss.mmm, fastest lap menggunakan m:ss.mmm. Jumlah lingkaran ban = jumlah stint; jumlah pit stop = stint dikurangi satu. Gap dihitung otomatis dari waktu pemenang. Pole diambil dari Grid P1, pemenang dari Finish P1, fastest lap dari waktu tercepat.</p>
   <button className="action primary race-submit" onClick={()=>void save()} disabled={busy||loading||rows.length===0}><Save size={16}/>{busy?"Memproses seluruh engine...":"Sahkan hasil race & proses otomatis"}</button>
  </section>}
  {notice&&<div className={"license-notice "+notice.kind} role="status">{notice.text}</div>}
 </section>;
}
