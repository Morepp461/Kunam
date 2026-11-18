import { useState } from "react";
import { Check } from "lucide-react";
import { TEAM_COLOR_GROUPS } from "./lib/teamColorPalette";
type Props={label:string;value:string;onChange:(value:string)=>void};
export default function TeamBrandColorPicker({label,value,onChange}:Props){
 const [activeGroup,setActiveGroup]=useState("Caleris Classics");
 const group=TEAM_COLOR_GROUPS.find(item=>item.name===activeGroup)||TEAM_COLOR_GROUPS[0];
 return <section className="mer-team-color-picker" aria-label={label}>
  <div className="mer-team-color-heading"><strong>{label}</strong><span className="mer-team-color-current"><i style={{backgroundColor:value}}/></span></div>
  <div className="mer-team-color-groups" role="group" aria-label={label+" palette categories"}>{TEAM_COLOR_GROUPS.map(item=><button type="button" key={item.name} className={activeGroup===item.name?"active":""} onClick={()=>setActiveGroup(item.name)}>{item.name}</button>)}</div>
  <div className="mer-team-color-swatches" role="group" aria-label={group.name+" colors"}>{group.colors.map(color=><button type="button" key={color} className={value.toUpperCase()===color.toUpperCase()?"selected":""} style={{backgroundColor:color}} onClick={()=>onChange(color)} aria-label={label+" "+color} aria-pressed={value.toUpperCase()===color.toUpperCase()} title={color}>{value.toUpperCase()===color.toUpperCase()&&<Check size={15}/>}</button>)}</div>
 </section>;
}
