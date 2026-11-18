import {useState} from "react";
import {Download,LoaderCircle,ShieldCheck} from "lucide-react";
import {strToU8,zipSync} from "fflate";
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
   const xmlEscape=(value:unknown)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
   const colName=(n:number)=>{let out="";while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26)}return out};
   const sheets=[{name:"DRIVERS",rows:driverSheet},{name:"TEAMS",rows:teamSheet}];
   const files:Record<string,Uint8Array>={};
   files["[Content_Types].xml"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
   files["_rels/.rels"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
   files["xl/workbook.xml"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DRIVERS" sheetId="1" r:id="rId1"/><sheet name="TEAMS" sheetId="2" r:id="rId2"/></sheets></workbook>');
   files["xl/_rels/workbook.xml.rels"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
   files["xl/styles.xml"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7D2028"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
   sheets.forEach((sheet,index)=>{
    const columns=Array.from(new Set(sheet.rows.flatMap(row=>Object.keys(row))));
    const header=columns.map((key,i)=>'<c r="'+colName(i+1)+'1" s="1" t="inlineStr"><is><t>'+xmlEscape(key.replace(/_/g," ").toUpperCase())+'</t></is></c>').join("");
    const body=sheet.rows.map((row,rowIndex)=>{
     const cells=columns.map((key,colIndex)=>{
      let value=row[key];if(value===null||value===undefined)return "";
      if(typeof value==="object")value=JSON.stringify(value);
      const ref=colName(colIndex+1)+(rowIndex+2);
      if(typeof value==="number"&&Number.isFinite(value))return '<c r="'+ref+'" t="n"><v>'+value+'</v></c>';
      if(typeof value==="boolean")return '<c r="'+ref+'" t="b"><v>'+(value?1:0)+'</v></c>';
      return '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEscape(value)+'</t></is></c>';
     }).join("");
     return '<row r="'+(rowIndex+2)+'">'+cells+'</row>';
    }).join("");
    const last=colName(Math.max(columns.length,1));
    const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+columns.map((k,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.min(32,Math.max(14,k.length+3))+'" customWidth="1"/>').join("")+'</cols><sheetData><row r="1">'+header+'</row>'+body+'</sheetData><autoFilter ref="A1:'+last+Math.max(sheet.rows.length+1,1)+'"/></worksheet>';
    files["xl/worksheets/sheet"+(index+1)+".xml"]=strToU8(xml);
   });
   const buffer=zipSync(files,{level:6});
   const blob=new Blob([buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="caleris-masters-live-data.xlsx";a.click();URL.revokeObjectURL(url);
   setNotice("Workbook berhasil dibuat: "+driverSheet.length+" driver dan "+teamSheet.length+" tim.");
  }catch(error:any){setNotice(error?.message||"Export gagal. Periksa akses database.");}
  finally{setBusy(false)}
 };
 if(!isAdmin&&!isFia)return null;
 return <section className="s5-card s5-export-card"><div className="s5-card-head"><div><span>OFFICIAL DATA SNAPSHOT</span><h2>Export Driver & Team Data</h2></div><ShieldCheck size={20}/></div><p className="s5-history">Unduh satu workbook Excel dengan sheet DRIVERS dan TEAMS. Data diambil langsung dari database saat tombol ditekan, termasuk atribut driver dan seluruh car development parts.</p><button className="s5-primary" type="button" onClick={()=>void exportData()} disabled={busy}>{busy?<LoaderCircle className="s5-pulse"/>:<Download size={16}/>} {busy?"Menyiapkan workbook...":"Export Excel (.xlsx)"}</button>{notice&&<small className="s5-footnote">{notice}</small>}</section>;
}
