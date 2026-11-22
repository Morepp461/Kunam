import { useCallback, useEffect, useRef, useState } from "react";
import { CarFront, Download, ImagePlus, Palette, RotateCcw, Save, Upload } from "lucide-react";
import { supabase } from "./lib/supabase";
import { validateTeamLiveryDesign } from "./lib/team-livery";
import "./team-livery.css";

type Design = { schemaVersion: 1; mainColor: string; secondaryColor: string; accentColor: string; pattern: "split"|"stripe"|"solid"|"carbon"; carNumber: string; teamWordmark: string; sponsors: [string,string,string]; logoDataUrl: string|null };
const DEFAULT: Design = { schemaVersion:1, mainColor:"#B51F2B", secondaryColor:"#17191D", accentColor:"#F2EEE5", pattern:"split", carNumber:"16", teamWordmark:"CALERIS RACING", sponsors:["TITLE SPONSOR","TECH PARTNER","OFFICIAL PARTNER"], logoDataUrl:null };
const PARTS = [
 {name:"NOSE & MONOCOQUE",x:350,y:40,w:324,h:270},{name:"LEFT SIDEPOD",x:25,y:350,w:290,h:390},
 {name:"RIGHT SIDEPOD",x:709,y:350,w:290,h:390},{name:"ENGINE COVER",x:350,y:350,w:324,h:390},
 {name:"FRONT WING",x:25,y:790,w:290,h:190},{name:"REAR WING",x:709,y:790,w:290,h:190},{name:"HALO & DETAILS",x:350,y:790,w:324,h:190}
] as const;
function normalize(input: unknown): Design {
 const d=(input&&typeof input==="object"?input:{}) as Partial<Design>;
 const color=(v:unknown,f:string)=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v)?v:f;
 const label=(v:unknown,f:string,n:number)=>typeof v==="string"?v.trim().slice(0,n):f;
 const logo=typeof d.logoDataUrl==="string"&&/^data:image\/(png|jpeg|webp);base64,/i.test(d.logoDataUrl)&&d.logoDataUrl.length<=140000?d.logoDataUrl:null;
 return {schemaVersion:1,mainColor:color(d.mainColor,DEFAULT.mainColor),secondaryColor:color(d.secondaryColor,DEFAULT.secondaryColor),accentColor:color(d.accentColor,DEFAULT.accentColor),pattern:["split","stripe","solid","carbon"].includes(String(d.pattern))?d.pattern!:"split",carNumber:label(d.carNumber,DEFAULT.carNumber,3).replace(/[^0-9]/g,"")||"1",teamWordmark:label(d.teamWordmark,DEFAULT.teamWordmark,28),sponsors:[0,1,2].map(i=>label(d.sponsors?.[i],DEFAULT.sponsors[i],24)) as Design["sponsors"],logoDataUrl:logo};
}
function paintAtlas(canvas:HTMLCanvasElement,d:Design){
 const ctx=canvas.getContext("2d");if(!ctx)return;
 ctx.fillStyle="#080A0D";ctx.fillRect(0,0,1024,1024);
 ctx.fillStyle="#C6A33A";ctx.font="800 13px Arial";ctx.fillText("CALERIS UV LIVERY ATLAS · TEMPLATE V1",24,25);
 PARTS.forEach((p,i)=>{ctx.save();ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,12);ctx.clip();ctx.fillStyle=d.pattern==="carbon"?d.secondaryColor:d.mainColor;ctx.fillRect(p.x,p.y,p.w,p.h);
  if(d.pattern==="split"){ctx.fillStyle=d.secondaryColor;ctx.fillRect(p.x+p.w*.64,p.y,p.w*.36,p.h);ctx.fillStyle=d.accentColor;ctx.beginPath();ctx.moveTo(p.x+p.w*.5,p.y);ctx.lineTo(p.x+p.w*.64,p.y);ctx.lineTo(p.x+p.w*.34,p.y+p.h);ctx.lineTo(p.x+p.w*.2,p.y+p.h);ctx.fill();}
  if(d.pattern==="stripe"){ctx.fillStyle=d.secondaryColor;ctx.fillRect(p.x+p.w*.2,p.y,p.w*.13,p.h);ctx.fillStyle=d.accentColor;ctx.fillRect(p.x+p.w*.39,p.y,p.w*.055,p.h);ctx.fillStyle=d.secondaryColor;ctx.fillRect(p.x+p.w*.72,p.y,p.w*.09,p.h);}
  if(d.pattern==="carbon"){ctx.globalAlpha=.24;ctx.strokeStyle=d.accentColor;for(let y=p.y;y<p.y+p.h;y+=12){ctx.beginPath();ctx.moveTo(p.x,y);ctx.lineTo(p.x+p.w,y);ctx.stroke();}ctx.globalAlpha=1;ctx.fillStyle=d.mainColor;ctx.fillRect(p.x+p.w*.1,p.y+p.h*.2,p.w*.8,p.h*.22);}
  ctx.strokeStyle="rgba(255,255,255,.22)";ctx.lineWidth=2;ctx.strokeRect(p.x+2,p.y+2,p.w-4,p.h-4);ctx.fillStyle=d.accentColor;ctx.font="800 14px Arial";ctx.fillText(p.name,p.x+13,p.y+23);
  ctx.textAlign="center";ctx.font=i===0?"900 68px Arial":"900 22px Arial";ctx.fillText(i===0?d.carNumber:d.teamWordmark.toUpperCase(),p.x+p.w/2,p.y+p.h*.56);ctx.font="700 14px Arial";ctx.fillText(d.sponsors[i%3].toUpperCase(),p.x+p.w/2,p.y+p.h*.74);ctx.restore();});
 if(d.logoDataUrl){const img=new Image();img.onload=()=>{const c=canvas.getContext("2d");if(!c)return;PARTS.slice(0,4).forEach(p=>c.drawImage(img,p.x+p.w*.38,p.y+p.h*.32,p.w*.24,p.h*.2));};img.src=d.logoDataUrl;}
}
function Preview3D({design}:{design:Design}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{let disposed=false,renderer:import("three").WebGLRenderer|null=null,frame=0,observer:ResizeObserver|null=null;let geometries:import("three").BufferGeometry[]=[];let materials:import("three").Material[]=[];const node=host.current;if(!node)return;
  void import("three").then(T=>{if(disposed)return;const w=Math.max(1,node.clientWidth),h=Math.max(1,node.clientHeight);renderer=new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:"low-power"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.2));renderer.setSize(w,h);renderer.outputColorSpace=T.SRGBColorSpace;node.appendChild(renderer.domElement);
   const scene=new T.Scene();scene.background=new T.Color("#111419");const camera=new T.PerspectiveCamera(35,w/h,.1,100);camera.position.set(6,7,9);camera.lookAt(0,0,0);scene.add(new T.HemisphereLight(0xffffff,0x202630,2));const light=new T.DirectionalLight(0xffe6bf,2.4);light.position.set(-4,8,5);scene.add(light);const fill=new T.DirectionalLight(0xb7c8dd,.8);fill.position.set(5,4,-5);scene.add(fill);
   const car=new T.Group();scene.add(car);const mat=(color:string,rough=.45)=>{const m=new T.MeshStandardMaterial({color,roughness:rough,metalness:.15});materials.push(m);return m;};
   const add=(g:import("three").BufferGeometry,m:import("three").Material,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{geometries.push(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);car.add(o);return o;};
   const main=mat(design.mainColor),secondary=mat(design.secondaryColor),accent=mat(design.accentColor),rubber=mat("#0C0E11",.95),glass=mat("#18212B",.18);
   add(new T.BoxGeometry(1.3,.35,3.25),main,0,.32,-.05);
   const nose=add(new T.ConeGeometry(.43,2.3,5),main,0,.25,2.55);nose.rotation.x=Math.PI/2;
   add(new T.BoxGeometry(2.35,.12,.38),secondary,0,.1,3.45);add(new T.BoxGeometry(1.95,.16,.35),secondary,0,.62,-1.72);
   add(new T.SphereGeometry(.42,12,10),glass,0,.63,-.1,.75,.55,1.1);
   for(const side of [-1,1]){add(new T.BoxGeometry(.44,.27,1.55),main,side*.68,.27,-.1);const stripe=add(new T.BoxGeometry(.035,.012,1.5),accent,side*.68,.415,-.1);void stripe;for(const axle of [-1,1]){const wheel=add(new T.CylinderGeometry(.4,.4,.3,14),rubber,side*.88,.2,axle*1.12);wheel.rotation.z=Math.PI/2;}}
   const decalCanvas=document.createElement("canvas");decalCanvas.width=512;decalCanvas.height=128;const ctx=decalCanvas.getContext("2d")!;ctx.fillStyle=design.secondaryColor;ctx.fillRect(0,0,512,128);ctx.fillStyle=design.accentColor;ctx.textAlign="center";ctx.font="900 48px Arial";ctx.fillText(design.teamWordmark.toUpperCase(),256,53);ctx.font="800 30px Arial";ctx.fillText(design.sponsors[0].toUpperCase(),256,104);
   const tex=new T.CanvasTexture(decalCanvas);tex.colorSpace=T.SRGBColorSpace;if(design.logoDataUrl){const logo=new Image();logo.onload=()=>{ctx.drawImage(logo,210,4,92,92);tex.needsUpdate=true;};logo.src=design.logoDataUrl;}const decalMat=new T.MeshStandardMaterial({map:tex,roughness:.5});materials.push(decalMat);
   for(const side of [-1,1]){const plane=new T.Mesh(new T.PlaneGeometry(1.25,.3),decalMat);geometries.push(plane.geometry);plane.position.set(side*.91,.34,-.25);plane.rotation.y=side===1?Math.PI/2:-Math.PI/2;car.add(plane);}
   const floor=add(new T.CircleGeometry(5,48),mat("#20262D",1),0,-.2,0,1,.02,.72);floor.rotation.x=-Math.PI/2;floor.position.y=-.21;
   const resize=()=>{if(!renderer)return;const nw=Math.max(1,node.clientWidth),nh=Math.max(1,node.clientHeight);camera.aspect=nw/nh;camera.updateProjectionMatrix();renderer.setSize(nw,nh);};observer=new ResizeObserver(resize);observer.observe(node);
   const animate=()=>{if(disposed)return;car.rotation.y=Math.sin(performance.now()*.0002)*.035;renderer?.render(scene,camera);frame=requestAnimationFrame(animate);};animate();
  }).catch(()=>{if(!disposed)node.dataset.error="WebGL preview unavailable";});
  return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer?.dispose();renderer?.domElement.remove();};
 },[design]);
 return <div className="team-livery-3d" ref={host}><span>3D PREVIEW · PROCEDURAL CAR MODEL</span></div>;
}
export default function TeamLivery({isAdmin=false}:{isAdmin?:boolean}){
 const [teamId,setTeamId]=useState(""),[teamName,setTeamName]=useState(""),[availableTeams,setAvailableTeams]=useState<Array<{id:string;name:string}>>([]),[design,setDesign]=useState<Design>(DEFAULT);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");const atlas=useRef<HTMLCanvasElement>(null);
 const update=(patch:Partial<Design>)=>setDesign(v=>({...v,...patch}));
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
  setTeamId(t.id);setTeamName(t.name);setDesign(normalize(v?.livery_data??DEFAULT));setLoading(false);
 },[isAdmin]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(atlas.current)paintAtlas(atlas.current,design)},[design]);
 const chooseTeam=async(id:string)=>{
  if(!supabase)return;
  const selected=availableTeams.find(team=>team.id===id);if(!selected)return;
  setLoading(true);setError("");
  const {data:row,error:e}=await supabase.from("caleris_team_liveries").select("livery_data").eq("team_id",id).maybeSingle();
  if(e)setError(e.message);else{setTeamId(id);setTeamName(selected.name);setDesign(normalize(row?.livery_data??DEFAULT));}
  setLoading(false);
 };
 const save=async()=>{if(!supabase||!teamId||saving)return;if(!validateTeamLiveryDesign(design)){setError("Data livery tidak valid. Periksa warna, nomor, sponsor, dan logo.");return;}setSaving(true);setError("");setNotice("");const {data:a}=await supabase.auth.getUser();if(!a.user){setError("Sesi login tidak tersedia.");setSaving(false);return;}
  const {error:e}=await supabase.from("caleris_team_liveries").upsert({team_id:teamId,livery_data:design,updated_by:a.user.id,updated_at:new Date().toISOString()},{onConflict:"team_id"});setSaving(false);if(e)setError(e.message);else setNotice("Livery tim berhasil disimpan.");
 };
 const upload=async(file?:File)=>{if(!file)return;if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("Logo harus PNG, JPG, atau WebP.");return;}if(file.size>100*1024){setError("Ukuran logo maksimal 100 KB.");return;}const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Logo gagal dibaca."));r.readAsDataURL(file);});update({logoDataUrl:data});setError("");setNotice("Logo dimuat. Simpan livery untuk menyimpan perubahan.");};
 const exportFile=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(design,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download="caleris-team-livery.json";a.click();URL.revokeObjectURL(u);};
 const importFile=async(file?:File)=>{if(!file)return;try{setDesign(normalize(JSON.parse(await file.text())));setNotice("Desain dimuat. Simpan untuk menerapkan ke tim.");setError("");}catch{setError("File livery tidak valid.");}};
 if(loading)return <section className="workspace team-livery"><p>Memuat livery tim...</p></section>;
 return <section className="workspace team-livery"><header className="page-heading"><span className="section-eyebrow">TEAM MANAGEMENT · VISUAL IDENTITY</span><h1 className="page-title">Custom Team Livery</h1><p className="page-description">UV texture atlas editor untuk identitas visual mobil tim.</p></header>
  {error&&<div className="team-livery-message error" role="alert">{error}</div>}{notice&&<div className="team-livery-message success" role="status">{notice}</div>}
  {availableTeams.length>0&&isAdmin&&<label className="team-livery-admin-select"><span>ADMIN · PILIH TIM UNTUK QA</span><select value={teamId} onChange={e=>void chooseTeam(e.target.value)}><option value="">Pilih tim</option>{availableTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}\n  {teamId&&<div className="team-livery-teamline"><strong>{teamName}</strong><span>TEAM LIVERY · TEMPLATE V1</span></div>}
  <div className="team-livery-layout"><section className="team-livery-editor"><div className="team-livery-section-title"><div><span>01 / DESIGN</span><h2>Material & Identity</h2></div><Palette size={18}/></div>
   <div className="team-livery-colors">{(["mainColor","secondaryColor","accentColor"] as const).map((key,i)=><label key={key}><span>{["Main body","Secondary","Accent"][i]}</span><input type="color" value={design[key]} onChange={e=>update({[key]:e.target.value})}/><code>{design[key].toUpperCase()}</code></label>)}</div>
   <label className="team-livery-field"><span>Body pattern</span><select value={design.pattern} onChange={e=>update({pattern:e.target.value as Design["pattern"]})}><option value="split">Split / two-tone</option><option value="stripe">Racing stripes</option><option value="solid">Solid color</option><option value="carbon">Carbon fiber</option></select></label>
   <div className="team-livery-fields-two"><label className="team-livery-field"><span>Car number</span><input value={design.carNumber} maxLength={3} inputMode="numeric" onChange={e=>update({carNumber:e.target.value.replace(/[^0-9]/g,"").slice(0,3)})}/></label><label className="team-livery-field"><span>Team wordmark</span><input value={design.teamWordmark} maxLength={28} onChange={e=>update({teamWordmark:e.target.value})}/></label></div>
   <div className="team-livery-section-title subsection"><div><span>02 / SPONSORS</span><h2>Decal & Branding</h2></div><ImagePlus size={18}/></div>
   {design.sponsors.map((v,i)=><label className="team-livery-field" key={i}><span>Sponsor decal {i+1}</span><input value={v} maxLength={24} onChange={e=>update({sponsors:design.sponsors.map((s,j)=>j===i?e.target.value:s) as Design["sponsors"]})}/></label>)}
   <label className="team-livery-upload"><Upload size={16}/><span>{design.logoDataUrl?"Replace team logo":"Upload team/sponsor logo"}</span><small>PNG, JPG, WebP · max 100 KB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(e.target.files?.[0])}/></label>
   <div className="team-livery-actions"><button type="button" onClick={()=>setDesign(DEFAULT)}><RotateCcw size={15}/>Reset</button><button type="button" onClick={exportFile}><Download size={15}/>Export</button><label className="team-livery-import"><Upload size={15}/>Import<input type="file" accept="application/json,.json" onChange={e=>void importFile(e.target.files?.[0])}/></label><button type="button" className="primary" onClick={()=>void save()} disabled={saving||!teamId}><Save size={15}/>{saving?"Saving...":"Save livery"}</button></div>
  </section><section className="team-livery-preview"><div className="team-livery-section-title"><div><span>03 / UV TEXTURE ATLAS</span><h2>Mapped body panels</h2></div><CarFront size={18}/></div><canvas ref={atlas} className="team-livery-atlas" width={1024} height={1024} aria-label="UV livery atlas preview"/><div className="team-livery-section-title preview-title"><div><span>04 / 3D APPLICATION</span><h2>Car preview</h2></div></div><Preview3D design={design}/><p className="team-livery-note">Atlas template V1 dan preview procedural 3D ini adalah fondasi editor. Model GLB/GLTF dengan UV layout produksi belum tersedia di repository. Livery tidak mengubah physics atau hasil simulasi Race Engine.</p></section></div>
 </section>;
}
