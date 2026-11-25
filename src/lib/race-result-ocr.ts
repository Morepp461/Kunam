export type RaceOCRTyre="soft"|"medium"|"hard"|"intermediate"|"wet";
export type RaceOCRStatus="finished"|"dnf"|"dns"|"dsq";
export interface RaceOCREntry {
 memberId:string;driverName:string;teamName:string;driverNumber:string;country:string;flag:string;
 gridPosition:string;status:RaceOCRStatus;position:string;timeOrLaps:string;gap:string;fastestLap:string;stints:RaceOCRTyre[];
}
export interface RaceOCRDriver {id:string;character_name:string|null;team_id:string|null;nationality:string|null}
export interface RaceOCRTeam {id:string;name:string}
export interface RaceOCRParseResult {rows:RaceOCREntry[];matchedDriverCount:number;confidence:number}
const normalize=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const timeTokens=(line:string)=>line.match(/\b\d{1,3}:\d{2}(?::\d{2})?[.,]\d{3}\b/g)||[];
const tyreTokens=(line:string):RaceOCRTyre[]=>{
 const values:RaceOCRTyre[]=[];
 for(const [pattern,tyre] of [[/\bsoft\b/i,"soft"],[/\bmedium\b/i,"medium"],[/\bhard\b/i,"hard"],[/\binter(?:mediate)?\b/i,"intermediate"],[/\bwet\b/i,"wet"]] as [RegExp,RaceOCRTyre][])if(pattern.test(line))values.push(tyre);
 return values;
};
export function parseRaceResultOCR(text:string,entries:RaceOCREntry[],drivers:RaceOCRDriver[],teams:RaceOCRTeam[],confidence=0):RaceOCRParseResult{
 const rows=entries.map(entry=>({...entry,stints:[...entry.stints]}));
 const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const matched=new Set<string>();
 for(const line of lines){
  const normalized=normalize(line);
  const driver=drivers.map(item=>({item,name:normalize(item.character_name||"")})).filter(item=>item.name.length>2&&normalized.includes(item.name)).sort((a,b)=>b.name.length-a.name.length)[0]?.item;
  if(!driver||matched.has(driver.id))continue;
  const index=rows.findIndex(row=>row.memberId===driver.id);
  if(index<0)continue;
  const team=teams.find(item=>item.id===driver.team_id);
  const tokens=timeTokens(line);
  const position=Number((line.match(/^\s*P?(\d{1,2})(?:[.)-])?\s+/i)||[])[1]||"");
  const carNumber=Number((line.match(/#\s*(\d{1,3})/)||[])[1]||"");
  const laps=(line.match(/\+\s*\d+\s*laps?/i)||[])[0]||"";
  const gap=(line.match(/\+\s*\d{1,6}[.,]\d{1,3}(?!\d)/)||[])[0]||"";
  const status:RaceOCRStatus=/\bDSQ\b/i.test(line)?"dsq":/\bDNS\b/i.test(line)?"dns":/\bDNF\b/i.test(line)?"dnf":"finished";
  const tyres=tyreTokens(line);
  const current=rows[index];
  rows[index]={
   ...current,
   driverName:driver.character_name||current.driverName,
   teamName:team?.name||current.teamName,
   driverNumber:carNumber>0?String(carNumber):current.driverNumber,
   position:position>0?String(position):current.position,
   timeOrLaps:status==="dnf"?(laps||current.timeOrLaps):(tokens[0]||current.timeOrLaps),
   gap:gap||current.gap,
   fastestLap:tokens.length>=3?tokens[2]:current.fastestLap,
   stints:tyres.length?tyres:current.stints,
   status
  };
  matched.add(driver.id);
 }
 return {rows,matchedDriverCount:matched.size,confidence:Math.max(0,Math.min(100,confidence))};
}
