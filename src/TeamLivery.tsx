import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CarFront, Download, ImagePlus, Palette, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { supabase } from "./lib/supabase";
import { validateTeamLiveryDesign } from "./lib/team-livery";
import { drawTeamLiveryDecal, TEAM_LIVERY_DECAL_CATALOG, type DecalSurface, type TeamLiveryDecal } from "./lib/team-livery-decals";
import "./team-livery.css";

type SponsorPlacement = "title" | "major" | "other";
type Sponsor = { id:string; name:string; logo_url:string|null; tier_key:string|null };
type Design = {
  schemaVersion:1; mainColor:string; secondaryColor:string; accentColor:string;
  pattern:"split"|"stripe"|"solid"|"carbon"; carNumber:string; teamWordmark:string;
  sponsors:[string,string,string]; logoDataUrl:string|null; decals:TeamLiveryDecal[];
  sponsorPlacements:Record<string,SponsorPlacement>;
};
const DEFAULT:Design = {
  schemaVersion:1, mainColor:"#B51F2B", secondaryColor:"#17191D", accentColor:"#F2EEE5",
  pattern:"split", carNumber:"16", teamWordmark:"CALERIS RACING",
  sponsors:["TITLE SPONSOR","MAJOR PARTNER","OFFICIAL PARTNER"], logoDataUrl:null,
  decals:[], sponsorPlacements:{}
};
const PARTS = [
  {name:"NOSE & MONOCOQUE",x:350,y:40,w:324,h:270,surface:"nose" as const},
  {name:"LEFT SIDEPOD",x:25,y:350,w:290,h:390,surface:"sidepod" as const},
  {name:"RIGHT SIDEPOD",x:709,y:350,w:290,h:390,surface:"sidepod" as const},
  {name:"ENGINE COVER",x:350,y:350,w:324,h:390,surface:"sidepod" as const},
  {name:"FRONT WING",x:25,y:790,w:290,h:190,surface:"frontWing" as const},
  {name:"REAR WING",x:709,y:790,w:290,h:190,surface:"rearWing" as const},
  {name:"HALO & DETAILS",x:350,y:790,w:324,h:190,surface:"nose" as const}
] as const;
const validSurface=(value:unknown):value is DecalSurface=>["sidepod","nose","frontWing","rearWing"].includes(String(value));
function normalize(input:unknown):Design{
  const d=(input&&typeof input==="object"?input:{}) as Partial<Design>;
  const color=(v:unknown,f:string)=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v)?v:f;
  const label=(v:unknown,f:string,n:number)=>typeof v==="string"?v.trim().slice(0,n):f;
  const logo=typeof d.logoDataUrl==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(d.logoDataUrl)&&d.logoDataUrl.length<=140000?d.logoDataUrl:null;
  const decals=Array.isArray(d.decals)?d.decals.slice(0,50).filter(item=>item&&typeof item==="object"&&TEAM_LIVERY_DECAL_CATALOG.some(x=>x.id===item.id)&&/^#[0-9a-f]{6}$/i.test(String(item.color))&&validSurface(item.surface)).map(item=>({
    id:item.id,color:item.color,scale:Math.max(.2,Math.min(2,Number(item.scale)||1)),
    rotation:Math.max(-180,Math.min(180,Number(item.rotation)||0)),
    x:Math.max(0,Math.min(100,Number(item.x)||50)),y:Math.max(0,Math.min(100,Number(item.y)||50)),surface:item.surface
  })):[];
  const sponsorPlacements:Record<string,SponsorPlacement>={};
  if(d.sponsorPlacements&&typeof d.sponsorPlacements==="object")for(const [id,placement] of Object.entries(d.sponsorPlacements)){
    if(["title","major","other"].includes(String(placement)))sponsorPlacements[id]=placement as SponsorPlacement;
  }
  return {
    schemaVersion:1,mainColor:color(d.mainColor,DEFAULT.mainColor),secondaryColor:color(d.secondaryColor,DEFAULT.secondaryColor),
    accentColor:color(d.accentColor,DEFAULT.accentColor),pattern:["split","stripe","solid","carbon"].includes(String(d.pattern))?d.pattern!:"split",
    carNumber:label(d.carNumber,DEFAULT.carNumber,3).replace(/[^0-9]/g,"")||"1",
    teamWordmark:label(d.teamWordmark,DEFAULT.teamWordmark,28),
    sponsors:[0,1,2].map(i=>label(d.sponsors?.[i],DEFAULT.sponsors[i],24)) as Design["sponsors"],
    logoDataUrl:logo,decals,sponsorPlacements
  };
}
function drawSponsorText(ctx:CanvasRenderingContext2D,names:string[],x:number,y:number,w:number,h:number,size:number){
  const clean=names.filter(Boolean).slice(0,3);
  if(!clean.length)return;
  ctx.save();ctx.fillStyle="#F5F0E5";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font=`900 ${size}px Arial, sans-serif`;
  clean.forEach((name,i)=>ctx.fillText(name.toUpperCase(),x+w/2,y+h*(i+1)/(clean.length+1),w*.9));
  ctx.restore();
}
function paintAtlas(canvas:HTMLCanvasElement,d:Design,sponsors:Sponsor[],selectedIndex:number|null){
  const ctx=canvas.getContext("2d");if(!ctx)return;
  ctx.fillStyle="#080A0D";ctx.fillRect(0,0,1024,1024);
  ctx.fillStyle="#C6A33A";ctx.font="800 13px Arial";ctx.fillText("CALERIS UV LIVERY ATLAS · TEAM EDITOR",24,25);
  PARTS.forEach((p,i)=>{
    ctx.save();ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,12);ctx.clip();
    ctx.fillStyle=d.pattern==="carbon"?d.secondaryColor:d.mainColor;ctx.fillRect(p.x,p.y,p.w,p.h);
    if(d.pattern==="split"){ctx.fillStyle=d.secondaryColor;ctx.fillRect(p.x+p.w*.64,p.y,p.w*.36,p.h);ctx.fillStyle=d.accentColor;ctx.beginPath();ctx.moveTo(p.x+p.w*.5,p.y);ctx.lineTo(p.x+p.w*.64,p.y);ctx.lineTo(p.x+p.w*.34,p.y+p.h);ctx.lineTo(p.x+p.w*.2,p.y+p.h);ctx.fill();}
    if(d.pattern==="stripe"){ctx.fillStyle=d.secondaryColor;ctx.fillRect(p.x+p.w*.2,p.y,p.w*.13,p.h);ctx.fillStyle=d.accentColor;ctx.fillRect(p.x+p.w*.39,p.y,p.w*.055,p.h);ctx.fillStyle=d.secondaryColor;ctx.fillRect(p.x+p.w*.72,p.y,p.w*.09,p.h);}
    if(d.pattern==="carbon"){ctx.globalAlpha=.24;ctx.strokeStyle=d.accentColor;for(let y=p.y;y<p.y+p.h;y+=12){ctx.beginPath();ctx.moveTo(p.x,y);ctx.lineTo(p.x+p.w,y);ctx.stroke();}ctx.globalAlpha=1;ctx.fillStyle=d.mainColor;ctx.fillRect(p.x+p.w*.1,p.y+p.h*.2,p.w*.8,p.h*.22);}
    ctx.strokeStyle="rgba(255,255,255,.22)";ctx.lineWidth=2;ctx.strokeRect(p.x+2,p.y+2,p.w-4,p.h-4);
    ctx.fillStyle=d.accentColor;ctx.font="800 14px Arial";ctx.fillText(p.name,p.x+13,p.y+23);
    if(i===0){ctx.textAlign="center";ctx.font="900 54px Arial";ctx.fillText("MAJOR PARTNER",p.x+p.w/2,p.y+p.h*.55);ctx.font="900 48px Arial";ctx.fillText(d.carNumber,p.x+p.w/2,p.y+p.h*.82);}
    if(i===1||i===2){const title=sponsors.filter(s=>d.sponsorPlacements[s.id]==="title").map(s=>s.name);drawSponsorText(ctx,title.length?title:[d.sponsors[0]],p.x,p.y+p.h*.28,p.w,p.h*.52,Math.max(16,Math.min(26,p.w*.09)));}
    if(i===4||i===5){const other=sponsors.filter(s=>d.sponsorPlacements[s.id]==="other").map(s=>s.name);drawSponsorText(ctx,other.length?other:[d.sponsors[2]],p.x,p.y+p.h*.25,p.w,p.h*.55,16);}
    d.decals.forEach((decal,index)=>{
      if(decal.surface!==p.surface)return;
      if(decal.surface==="sidepod"&&i!==1&&i!==2)return;
      if(decal.surface==="nose"&&i!==0&&i!==6)return;
      if(decal.surface==="frontWing"&&i!==4)return;
      if(decal.surface==="rearWing"&&i!==5)return;
      const cx=p.x+p.w*decal.x/100,cy=p.y+p.h*decal.y/100;
      drawTeamLiveryDecal(ctx,decal,cx,cy,Math.max(30,p.w*.36),Math.max(22,p.h*.2));
      if(index===selectedIndex){ctx.strokeStyle="#F5D77A";ctx.lineWidth=2;ctx.strokeRect(cx-p.w*.1,cy-p.h*.07,p.w*.2,p.h*.14);}
    });
    ctx.restore();
  });
  if(d.logoDataUrl){const img=new Image();img.onload=()=>{const c=canvas.getContext("2d");if(!c)return;PARTS.slice(0,4).forEach(p=>c.drawImage(img,p.x+p.w*.38,p.y+p.h*.32,p.w*.24,p.h*.2));};img.src=d.logoDataUrl;}
}
function Preview3D({design,sponsors}:{design:Design;sponsors:Sponsor[]}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let disposed=false,renderer:import("three").WebGLRenderer|null=null,frame=0,observer:ResizeObserver|null=null;
    const geometries:import("three").BufferGeometry[]=[],materials:import("three").Material[]=[],textures:import("three").Texture[]=[];
    let interactionCleanup:(()=>void)|null=null;
    const node=host.current;if(!node)return;
    void import("three").then(T=>{
      if(disposed)return;
      const w=Math.max(1,node.clientWidth),h=Math.max(1,node.clientHeight);
      renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.setSize(w,h);renderer.outputColorSpace=T.SRGBColorSpace;node.appendChild(renderer.domElement);
      const scene=new T.Scene();scene.background=new T.Color("#111419");
      const camera=new T.PerspectiveCamera(34,w/h,.1,100);
      let theta=.62,phi=.95,distance=11.5,dragging=false,lastX=0,lastY=0;
      const updateCamera=()=>{camera.position.set(distance*Math.sin(phi)*Math.cos(theta),distance*Math.cos(phi),distance*Math.sin(phi)*Math.sin(theta));camera.lookAt(0,.25,0);};
      updateCamera();
      const onDown=(event:PointerEvent)=>{dragging=true;lastX=event.clientX;lastY=event.clientY;node.setPointerCapture?.(event.pointerId);node.style.cursor="grabbing";};
      const onMove=(event:PointerEvent)=>{if(!dragging)return;theta-=(event.clientX-lastX)*.008;phi=Math.max(.28,Math.min(1.45,phi+(event.clientY-lastY)*.006));lastX=event.clientX;lastY=event.clientY;updateCamera();};
      const onUp=()=>{dragging=false;node.style.cursor="grab";};
      const onWheel=(event:WheelEvent)=>{event.preventDefault();distance=Math.max(7,Math.min(17,distance+event.deltaY*.012));updateCamera();};
      node.addEventListener("pointerdown",onDown);node.addEventListener("pointermove",onMove);node.addEventListener("pointerup",onUp);node.addEventListener("pointercancel",onUp);node.addEventListener("wheel",onWheel,{passive:false});
      node.style.cursor="grab";
      scene.add(new T.HemisphereLight(0xffffff,0x202630,1.8));
      const light=new T.DirectionalLight(0xffe6bf,2.6);light.position.set(-4,8,5);scene.add(light);
      const fill=new T.DirectionalLight(0xb7c8dd,1.1);fill.position.set(5,4,-5);scene.add(fill);
      const car=new T.Group();scene.add(car);
      const mat=(color:string,rough=.45,metal=.15)=>{const m=new T.MeshStandardMaterial({color,roughness:rough,metalness:metal});materials.push(m);return m;};
      const add=(g:import("three").BufferGeometry,m:import("three").Material,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{geometries.push(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);car.add(o);return o;};
      const main=mat(design.mainColor,.32,.35),secondary=mat(design.secondaryColor,.42,.25),accent=mat(design.accentColor,.3,.25),rubber=mat("#090B0E",.94),glass=mat("#18212B",.12,.45);
      add(new T.BoxGeometry(1.3,.35,3.25),main,0,.32,-.05);
      const nose=add(new T.ConeGeometry(.43,2.3,5),main,0,.25,2.55);nose.rotation.x=Math.PI/2;
      add(new T.BoxGeometry(2.35,.12,.38),secondary,0,.1,3.45);add(new T.BoxGeometry(1.95,.16,.35),secondary,0,.62,-1.72);
      add(new T.SphereGeometry(.42,16,12),glass,0,.63,-.1,.75,.55,1.1);
      for(const side of [-1,1]){
        add(new T.BoxGeometry(.44,.27,1.55),main,side*.68,.27,-.1);
        if(design.pattern==="split")add(new T.BoxGeometry(.045,.035,1.5),secondary,side*.68,.42,-.1);
        if(design.pattern==="stripe"){add(new T.BoxGeometry(.035,.012,1.5),accent,side*.68,.415,-.1);add(new T.BoxGeometry(.025,.012,1.5),secondary,side*.58,.415,-.1);}
        for(const axle of [-1,1]){const wheel=add(new T.CylinderGeometry(.4,.4,.3,24),rubber,side*.88,.2,axle*1.12);wheel.rotation.z=Math.PI/2;}
      }
      const sideCanvas=document.createElement("canvas");sideCanvas.width=1024;sideCanvas.height=256;
      const sideCtx=sideCanvas.getContext("2d")!;sideCtx.fillStyle=design.secondaryColor;sideCtx.fillRect(0,0,1024,256);
      sideCtx.fillStyle=design.accentColor;sideCtx.textAlign="center";sideCtx.font="900 62px Arial";sideCtx.fillText(design.teamWordmark.toUpperCase(),512,78);
      const titleNames=sponsors.filter(s=>design.sponsorPlacements[s.id]==="title").map(s=>s.name);
      drawSponsorText(sideCtx,titleNames.length?titleNames:[design.sponsors[0]],40,95,944,140,54);
      design.decals.filter(d=>d.surface==="sidepod").forEach(d=>drawTeamLiveryDecal(sideCtx,d,1024*d.x/100,256*d.y/100,300,130));
      const sideTexture=new T.CanvasTexture(sideCanvas);sideTexture.colorSpace=T.SRGBColorSpace;textures.push(sideTexture);
      const sideMat=new T.MeshStandardMaterial({map:sideTexture,roughness:.48,metalness:.08});materials.push(sideMat);
      for(const side of [-1,1]){const plane=new T.Mesh(new T.PlaneGeometry(1.2,.28),sideMat);geometries.push(plane.geometry);plane.position.set(side*.91,.34,-.25);plane.rotation.y=side===1?Math.PI/2:-Math.PI/2;car.add(plane);}
      const noseCanvas=document.createElement("canvas");noseCanvas.width=512;noseCanvas.height=256;
      const noseCtx=noseCanvas.getContext("2d")!;noseCtx.fillStyle=design.secondaryColor;noseCtx.fillRect(0,0,512,256);
      const majorNames=sponsors.filter(s=>design.sponsorPlacements[s.id]==="major").map(s=>s.name);
      drawSponsorText(noseCtx,majorNames.length?majorNames:[design.sponsors[1]],10,4,492,126,36);
      noseCtx.fillStyle=design.accentColor;noseCtx.textAlign="center";noseCtx.textBaseline="middle";noseCtx.font="900 104px Arial";noseCtx.fillText(design.carNumber,256,194);
      const noseTexture=new T.CanvasTexture(noseCanvas);noseTexture.colorSpace=T.SRGBColorSpace;textures.push(noseTexture);
      const noseMat=new T.MeshStandardMaterial({map:noseTexture,roughness:.38});materials.push(noseMat);
      const nosePanel=new T.Mesh(new T.PlaneGeometry(.56,.72),noseMat);geometries.push(nosePanel.geometry);nosePanel.rotation.x=-Math.PI/2;nosePanel.position.set(0,.505,2.55);car.add(nosePanel);
      const wingCanvas=document.createElement("canvas");wingCanvas.width=512;wingCanvas.height=128;
      const wingCtx=wingCanvas.getContext("2d")!;wingCtx.fillStyle=design.secondaryColor;wingCtx.fillRect(0,0,512,128);
      const otherNames=sponsors.filter(s=>design.sponsorPlacements[s.id]==="other").map(s=>s.name);
      drawSponsorText(wingCtx,otherNames.length?otherNames:[design.sponsors[2]],8,4,496,120,28);
      const wingTexture=new T.CanvasTexture(wingCanvas);wingTexture.colorSpace=T.SRGBColorSpace;textures.push(wingTexture);
      const wingMat=new T.MeshStandardMaterial({map:wingTexture,roughness:.5});materials.push(wingMat);
      for(const z of [3.45,-1.72]){const plane=new T.Mesh(new T.PlaneGeometry(1.4,.24),wingMat);geometries.push(plane.geometry);plane.rotation.x=-Math.PI/2;plane.position.set(0,z===3.45?.17:.69,z);car.add(plane);}
      const floor=add(new T.CircleGeometry(5,64),mat("#20262D",1,0),0,-.2,0,1,.02,.72);floor.rotation.x=-Math.PI/2;floor.position.y=-.21;
      const resize=()=>{if(!renderer)return;const nw=Math.max(1,node.clientWidth),nh=Math.max(1,node.clientHeight);camera.aspect=nw/nh;camera.updateProjectionMatrix();renderer.setSize(nw,nh);};
      observer=new ResizeObserver(resize);observer.observe(node);
      const animate=()=>{if(disposed)return;renderer?.render(scene,camera);frame=requestAnimationFrame(animate);};animate();
      interactionCleanup=()=>{node.removeEventListener("pointerdown",onDown);node.removeEventListener("pointermove",onMove);node.removeEventListener("pointerup",onUp);node.removeEventListener("pointercancel",onUp);node.removeEventListener("wheel",onWheel);};
    }).catch(()=>{if(!disposed)node.dataset.error="WebGL preview unavailable";});
    return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();interactionCleanup?.();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer?.dispose();renderer?.domElement.remove();};
  },[design,sponsors]);
  return <div className="team-livery-3d" ref={host}><span>INTERACTIVE 3D PREVIEW · DRAG TO ORBIT · SCROLL TO ZOOM</span></div>;
}

