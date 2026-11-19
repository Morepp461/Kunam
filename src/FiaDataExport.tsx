import {useState} from "react";
import {Download,LoaderCircle,ShieldCheck} from "lucide-react";
import {strToU8,zipSync} from "fflate";
import {supabase} from "./lib/supabase";
type Row=Record<string,any>;
const driverKeys=["Race Pace","Qualifying Pace","Experience","Aggression","Defensive Strength","Overtake Skill","Mistake Rate","Tyre Management"];
const teamKeys=["Race Pace","Qualifying Pace","Engine Power","Aero Power","Low Speed Corners","High Speed Corners","Traction","Mechanical Grip","Team Tyre Management","Strategy Quality","Team Morale","Reliability","Car Tyre Wear","Pit Stop Efficiency","DRS Efficiency","ERS Efficiency"];
const keyOf=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
const xmlEscape=(value:unknown)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const colName=(n:number)=>{let out="";while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26)}return out;};
function buildWorkbook(sheets:{name:string;rows:Row[]}[]){
 const files:Record<string,Uint8Array>={};
 files["[Content_Types].xml"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>');
 files["_rels/.rels"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 files["xl/workbook.xml"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+s.name+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>');
 files["xl/_rels/workbook.xml.rels"]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
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
 return zipSync(files,{level:6});
}
export default function FiaDataExport({isAdmin,isFia}:{isAdmin:boolean;isFia:boolean}){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const exportData=async()=>{
  if(!supabase||(!isAdmin&&!isFia)){setNotice("Akses export hanya untuk Admin dan FIA.");return;}
  setBusy(true);setNotice("");
  try{
   const {data,error}=await supabase.functions.invoke("caleris-data-export",{body:{}});
   if(error)throw error;
   if(data?.error)throw new Error(String(data.error));
   const members=(data?.members||[]) as Row[],teams=(data?.teams||[]) as Row[];
   const driverRows=(data?.driverAttributes||[]) as Row[],driverDev=(data?.driverDevelopment||[]) as Row[];
   const teamDev=(data?.teamDevelopment||[]) as Row[],teamProfiles=(data?.teamProfiles||[]) as Row[];
   const teamById=new Map(teams.map(t=>[t.id,t]));
   const driverSheet=members.map(m=>{
    const base=driverRows.find(x=>x.member_id===m.id)||{};
    const dev=driverDev.filter(x=>x.member_id===m.id);
    const attrs=base.attributes&&typeof base.attributes==="object"?base.attributes:{};
    const row:Row={member_id:m.id,member_code:m.public_member_id||null,character_name:m.character_name||"",role:m.role||"Driver",team_name:teamById.get(m.team_id)?.name||"Independent",division_key:teamById.get(m.team_id)?.division_key||null,license:m.license||null,nationality:m.nationality||null,hometown:m.hometown||null};
    for(const k of driverKeys)row[keyOf(k)]=attrs[keyOf(k)]??null;
    for(const k of driverKeys){const item=dev.find(x=>keyOf(String(x.attribute_key||""))===keyOf(k));row["development_"+keyOf(k)]=item?.current_value??null;}
    row.attributes_updated_at=base.updated_at||null;
    return row;
   });
   const teamSheet=teams.map(t=>{
    const profile=teamProfiles.find(x=>x.team_id===t.id)||{};
    const parts=teamDev.filter(x=>x.team_id===t.id);
    const row:Row={team_id:t.id,team_name:t.name,division_key:t.division_key||null};
    for(const k of teamKeys){const item=parts.find(x=>keyOf(String(x.part_key||""))===keyOf(k));row["car_part_"+keyOf(k)]=item?.current_value??null;}
    row.parts_updated_at=parts.reduce((latest,item)=>!latest||String(item.updated_at||"")>latest?String(item.updated_at||""):latest,"" as string)||null;
    row.team_profile=Object.keys(profile).length?profile:null;
    return row;
   });
   const buffer=buildWorkbook([{name:"DRIVERS",rows:driverSheet},{name:"TEAMS",rows:teamSheet}]);
   const blob=new Blob([new Uint8Array(buffer).buffer as ArrayBuffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="caleris-masters-live-data.xlsx";document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice("Workbook berhasil dibuat: "+driverSheet.length+" driver dan "+teamSheet.length+" tim.");
  }catch(error:any){
   const response=error?.context;
   if(response instanceof Response){
    let detail=error?.message||"Permintaan export ditolak.";
    try{const payload=await response.clone().json();detail=String(payload?.error||payload?.message||detail);}catch{}
    setNotice("Export gagal ("+response.status+"): "+detail);
   }else setNotice(error?.message||"Export gagal. Periksa akses database.");
  }
  finally{setBusy(false);}
 };
 if(!isAdmin&&!isFia)return null;
 return <section className="s5-card s5-export-card"><div className="s5-card-head"><div><span>OFFICIAL DATA SNAPSHOT</span><h2>Export Driver & Team Data</h2></div><ShieldCheck size={20}/></div><p className="s5-history">Unduh satu workbook Excel dengan sheet DRIVERS dan TEAMS. Data dibaca langsung dari database saat tombol ditekan, termasuk delapan atribut Driver dan enam belas car development parts.</p><button className="s5-primary" type="button" onClick={()=>void exportData()} disabled={busy}>{busy?<LoaderCircle className="s5-pulse"/>:<Download size={16}/>} {busy?"Menyiapkan workbook...":"Export Excel (.xlsx)"}</button>{notice&&<small className="s5-footnote" role="status">{notice}</small>}</section>;
}
