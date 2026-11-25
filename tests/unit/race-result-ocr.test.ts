import {describe,expect,it} from "vitest";
import {parseRaceResultOCR,type RaceOCREntry} from "../../src/lib/race-result-ocr";
const base=(memberId:string,driverName:string):RaceOCREntry=>({memberId,driverName,teamName:"",driverNumber:"",country:"",flag:"",gridPosition:"",status:"finished",position:"",timeOrLaps:"",gap:"",fastestLap:"",stints:[]});
const drivers=[{id:"max",character_name:"Max Verstappen",team_id:"rb",nationality:"Netherlands"},{id:"charles",character_name:"Charles Leclerc",team_id:"fer",nationality:"Monaco"},{id:"lando",character_name:"Lando Norris",team_id:"mcl",nationality:"United Kingdom"}];
const teams=[{id:"rb",name:"Red Bull Racing"},{id:"fer",name:"Ferrari"},{id:"mcl",name:"McLaren"}];
describe("parseRaceResultOCR",()=>{
 it("matches driver names and reads finishing position, time and gap",()=>{
  const result=parseRaceResultOCR("1 Max Verstappen Red Bull Racing 1:30:10.111 Winner\n2 Charles Leclerc Ferrari 1:30:12.456 +2.345",drivers.map(d=>base(d.id,d.character_name)),drivers,teams,91.5);
  expect(result.matchedDriverCount).toBe(2);
  expect(result.rows[0]).toMatchObject({position:"1",timeOrLaps:"1:30:10.111",teamName:"Red Bull Racing"});
  expect(result.rows[1]).toMatchObject({position:"2",gap:"+2.345",teamName:"Ferrari"});
  expect(result.confidence).toBe(91.5);
 });
 it("keeps grid positions manual and detects DNF laps",()=>{
  const rows=drivers.map(d=>({...base(d.id,d.character_name),gridPosition:"7"}));
  const result=parseRaceResultOCR("3 Lando Norris McLaren DNF +12 Laps",rows,drivers,teams,120);
  expect(result.rows[2]).toMatchObject({position:"3",status:"dnf",timeOrLaps:"+12 Laps",gridPosition:"7"});
  expect(result.confidence).toBe(100);
 });
 it("does not invent a match for unknown drivers",()=>{
  const result=parseRaceResultOCR("1 Unknown Driver 1:20.000",[],drivers,teams,0);
  expect(result.matchedDriverCount).toBe(0);
 });
});