export default function TeamLivery({isAdmin=false}:{isAdmin?:boolean}){
  const [teamId,setTeamId]=useState(""),[teamName,setTeamName]=useState("");
  const [availableTeams,setAvailableTeams]=useState<Array<{id:string;name:string}>>([]);
  const [activeSponsors,setActiveSponsors]=useState<Sponsor[]>([]);
  const [design,setDesign]=useState<Design>(DEFAULT);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [decalPreset,setDecalPreset]=useState("decal-01"),[decalColor,setDecalColor]=useState("#F2EEE5"),[decalSurface,setDecalSurface]=useState<DecalSurface>("sidepod"),[selectedDecalIndex,setSelectedDecalIndex]=useState<number|null>(null);
  const atlas=useRef<HTMLCanvasElement>(null);
  const update=(patch:Partial<Design>)=>setDesign(current=>({...current,...patch}));
  const updateDecal=(index:number,patch:Partial<TeamLiveryDecal>)=>setDesign(current=>({...current,decals:current.decals.map((decal,i)=>i===index?{...decal,...patch}:decal)}));
  const loadSponsors=useCallback(async(id:string)=>{
    if(!supabase)return;
    const {data:contracts,error:contractError}=await supabase.from("caleris_sponsorship_contracts").select("sponsor_id").eq("target_team_id",id).eq("target_kind","team").eq("status","active");
    if(contractError){setError(contractError.message);setActiveSponsors([]);return;}
    const ids=[...new Set((contracts||[]).map(row=>row.sponsor_id).filter(Boolean))];
    if(!ids.length){setActiveSponsors([]);return;}
    const {data:sponsors,error:sponsorError}=await supabase.from("caleris_sponsors").select("id,name,logo_url,tier_key").in("id",ids).eq("is_active",true).order("name");
    if(sponsorError){setError(sponsorError.message);setActiveSponsors([]);return;}
    setActiveSponsors((sponsors||[]) as Sponsor[]);
  },[]);
  const load=useCallback(async()=>{
    if(!supabase){setError("Supabase belum tersedia.");setLoading(false);return;}
    setLoading(true);setError("");
    const {data:auth}=await supabase.auth.getUser();
    if(!auth.user){setError("Login diperlukan.");setLoading(false);return;}
    const {data:p,error:pe}=await supabase.from("profiles").select("member_id").eq("user_id",auth.user.id).maybeSingle();
    if(pe){setError(pe.message);setLoading(false);return;}
    if(!p?.member_id){
      if(!isAdmin){setError("Profil member tidak ditemukan.");setLoading(false);return;}
      const {data:rows,error:teamsError}=await supabase.from("teams").select("id,name").order("name").limit(100);
      if(teamsError||!rows?.length){setError(teamsError?.message||"Belum ada tim yang dapat dipilih.");setLoading(false);return;}
      setAvailableTeams(rows as Array<{id:string;name:string}>);setLoading(false);return;
    }
    const {data:m,error:me}=await supabase.from("members").select("team_id,role").eq("id",p.member_id).maybeSingle();
    if(me){setError(me.message);setLoading(false);return;}
    if(!["Owner","Principal"].includes(String(m?.role))&&!isAdmin){setError("Editor livery hanya tersedia untuk Team Owner dan Principal.");setLoading(false);return;}
    if(!m?.team_id){
      if(!isAdmin){setError("Akun belum terhubung ke tim.");setLoading(false);return;}
      const {data:rows,error:teamsError}=await supabase.from("teams").select("id,name").order("name").limit(100);
      if(teamsError||!rows?.length){setError(teamsError?.message||"Belum ada tim yang dapat dipilih.");setLoading(false);return;}
      setAvailableTeams(rows as Array<{id:string;name:string}>);setLoading(false);return;
    }
    const {data:t,error:te}=await supabase.from("teams").select("id,name").eq("id",m.team_id).maybeSingle();
    if(te||!t){setError(te?.message||"Data tim tidak ditemukan.");setLoading(false);return;}
    const {data:v,error:ve}=await supabase.from("caleris_team_liveries").select("livery_data").eq("team_id",t.id).maybeSingle();
    if(ve){setError(ve.message);setLoading(false);return;}
    setTeamId(t.id);setTeamName(t.name);setDesign(normalize(v?.livery_data??DEFAULT));await loadSponsors(t.id);setLoading(false);
  },[isAdmin,loadSponsors]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{if(atlas.current)paintAtlas(atlas.current,design,activeSponsors,selectedDecalIndex)},[design,activeSponsors,selectedDecalIndex]);
  const chooseTeam=async(id:string)=>{
    if(!supabase)return;const selected=availableTeams.find(team=>team.id===id);if(!selected)return;
    setLoading(true);setError("");
    const {data:row,error:e}=await supabase.from("caleris_team_liveries").select("livery_data").eq("team_id",id).maybeSingle();
    if(e)setError(e.message);else{setTeamId(id);setTeamName(selected.name);setDesign(normalize(row?.livery_data??DEFAULT));await loadSponsors(id);}
    setLoading(false);
  };
  const save=async()=>{
    if(!supabase||!teamId||saving)return;
    if(!validateTeamLiveryDesign(design)){setError("Data livery tidak valid. Periksa warna, decal, nomor, sponsor, dan logo.");return;}
    setSaving(true);setError("");setNotice("");
    const {data:a}=await supabase.auth.getUser();
    if(!a.user){setError("Sesi login tidak tersedia.");setSaving(false);return;}
    const {error:e}=await supabase.from("caleris_team_liveries").upsert({team_id:teamId,livery_data:design,updated_by:a.user.id,updated_at:new Date().toISOString()},{onConflict:"team_id"});
    setSaving(false);if(e)setError(e.message);else setNotice("Livery tim berhasil disimpan.");
  };
  const upload=async(file?:File)=>{
    if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("Logo harus PNG, JPG, atau WebP.");return;}
    if(file.size>100*1024){setError("Ukuran logo maksimal 100 KB.");return;}
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Logo gagal dibaca."));reader.readAsDataURL(file);});
    update({logoDataUrl:data});setError("");setNotice("Logo dimuat. Simpan livery untuk menyimpan perubahan.");
  };
  const addDecal=()=>{
    if(design.decals.length>=50){setError("Maksimal 50 decal per livery.");return;}
    const decal:TeamLiveryDecal={id:decalPreset,color:decalColor,scale:1,rotation:0,x:50,y:50,surface:decalSurface};
    setDesign(current=>({...current,decals:[...current.decals,decal]}));setSelectedDecalIndex(design.decals.length);setNotice("Decal ditambahkan. Klik atau drag ke panel UV untuk menentukan posisinya.");
  };
  const removeDecal=(index:number)=>{setDesign(current=>({...current,decals:current.decals.filter((_,i)=>i!==index)}));setSelectedDecalIndex(null);};
  const placeDecalOnAtlas=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(selectedDecalIndex===null||!design.decals[selectedDecalIndex])return;
    const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*1024,y=(event.clientY-rect.top)/rect.height*1024;
    const part=PARTS.find(p=>x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.h);if(!part)return;
    updateDecal(selectedDecalIndex,{surface:part.surface,x:Math.round((x-part.x)/part.w*100),y:Math.round((y-part.y)/part.h*100)});
  };
  const exportFile=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(design,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="caleris-team-livery.json";a.click();URL.revokeObjectURL(url);};
  const importFile=async(file?:File)=>{if(!file)return;try{const imported=normalize(JSON.parse(await file.text()));if(!validateTeamLiveryDesign(imported)){setError("File livery berisi data yang tidak valid.");return;}setDesign(imported);setSelectedDecalIndex(null);setNotice("Desain dimuat. Simpan untuk menerapkan ke tim.");setError("");}catch{setError("File livery tidak valid.");}};
  const setSponsorPlacement=(id:string,placement:SponsorPlacement)=>update({sponsorPlacements:{...design.sponsorPlacements,[id]:placement}});
  const selectedDecal=selectedDecalIndex===null?null:design.decals[selectedDecalIndex]??null;
  if(loading)return <section className="workspace team-livery"><p>Mempersiapkan Data...</p></section>;
  return <section className="workspace team-livery">
    <header className="page-heading"><span className="section-eyebrow">TEAM MANAGEMENT · VISUAL IDENTITY</span><h1 className="page-title">Custom Team Livery</h1><p className="page-description">50 preset decal vektor, warna RGB penuh, sponsor aktif tim, dan kontrol kamera 3D.</p></header>
    {error&&<div className="team-livery-message error" role="alert">{error}</div>}{notice&&<div className="team-livery-message success" role="status">{notice}</div>}
    {availableTeams.length>0&&isAdmin&&<label className="team-livery-admin-select"><span>ADMIN · PILIH TIM UNTUK QA</span><select value={teamId} onChange={e=>void chooseTeam(e.target.value)}><option value="">Pilih tim</option>{availableTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    {teamId&&<div className="team-livery-teamline"><strong>{teamName}</strong><span>TEAM LIVERY · JSON V1</span></div>}
    <div className="team-livery-layout">
      <section className="team-livery-editor">
        <div className="team-livery-section-title"><div><span>01 / DESIGN</span><h2>Material & Identity</h2></div><Palette size={18}/></div>
        <div className="team-livery-colors">{(["mainColor","secondaryColor","accentColor"] as const).map((key,i)=><label key={key}><span>{["Main body","Secondary","Accent"][i]}</span><input type="color" value={design[key]} onChange={e=>update({[key]:e.target.value})}/><code>{design[key].toUpperCase()}</code></label>)}</div>
        <label className="team-livery-field"><span>Body pattern</span><select value={design.pattern} onChange={e=>update({pattern:e.target.value as Design["pattern"]})}><option value="split">Split / two-tone</option><option value="stripe">Racing stripes</option><option value="solid">Solid color</option><option value="carbon">Carbon fiber</option></select></label>
        <div className="team-livery-fields-two"><label className="team-livery-field"><span>Car number</span><input value={design.carNumber} maxLength={3} inputMode="numeric" onChange={e=>update({carNumber:e.target.value.replace(/[^0-9]/g,"").slice(0,3)})}/></label><label className="team-livery-field"><span>Team wordmark</span><input value={design.teamWordmark} maxLength={28} onChange={e=>update({teamWordmark:e.target.value})}/></label></div>
        <div className="team-livery-section-title subsection"><div><span>02 / ACTIVE SPONSORS</span><h2>Team Sponsor Placement</h2></div><ImagePlus size={18}/></div>
        {activeSponsors.length===0?<p className="team-livery-note">Belum ada kontrak sponsor tim berstatus aktif.</p>:<div className="team-livery-sponsor-list">{activeSponsors.map(sponsor=><article className="team-livery-sponsor" key={sponsor.id}>
          <div className="team-livery-sponsor-identity">{sponsor.logo_url?<img src={sponsor.logo_url} alt={sponsor.name} loading="lazy"/>:<span className="team-livery-sponsor-fallback">{sponsor.name.slice(0,2).toUpperCase()}</span>}<div><strong>{sponsor.name}</strong><small>{sponsor.tier_key||"Partner"}</small></div></div>
          <div className="team-livery-placement" role="group" aria-label={`Penempatan ${sponsor.name}`}>
            {(["title","major","other"] as const).map(place=><button type="button" key={place} className={(design.sponsorPlacements[sponsor.id]||"other")===place?"is-selected":""} aria-pressed={(design.sponsorPlacements[sponsor.id]||"other")===place} onClick={()=>setSponsorPlacement(sponsor.id,place)}>{place==="title"?"Title":place==="major"?"Major":"Other"}</button>)}
          </div>
        </article>)}</div>}
        <div className="team-livery-section-title subsection"><div><span>03 / DECAL STUDIO</span><h2>50 Vector Decals</h2></div><Palette size={18}/></div>
        <p className="team-livery-note">Pilih salah satu desain, tentukan warna, lalu tambahkan ke livery. Color picker menyediakan 24-bit RGB (lebih dari 16 juta kombinasi warna).</p>
        <div className="team-livery-decal-grid">{TEAM_LIVERY_DECAL_CATALOG.map((item,index)=><button type="button" key={item.id} className={decalPreset===item.id?"is-selected":""} aria-pressed={decalPreset===item.id} onClick={()=>setDecalPreset(item.id)}><span>{String(index+1).padStart(2,"0")}</span><small>{item.name}</small></button>)}</div>
        <div className="team-livery-decal-controls">
          <label className="team-livery-field"><span>Warna decal · {decalColor.toUpperCase()}</span><input type="color" value={decalColor} onChange={e=>setDecalColor(e.target.value)}/></label>
          <label className="team-livery-field"><span>Panel awal</span><select value={decalSurface} onChange={e=>setDecalSurface(e.target.value as DecalSurface)}><option value="sidepod">Sidepod kiri & kanan</option><option value="nose">Nose / monocoque</option><option value="frontWing">Front wing</option><option value="rearWing">Rear wing</option></select></label>
          <button type="button" className="action primary" onClick={addDecal} disabled={design.decals.length>=50}><Plus size={15}/> Tambahkan decal ({design.decals.length}/50)</button>
        </div>
        {selectedDecal&&selectedDecalIndex!==null&&<div className="team-livery-selected-decal">
          <div className="team-livery-section-title"><div><span>SELECTED DECAL #{selectedDecalIndex+1}</span><h2>{TEAM_LIVERY_DECAL_CATALOG.find(item=>item.id===selectedDecal.id)?.name}</h2></div><button type="button" className="team-livery-remove" onClick={()=>removeDecal(selectedDecalIndex)}><Trash2 size={14}/> Hapus</button></div>
          <label className="team-livery-field"><span>Ukuran · {selectedDecal.scale.toFixed(2)}×</span><input type="range" min=".2" max="2" step=".05" value={selectedDecal.scale} onChange={e=>updateDecal(selectedDecalIndex,{scale:Number(e.target.value)})}/></label>
          <label className="team-livery-field"><span>Rotasi · {selectedDecal.rotation}°</span><input type="range" min="-180" max="180" step="1" value={selectedDecal.rotation} onChange={e=>updateDecal(selectedDecalIndex,{rotation:Number(e.target.value)})}/></label>
          <p className="team-livery-note">Posisi saat ini: {selectedDecal.surface} · X {selectedDecal.x}% · Y {selectedDecal.y}%. Klik atau drag pada panel UV untuk memindahkannya.</p>
        </div>}
        <label className="team-livery-upload"><Upload size={16}/><span>{design.logoDataUrl?"Replace team logo":"Upload team logo"}</span><small>PNG, JPG, WebP · max 100 KB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>
        <div className="team-livery-actions"><button type="button" onClick={()=>{setDesign(DEFAULT);setSelectedDecalIndex(null)}}><RotateCcw size={15}/>Reset</button><button type="button" onClick={exportFile}><Download size={15}/>Export</button><label className="team-livery-import"><Upload size={15}/>Import<input type="file" accept="application/json,.json" onChange={e=>void importFile(e.target.files?.[0])}/></label><button type="button" className="primary" onClick={()=>void save()} disabled={saving||!teamId}><Save size={15}/>{saving?"Saving...":"Save livery"}</button></div>
      </section>
      <section className="team-livery-preview">
        <div className="team-livery-section-title"><div><span>04 / UV TEXTURE ATLAS</span><h2>Mapped body panels</h2></div><CarFront size={18}/></div>
        <canvas ref={atlas} className="team-livery-atlas" width={1024} height={1024} aria-label="UV livery atlas preview" onPointerUp={placeDecalOnAtlas}/>
        <p className="team-livery-note">Pilih decal yang sudah ditambahkan, lalu klik panel atlas untuk memindahkannya ke permukaan tersebut.</p>
        <div className="team-livery-section-title preview-title"><div><span>05 / 3D APPLICATION</span><h2>Interactive car preview</h2></div></div>
        <Preview3D design={design} sponsors={activeSponsors}/>
        <p className="team-livery-note">Kamera dapat diputar dengan drag dan diperbesar dengan scroll. Preview saat ini masih menggunakan geometri prosedural. Asset GLB 2025 yang diunggah belum dapat dimasukkan ke deployment karena file biner belum tersedia pada jalur asset repository/storage yang dapat dipublikasikan.</p>
      </section>
    </div>
  </section>;
}
