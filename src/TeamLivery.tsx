import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CarFront, Download, ImagePlus, Palette, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { supabase } from "./lib/supabase";
import { optimizeImageToWebp } from "./lib/imageOptimization";
import { validateTeamLiveryDesign } from "./lib/team-livery";
import { drawTeamLiveryDecal, TEAM_LIVERY_DECAL_CATALOG, type DecalSurface, type TeamLiveryDecal } from "./lib/team-livery-decals";
import "./team-livery.css";
import { F1Car2026Preview } from "./F1Car2026Preview";

type SponsorPlacement = "title" | "major" | "other";
export type Sponsor = { id:string; name:string; logo_url:string|null; tier_key:string|null };
export type Design = {
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
export function normalizeTeamLiveryDesign(input:unknown):Design{
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
export function Preview3D({design,sponsors}:{design:Design;sponsors:Sponsor[]}){
  return <F1Car2026Preview design={design} sponsors={sponsors}/>;
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
    setTeamId(t.id);setTeamName(t.name);setDesign(normalizeTeamLiveryDesign(v?.livery_data??DEFAULT));await loadSponsors(t.id);setLoading(false);
  },[isAdmin,loadSponsors]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{if(atlas.current)paintAtlas(atlas.current,design,activeSponsors,selectedDecalIndex)},[design,activeSponsors,selectedDecalIndex]);
  const chooseTeam=async(id:string)=>{
    if(!supabase)return;const selected=availableTeams.find(team=>team.id===id);if(!selected)return;
    setLoading(true);setError("");
    const {data:row,error:e}=await supabase.from("caleris_team_liveries").select("livery_data").eq("team_id",id).maybeSingle();
    if(e)setError(e.message);else{setTeamId(id);setTeamName(selected.name);setDesign(normalizeTeamLiveryDesign(row?.livery_data??DEFAULT));await loadSponsors(id);}
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
    try{
      const optimized=await optimizeImageToWebp(file,"livery-logo");
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Logo gagal dibaca."));reader.readAsDataURL(optimized.file);});
      update({logoDataUrl:data});setError("");setNotice("Logo dikompres menjadi "+Math.round(optimized.compressedSize/1024)+" KB. Simpan livery untuk menyimpan perubahan.");
    }catch(error){setError(error instanceof Error?error.message:"Logo gagal diproses.");}
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
  const importFile=async(file?:File)=>{if(!file)return;try{const imported=normalizeTeamLiveryDesign(JSON.parse(await file.text()));if(!validateTeamLiveryDesign(imported)){setError("File livery berisi data yang tidak valid.");return;}setDesign(imported);setSelectedDecalIndex(null);setNotice("Desain dimuat. Simpan untuk menerapkan ke tim.");setError("");}catch{setError("File livery tidak valid.");}};
  const setSponsorPlacement=(id:string,placement:SponsorPlacement)=>update({sponsorPlacements:{...design.sponsorPlacements,[id]:placement}});
  const selectedDecal=selectedDecalIndex===null?null:design.decals[selectedDecalIndex]??null;
  if(loading)return <section className="workspace team-livery"><p>Mempersiapkan Data...</p></section>;
  return <section className="workspace team-livery">
    <header className="page-heading"><span className="section-eyebrow">TEAM MANAGEMENT · VISUAL IDENTITY</span><h1 className="page-title">Custom Team Livery</h1><p className="page-description">50 preset decal vektor, warna RGB penuh, sponsor aktif tim, dan 2026 chassis 3D dengan LOD ramah perangkat.</p></header>
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
        <label className="team-livery-upload"><Upload size={16}/><span>{design.logoDataUrl?"Replace team logo":"Upload team logo"}</span><small>PNG, JPG, WebP · hasil kompresi maksimal 100 KB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>
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
