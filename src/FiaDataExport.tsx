import {useState} from "react";
import {Download,LoaderCircle,ShieldCheck} from "lucide-react";
import ExcelJS from "exceljs";
import {supabase} from "./lib/supabase";
type Row=Record<string,any>;
const driverKeys=["Race Pace","Qualifying Pace","Experience","Aggression","Defensive Strength","Overtake Skill","Mistake Rate","Tyre Management"];
const teamKeys=["Race Pace","Qualifying Pace","Engine Power","Aero Power","Low Speed Corners","High Speed Corners","Traction","Mechanical Grip","Team Tyre Management","Strategy Quality","Team Morale","Reliability","Car Tyre Wear","Pit Stop Efficiency","DRS Efficiency","ERS Efficiency"];
const keyOf=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
export default function FiaDataExport({isAdmin,isFia}:{isAdmin:boolean;isFia:boolean}){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const exportData=async()=>{
  if(!supabase||(!isAdmin&&!isFia)){setNotice("Akses export hanya untuk Admin dan FIA.");return}
  setBusy(true);setNotice("");
  try{
   const [membersQ,teamsQ,driverQ,driverDevQ,teamDevQ,profilesQ,memberRecordsQ,teamRecordsQ]=await Promise.all([
    supabase.from("caleris_member_directory").select("*").order("character_name"),
    supabase.from("caleris_team_directory").select("*").order("name"),
    supabase.from("caleris_driver_attributes").select("*"),
    supabase.from("caleris_driver_development_attributes").select("*"),
    supabase.from("caleris_team_development_parts").select("*"),
    supabase.from("caleris_team_profiles").select("*"),
    supabase.from("members").select("*"),
    supabase.from("teams").select("*")
   ]);
   const error=[membersQ.error,teamsQ.error,driverQ.error,driverDevQ.error,teamDevQ.error,profilesQ.error,memberRecordsQ.error,teamRecordsQ.error].find(Boolean);
   if(error)throw error;
   const members=(membersQ.data||[]).map((m:any)=>({...m,...((memberRecordsQ.data||[]).find((x:any)=>x.id===m.id)||{})})) as Row[],teams=(teamsQ.data||[]).map((t:any)=>({...t,...((teamRecordsQ.data||[]).find((x:any)=>x.id===t.id)||{})})) as Row[];
   const driverRows=(driverQ.data||[]) as Row[],driverDev=(driverDevQ.data||[]) as Row[],teamDev=(teamDevQ.data||[]) as Row[],teamProfiles=(profilesQ.data||[]) as Row[];
   const driverSheet=members.filter(m=>String(m.role||"").toLowerCase()==="driver").map(m=>{
    const base=driverRows.find(x=>x.member_id===m.id)||{};
    const dev=driverDev.filter(x=>x.member_id===m.id);
    const attrs=base.attributes&&typeof base.attributes==="object"?base.attributes:{};
    const row:Row={...m,...attrs,driver_attributes_json:JSON.stringify(attrs),attributes_updated_at:base.updated_at||null};
    for(const k of driverKeys){const item=dev.find(x=>keyOf(String(x.attribute_key||""))===keyOf(k)||String(x.attribute_key||"").toLowerCase()===keyOf(k));row["development_"+keyOf(k)]=item?.current_value??null}
    return row;
   });
   const teamSheet=teams.map(t=>{
    const profile=teamProfiles.find(x=>x.team_id===t.id)||{};
    const parts=teamDev.filter(x=>x.team_id===t.id);
    const row:Row={...t,...profile};
    for(const k of teamKeys){const item=parts.find(x=>String(x.part_key||"").toLowerCase()===keyOf(k));row["car_part_"+keyOf(k)]=item?.current_value??null}
    return row;
   });
   const workbook=new ExcelJS.Workbook();workbook.creator="CALERIS MASTERS";workbook.created=new Date();
   for(const [name,rows] of [["DRIVERS",driverSheet],["TEAMS",teamSheet]] as const){
    const ws=workbook.addWorksheet(name,{views:[{state:"frozen",ySplit:1}]});
    const columns=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
    ws.columns=columns.map(key=>({header:key.replace(/_/g," ").toUpperCase(),key,width:Math.min(32,Math.max(14,key.length+3))}));
    for(const row of rows)ws.addRow(row);
    ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF7D2028"}};
    ws.autoFilter={from:{row:1,column:1},to:{row:1,column:Math.max(columns.length,1)}};
   }
   const buffer=await workbook.xlsx.writeBuffer();
   const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="caleris-masters-live-data.xlsx";a.click();URL.revokeObjectURL(url);
   setNotice("Workbook berhasil dibuat: "+driverSheet.length+" driver dan "+teamSheet.length+" tim.");
  }catch(error:any){setNotice(error?.message||"Export gagal. Periksa akses database.");}
  finally{setBusy(false)}
 };
 if(!isAdmin&&!isFia)return null;
 return <section className="s5-card s5-export-card"><div className="s5-card-head"><div><span>OFFICIAL DATA SNAPSHOT</span><h2>Export Driver & Team Data</h2></div><ShieldCheck size={20}/></div><p className="s5-history">Unduh satu workbook Excel dengan sheet DRIVERS dan TEAMS. Data diambil langsung dari database saat tombol ditekan, termasuk atribut driver dan seluruh car development parts.</p><button className="s5-primary" type="button" onClick={()=>void exportData()} disabled={busy}>{busy?<LoaderCircle className="s5-pulse"/>:<Download size={16}/>} {busy?"Menyiapkan workbook...":"Export Excel (.xlsx)"}</button>{notice&&<small className="s5-footnote">{notice}</small>}</section>;
}
