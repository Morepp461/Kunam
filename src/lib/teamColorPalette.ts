export type TeamColorGroup = { name: string; colors: string[] };
const hueFamilies = [["Crimson",350],["Red",2],["Scarlet",14],["Orange",28],["Amber",39],["Gold",48],["Lime",76],["Green",122],["Emerald",148],["Teal",174],["Cyan",190],["Sky",205],["Blue",220],["Indigo",238],["Violet",258],["Purple",278],["Magenta",300],["Rose",330]] as const;
const toHex=(value:number)=>Math.round(value).toString(16).padStart(2,"0");
const hslToHex=(h:number,s:number,l:number)=>{
 const saturation=s/100,lightness=l/100,chroma=(1-Math.abs(2*lightness-1))*saturation,section=h/60,x=chroma*(1-Math.abs(section%2-1));
 let rgb:[number,number,number]=[0,0,0];
 if(section<1)rgb=[chroma,x,0];else if(section<2)rgb=[x,chroma,0];else if(section<3)rgb=[0,chroma,x];else if(section<4)rgb=[0,x,chroma];else if(section<5)rgb=[x,0,chroma];else rgb=[chroma,0,x];
 const match=lightness-chroma/2;return "#"+rgb.map(c=>toHex((c+match)*255)).join("").toUpperCase();
};
export const TEAM_COLOR_GROUPS:TeamColorGroup[]=[
 ...hueFamilies.map(([name,hue])=>({name,colors:Array.from({length:13},(_,i)=>hslToHex(hue,82-Math.abs(i-6)*2.8,18+i*5.35))})),
 {name:"Caleris Classics",colors:["#7A263A","#A52230","#C6A33A","#D8C7A0","#25282D","#4B5058","#777D85","#E8E5DE","#9B7B4A","#5A342F","#293B4D","#315B55"]}
];
