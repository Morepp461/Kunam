export type DecalFamily = "chevron"|"bolt"|"wing"|"arrow"|"stripe"|"check"|"star"|"roundel"|"diamond"|"wave";
export type DecalSurface = "sidepod"|"nose"|"frontWing"|"rearWing";
export type TeamLiveryDecal = { id:string; color:string; scale:number; rotation:number; x:number; y:number; surface:DecalSurface };
const families:DecalFamily[]=["chevron","bolt","wing","arrow","stripe","check","star","roundel","diamond","wave"];
const labels:Record<DecalFamily,string>={chevron:"Chevron",bolt:"Lightning",wing:"Wing",arrow:"Arrow",stripe:"Racing stripe",check:"Checkered",star:"Star",roundel:"Roundel",diamond:"Diamond",wave:"Wave"};
export const TEAM_LIVERY_DECAL_CATALOG=Array.from({length:50},(_,index)=>{
 const family=families[Math.floor(index/5)];
 const variant=index%5;
 return {id:`decal-${String(index+1).padStart(2,"0")}`,name:`${labels[family]} ${variant+1}`,family,variant};
});

export function drawTeamLiveryDecal(ctx:CanvasRenderingContext2D,decal:TeamLiveryDecal,cx:number,cy:number,width:number,height:number){
 const item=TEAM_LIVERY_DECAL_CATALOG.find(entry=>entry.id===decal.id);
 if(!item)return;
 const v=item.variant;
 ctx.save();ctx.translate(cx,cy);ctx.rotate(decal.rotation*Math.PI/180);
 const scale=Math.max(.2,Math.min(2,decal.scale));
 ctx.scale(scale,scale);ctx.fillStyle=decal.color;ctx.strokeStyle=decal.color;ctx.lineWidth=6+v;
 const polygon=(points:number[][])=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*width/2,y*height/2):ctx.moveTo(x*width/2,y*height/2));ctx.closePath();ctx.fill();};
 switch(item.family){
  case "chevron": for(let i=0;i<=v;i++)polygon([[-.5+i*.12,-.5],[.08+i*.12,0],[-.5+i*.12,.5],[-.24+i*.12,.5],[.34+i*.12,0],[-.24+i*.12,-.5]]);break;
  case "bolt": polygon([[-.18,-.5],[.25,-.5],[-.02,-.05],[.32,-.05],[-.3,.5],[-.12,.08],[-.42,.08]]);if(v%2)polygon([[.35,-.42],[.5,-.42],[.38,-.2],[.5,-.2],[.22,.1],[.31,-.12],[.18,-.12]]);break;
  case "wing": polygon([[-.5,-.12],[-.08,-.5],[.5,-.42],[.1,-.12],[.5,.1],[.05,.08],[-.3,.5],[-.18,.08]]);polygon([[.5,-.12],[.08,-.5],[-.5,-.42],[-.1,-.12],[-.5,.1],[-.05,.08],[.3,.5],[.18,.08]]);break;
  case "arrow": polygon([[-.5,-.18],[.08,-.18],[.08,-.5],[.5,0],[.08,.5],[.08,.18],[-.5,.18]]);if(v%2)polygon([[-.5,-.45],[.1,-.45],[.1,-.3],[-.5,-.3]]);break;
  case "stripe": for(let i=0;i<2+v;i++){ctx.save();ctx.rotate(-.45);ctx.fillRect((-width*.4+i*width*.16),-height*.48,width*.08,height*.96);ctx.restore();}break;
  case "check": {const n=3+v;for(let y=0;y<n;y++)for(let x=0;x<n*2;x++)if((x+y)%2===0)ctx.fillRect(-width/2+x*width/(n*2),-height/2+y*height/n,width/(n*2),height/n);}break;
  case "star": {const points=5+v;ctx.beginPath();for(let i=0;i<points*2;i++){const a=-Math.PI/2+i*Math.PI/points,r=i%2?.24:.5,x=Math.cos(a)*r*width/2,y=Math.sin(a)*r*height/2;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();}break;
  case "roundel": ctx.beginPath();ctx.ellipse(0,0,width*.48,height*.48,0,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation="destination-out";ctx.beginPath();ctx.ellipse(0,0,width*(.28+v*.025),height*(.28+v*.025),0,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation="source-over";ctx.fillRect(-width*.05,-height*.48,width*.1,height*.96);break;
  case "diamond": {const count=1+v;for(let i=0;i<count;i++){ctx.save();ctx.translate((i-(count-1)/2)*width*.24,0);ctx.rotate(Math.PI/4);ctx.fillRect(-width*.13,-height*.22,width*.26,height*.44);ctx.restore();}}break;
  case "wave": for(let i=0;i<1+v;i++){ctx.beginPath();ctx.moveTo(-width/2,-height*.35+i*height*.14);ctx.bezierCurveTo(-width*.2,-height*.65+i*height*.14,width*.15,height*.05+i*height*.14,width/2,-height*.25+i*height*.14);ctx.stroke();}break;
 }
 ctx.restore();
}
