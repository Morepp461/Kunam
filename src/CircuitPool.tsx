import {useCallback,useEffect,useRef,useState} from "react";
import type {FormEvent} from "react";
import {X,RefreshCw,Pencil} from "lucide-react";
import {supabase} from "./lib/supabase";
import {CountryCodeSelect} from "./LocationSelectors";
import {importCircuitGeoJsonDraft} from "./lib/race-engine/circuit-import";
import type {CircuitGeoJsonImportDraft,CircuitGeoJsonSourceMetadata} from "./lib/race-engine/circuit-import";
import type {CircuitSourceProvenance,CircuitGeometryDefinition} from "./lib/race-engine/circuit-geometry";
import CircuitMaker from "./CircuitMaker";
import "./circuit-pool.css";

type Circuit={id:string;name:string;country_code:string;image_url:string|null;total_laps:number;avg_track_temp_c:number;drs_zones:number;straights:number;low_speed_corners:number;high_speed_corners:number;grip_level:number;lap_record_ms:number|null;lap_record_driver_name:string|null;initial_lap_record_ms:number|null;initial_lap_record_driver_name:string|null;geometry_draft:CircuitGeoJsonImportDraft|null;circuit_geometry:CircuitGeometryDefinition|null;geometry_revision:number;circuit_kind:"fictional"|"real";source_provenance:CircuitSourceProvenance|null;geometry_status:"missing"|"unverified"|"verified"|"rejected"};
type CircuitForm={name:string;country_code:string;total_laps:string;avg_track_temp_c:string;drs_zones:string;straights:string;low_speed_corners:string;high_speed_corners:string;grip_level:string;initial_record:string;initial_record_driver_name:string};
const emptyForm: CircuitForm={name:"",country_code:"",total_laps:"",avg_track_temp_c:"",drs_zones:"",straights:"",low_speed_corners:"",high_speed_corners:"",grip_level:"",initial_record:"",initial_record_driver_name:""};
type CircuitPoolDraft={key:string;form:CircuitForm;editingId:string|null;layoutFile:Blob|null;layoutFileName:string|null;layoutFileType:string|null;layoutFileLastModified:number|null;layoutPreview:string;geoJsonText?:string;geoJsonFileName?:string;geoJsonMeta?:CircuitGeoJsonSourceMetadata;geoJsonDraft?:CircuitGeoJsonImportDraft|null;circuitGeometry?:CircuitGeometryDefinition|null};
const CIRCUIT_DRAFT_KEY="circuit-pool-input";
const emptyGeoJsonMeta:CircuitGeoJsonSourceMetadata={provider:"",sourceUrl:"",licenseId:"",attribution:"",retrievedAt:"",sourceRevision:""};
const geometryPolyline=(draft:CircuitGeoJsonImportDraft|null,geometry?:CircuitGeometryDefinition|null)=>draft?.points?.map(point=>`${12+point.normalizedX*376},${12+point.normalizedY*376}`).join(" ")||geometry?.layout?.map(point=>`${12+point.x*376},${12+point.y*376}`).join(" ")||"";
let circuitDraftDb:Promise<IDBDatabase>|null=null;
function openCircuitDraftDb():Promise<IDBDatabase>{
 if(typeof indexedDB==="undefined")return Promise.reject(new Error("Penyimpanan draft browser tidak tersedia."));
 if(!circuitDraftDb)circuitDraftDb=new Promise((resolve,reject)=>{
  const request=indexedDB.open("caleris-local-drafts",1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains("drafts"))db.createObjectStore("drafts",{keyPath:"key"})};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("Gagal membuka penyimpanan draft."));
 });
 return circuitDraftDb;
}
async function readCircuitDraft():Promise<CircuitPoolDraft|null>{
 const db=await openCircuitDraftDb();return new Promise((resolve,reject)=>{const tx=db.transaction("drafts","readonly");const request=tx.objectStore("drafts").get(CIRCUIT_DRAFT_KEY);request.onsuccess=()=>resolve((request.result as CircuitPoolDraft|undefined)||null);request.onerror=()=>reject(request.error||new Error("Gagal membaca draft."))});
}
async function writeCircuitDraft(draft:CircuitPoolDraft):Promise<void>{
 const db=await openCircuitDraftDb();return new Promise((resolve,reject)=>{const tx=db.transaction("drafts","readwrite");tx.objectStore("drafts").put(draft);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error("Gagal menyimpan draft."));tx.onabort=()=>reject(tx.error||new Error("Penyimpanan draft dibatalkan."))});
}
async function clearCircuitDraft():Promise<void>{
 const db=await openCircuitDraftDb();return new Promise((resolve,reject)=>{const tx=db.transaction("drafts","readwrite");tx.objectStore("drafts").delete(CIRCUIT_DRAFT_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error("Gagal menghapus draft."))});
}

const flag=(code:string)=>/^[A-Z]{2}$/.test(code)?String.fromCodePoint(...code.split("").map(c=>127397+c.charCodeAt(0))):"🏁";
const countryName=(code:string)=>new Intl.DisplayNames(["id"],{type:"region"}).of(code)||code;
const time=(ms:number|null)=>{if(!ms)return "Belum ada record";const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000),v=ms%1000;return m+":"+String(s).padStart(2,"0")+","+String(v).padStart(3,"0")};
const parseTime=(v:string)=>{const m=v.trim().match(/^(\d{1,3}):(\d{2})[.,](\d{3})$/);return m?Number(m[1])*60000+Number(m[2])*1000+Number(m[3]):null};
async function waitForPreviewImage(image:HTMLImageElement){
 if(image.complete){
  if(image.naturalWidth>0&&image.naturalHeight>0)return;
  throw new Error("Preview gambar belum berhasil dimuat. Pilih ulang file gambar.");
 }
 await new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{image.removeEventListener("load",onLoad);image.removeEventListener("error",onError)};
  const onLoad=()=>{cleanup();resolve()};
  const onError=()=>{cleanup();reject(new Error("Browser gagal memuat preview gambar. Pilih ulang file atau simpan ulang sebagai PNG, JPG, atau WEBP."))};
  image.addEventListener("load",onLoad,{once:true});
  image.addEventListener("error",onError,{once:true});
 });
 if(!image.naturalWidth||!image.naturalHeight)throw new Error("Dimensi gambar tidak valid.");
}
async function convertAndUpload(file:File,previewImage:HTMLImageElement|null){
 if(!file.type.startsWith("image/"))throw new Error("Pilih file gambar yang valid.");
 if(file.size>15*1024*1024)throw new Error("Ukuran gambar sumber maksimal 15 MB.");
 if(!previewImage)throw new Error("Preview gambar belum siap. Tunggu sampai gambar tampil lalu simpan kembali.");
 // Reuse the exact image element already decoded for the visible preview. This avoids
 // decoding the same Android-selected file a second time through another Blob URL.
 await waitForPreviewImage(previewImage);
 const width=previewImage.naturalWidth,height=previewImage.naturalHeight;
 if(width>5000||height>5000)throw new Error("Resolusi gambar maksimal 5000 × 5000.");
 const canvas=document.createElement("canvas");
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw new Error("Konversi gambar tidak didukung browser.");
 ctx.drawImage(previewImage,0,0,width,height);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Konversi WEBP gagal.")),"image/webp",0.86));
 if(blob.type!=="image/webp")throw new Error("Browser tidak mendukung konversi WEBP. Gunakan browser yang lebih baru atau unggah gambar WEBP.");
 if(blob.size>4*1024*1024)throw new Error("Ukuran WEBP maksimal 4 MB.");
 const path=crypto.randomUUID()+".webp";
 const uploaded=await supabase!.storage.from("circuit-layouts").upload(path,blob,{contentType:"image/webp",upsert:false});
 if(uploaded.error)throw uploaded.error;
 return {path,url:supabase!.storage.from("circuit-layouts").getPublicUrl(path).data.publicUrl};
}
function oldImagePath(url:string|null){if(!url)return null;const marker="/object/public/circuit-layouts/";const i=url.indexOf(marker);return i<0?null:decodeURIComponent(url.slice(i+marker.length))}
export function CircuitPool(){
 const [rows,setRows]=useState<Circuit[]>([]),[selected,setSelected]=useState<Circuit|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{if(!supabase)return;const {data,error}=await supabase.from("caleris_circuit_pool").select("*").order("name");if(error)setError(error.message);else{setRows((data||[]) as Circuit[]);setError("")}setLoading(false)},[]);
 useEffect(()=>{const client=supabase;if(!client)return;setLoading(true);void load();const channel=client.channel("circuit-pool-live").on("postgres_changes",{event:"*",schema:"public",table:"caleris_circuits"},()=>{void load()}).subscribe();return()=>{void client.removeChannel(channel)}},[load]);
 useEffect(()=>{if(selected){const updated=rows.find(c=>c.id===selected.id);if(updated)setSelected(updated);else setSelected(null)}},[rows]);
 useEffect(()=>{if(!selected)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setSelected(null)};window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close)}},[selected]);
 return <section className="workspace circuit-pool"><header className="page-heading"><span className="section-eyebrow">MAIN EVENT · CIRCUIT DATABASE</span><h1 className="page-title">Circuit Pool</h1><p className="page-description">Database resmi sirkuit CALERIS MASTERS. Rekor lap mengambil waktu tercepat dari seluruh hasil balapan lintas season.</p></header><section className="workspace-card circuit-directory"><div className="section-title-row"><div><span className="section-eyebrow">OFFICIAL CIRCUIT DIRECTORY</span><h2>Daftar circuit <span className="circuit-count">({rows.length})</span></h2></div><button className="economy-secondary-button" onClick={()=>{setLoading(true);void load()}} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>{error&&<p className="license-notice">{error}</p>}{loading?<p>Memuat circuit pool...</p>:rows.length===0?<p className="s5-empty">Circuit pool belum memiliki data.</p>:<div className="circuit-card-grid">{rows.map(c=><button type="button" key={c.id} className="circuit-reveal-card" onClick={()=>setSelected(c)} aria-label={`Buka detail ${c.name}, ${countryName(c.country_code)}`}><span className="circuit-card-art">{c.image_url?<img src={c.image_url} alt="" loading="lazy"/>:(c.geometry_draft?.points?.length||c.circuit_geometry?.layout?.length)?<svg className="circuit-card-geometry" viewBox="0 0 400 400" aria-label="Unverified geometry draft"><polyline points={geometryPolyline(c.geometry_draft,c.circuit_geometry)}/></svg>:<span className="circuit-card-no-image">LAYOUT UNAVAILABLE</span>}<span className="circuit-card-sheen" aria-hidden="true"/><span className="circuit-card-edge" aria-hidden="true"/></span><span className="circuit-card-caption"><span className="circuit-card-country"><span className="circuit-card-flag" aria-hidden="true">{flag(c.country_code)}</span><span>{countryName(c.country_code)}</span></span><span className="circuit-card-name">{c.name}</span></span><span className="circuit-card-open" aria-hidden="true">VIEW CIRCUIT <span>↗</span></span></button>)}</div>}</section>{selected&&<div className="circuit-modal-backdrop circuit-reveal-backdrop" role="presentation" onClick={()=>setSelected(null)}><section className="circuit-modal circuit-reveal-dialog" role="dialog" aria-modal="true" aria-labelledby="circuit-modal-title" onClick={e=>e.stopPropagation()}><div className="circuit-modal-head"><div><span className="section-eyebrow">{flag(selected.country_code)} {countryName(selected.country_code)} · CIRCUIT PROFILE</span><h2 id="circuit-modal-title">{selected.name}</h2></div><button aria-label="Tutup detail circuit" onClick={()=>setSelected(null)}><X/></button></div>{selected.image_url&&<div className="circuit-reveal-hero"><img className="circuit-layout-image" src={selected.image_url} alt={`Layout ${selected.name}`} loading="eager"/><span className="circuit-reveal-scan" aria-hidden="true"/><span className="circuit-reveal-corner" aria-hidden="true"/></div>}{selected.geometry_draft?.points?.length&&<section className="circuit-geometry-public"><div className="section-title-row"><div><span className="section-eyebrow">IMPORTED CENTERLINE</span><h3>Geometry draft</h3></div><span className={"circuit-geometry-status "+(selected.geometry_status==="verified"?"verified":selected.geometry_status==="rejected"?"rejected":"unverified")}>{(selected.geometry_status||"unverified").toUpperCase()}</span></div><svg viewBox="0 0 400 400" role="img" aria-label={`Unverified centerline draft ${selected.name}`}><polyline points={geometryPolyline(selected.geometry_draft)}/></svg><p>{Math.round(selected.geometry_draft.totalLengthMeters).toLocaleString("id-ID")} m · {selected.geometry_draft.points.length} points · {selected.geometry_draft.isClosed?"Closed":"Open"} · {selected.geometry_draft.hasElevationData?"Elevation available":"No elevation"}</p><small>Source: {selected.source_provenance?.provider||"Unknown"} · License: {selected.source_provenance?.licenseId||"Unknown"}</small><ul>{selected.geometry_draft.warnings.slice(0,3).map((warning,index)=><li key={index}>{warning}</li>)}</ul></section>}{selected.circuit_geometry?.layout?.length ? <section className="circuit-geometry-public"><div className="section-title-row"><div><span className="section-eyebrow">CIRCUIT MAKER · VERSIONED GEOMETRY</span><h3>Geometry revision {selected.geometry_revision}</h3></div><span className="circuit-geometry-status unverified">DRAFT REVIEW</span></div><svg viewBox="0 0 400 400" role="img" aria-label={"Circuit Maker geometry "+selected.name}><polyline points={geometryPolyline(null,selected.circuit_geometry)}/></svg><p>{Math.round(selected.circuit_geometry.trackLengthMeters).toLocaleString("id-ID")} m · {selected.circuit_geometry.segments.length} segments · {selected.circuit_geometry.layout.length} path points · {selected.circuit_geometry.kind||"kind unavailable"}</p><small>Geometry revision is immutable in revision history. Official use still requires the circuit release review.</small></section> : null}<div className="circuit-detail-grid">{[["Total lap",selected.total_laps],["Lap record time",time(selected.lap_record_ms)],["Record holder",selected.lap_record_driver_name||"Belum diketahui"],["AVG track temp",selected.avg_track_temp_c+" °C"],["DRS zone",selected.drs_zones],["Straight",selected.straights],["Low speed corner",selected.low_speed_corners],["High speed corner",selected.high_speed_corners],["Grip level",selected.grip_level+"/100"]].map(([k,v])=><div key={String(k)}><small>{k}</small><strong>{v}</strong></div>)}</div><p className="circuit-record-note">Lap record selalu mengambil waktu tercepat yang tercatat. Waktu yang lebih lambat tidak menggantikan record sebelumnya.</p></section></div>}</section>
}
export function CircuitPoolInput(){
 const [rows,setRows]=useState<Circuit[]>([]),[loading,setLoading]=useState(true),[form,setForm]=useState<CircuitForm>(emptyForm),[editingId,setEditingId]=useState<string|null>(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState(""),[layoutFile,setLayoutFile]=useState<File|null>(null),[layoutPreview,setLayoutPreview]=useState("");
 const [draftReady,setDraftReady]=useState(false),[draftRestored,setDraftRestored]=useState(false),[draftError,setDraftError]=useState("");
 const [geoJsonText,setGeoJsonText]=useState("");
 const [geoJsonFileName,setGeoJsonFileName]=useState("");
 const [geoJsonMeta,setGeoJsonMeta]=useState<CircuitGeoJsonSourceMetadata>(emptyGeoJsonMeta);
 const [geoJsonDraft,setGeoJsonDraft]=useState<CircuitGeoJsonImportDraft|null>(null);
 const [geoJsonError,setGeoJsonError]=useState("");
 const [circuitGeometry,setCircuitGeometry]=useState<CircuitGeometryDefinition|null>(null);
 const layoutPreviewImage=useRef<HTMLImageElement|null>(null);
 useEffect(()=>{
  let cancelled=false;
  void readCircuitDraft().then(draft=>{
   if(cancelled)return;
   if(draft){
    setForm(draft.form||emptyForm);setEditingId(draft.editingId||null);
    setGeoJsonText(draft.geoJsonText||"");setGeoJsonFileName(draft.geoJsonFileName||"");setGeoJsonMeta(draft.geoJsonMeta||emptyGeoJsonMeta);setGeoJsonDraft(draft.geoJsonDraft||null);setCircuitGeometry(draft.circuitGeometry||null);
    if(draft.layoutFile&&draft.layoutFileName){
     const file=new File([draft.layoutFile],draft.layoutFileName,{type:draft.layoutFileType||"application/octet-stream",lastModified:draft.layoutFileLastModified||Date.now()});
     setLayoutFile(file);setLayoutPreview(URL.createObjectURL(file));
    }else if(draft.layoutPreview)setLayoutPreview(draft.layoutPreview);
    setDraftRestored(Boolean(draft.editingId||draft.layoutFile||draft.geoJsonText||draft.circuitGeometry||Object.values(draft.form||{}).some(Boolean)));
   }
   setDraftReady(true);
  }).catch(error=>{if(!cancelled){setDraftError(error instanceof Error?error.message:"Draft lokal tidak dapat dibaca.");setDraftReady(true)}});
  return()=>{cancelled=true};
 },[]);
 useEffect(()=>{
  if(!draftReady||saving)return;
  const persist=()=>{
   const hasContent=Boolean(editingId||layoutFile||geoJsonText||circuitGeometry||Object.values(form).some(Boolean));
   const draft:CircuitPoolDraft={key:CIRCUIT_DRAFT_KEY,form,editingId,layoutFile,layoutFileName:layoutFile?.name||null,layoutFileType:layoutFile?.type||null,layoutFileLastModified:layoutFile?.lastModified||null,layoutPreview:layoutFile?"":layoutPreview.startsWith("blob:")?"":layoutPreview,geoJsonText,geoJsonFileName,geoJsonMeta,geoJsonDraft,circuitGeometry};
   const operation=hasContent?writeCircuitDraft(draft):clearCircuitDraft();
   void operation.then(()=>setDraftError("")).catch(error=>setDraftError(error instanceof Error?error.message:"Draft gagal disimpan."));
  };
  const timer=window.setTimeout(persist,250);
  const flushOnHide=()=>persist();
  const flushWhenHidden=()=>{if(document.visibilityState==="hidden")persist()};
  window.addEventListener("pagehide",flushOnHide);
  document.addEventListener("visibilitychange",flushWhenHidden);
  return()=>{window.clearTimeout(timer);window.removeEventListener("pagehide",flushOnHide);document.removeEventListener("visibilitychange",flushWhenHidden)};
 },[draftReady,saving,form,editingId,layoutFile,layoutPreview,geoJsonText,geoJsonFileName,geoJsonMeta,geoJsonDraft,circuitGeometry]);

 const set=(key:keyof CircuitForm,value:string)=>setForm(v=>({...v,[key]:value}));
 const setGeoMeta=(key:keyof CircuitGeoJsonSourceMetadata,value:string)=>{setGeoJsonMeta(current=>({...current,[key]:value}));if(geoJsonText)setGeoJsonDraft(null)};
 const previewGeoJson=async()=>{
  if(!geoJsonText){setGeoJsonError("Pilih file GeoJSON terlebih dahulu.");return}
  setSaving(true);setGeoJsonError("");
  try{
   const metadata={...geoJsonMeta,retrievedAt:geoJsonMeta.retrievedAt||new Date().toISOString()};
   const draft=await importCircuitGeoJsonDraft(geoJsonText,metadata);
   setGeoJsonMeta(metadata);setGeoJsonDraft(draft);setGeoJsonError("");
  }catch(error){setGeoJsonDraft(null);setGeoJsonError(error instanceof Error?error.message:"GeoJSON tidak dapat diproses.")}
  finally{setSaving(false)}
 };
 const load=useCallback(async()=>{if(!supabase)return;const [{data:base,error:baseError},{data:pool,error:poolError}]=await Promise.all([supabase.from("caleris_circuits").select("id,name,country_code,image_url,total_laps,avg_track_temp_c,drs_zones,straights,low_speed_corners,high_speed_corners,grip_level,initial_lap_record_ms,initial_lap_record_driver_name,geometry_draft,source_provenance,geometry_status,circuit_geometry,geometry_revision,circuit_kind").order("name"),supabase.from("caleris_circuit_pool").select("id,lap_record_ms,lap_record_driver_name")]);if(baseError||poolError){setNotice(baseError?.message||poolError?.message||"Gagal memuat circuit.");setLoading(false);return}const recordMap=new Map((pool||[]).map((x:any)=>[x.id,{time:x.lap_record_ms,driver:x.lap_record_driver_name}]));setRows((base||[]).map((c:any)=>({...c,lap_record_ms:recordMap.get(c.id)?.time??c.initial_lap_record_ms,lap_record_driver_name:recordMap.get(c.id)?.driver??c.initial_lap_record_driver_name})) as Circuit[]);setLoading(false)},[]);
 useEffect(()=>{const client=supabase;if(!client)return;void load();const channel=client.channel("circuit-pool-input-live").on("postgres_changes",{event:"*",schema:"public",table:"caleris_circuits"},()=>{void load()}).subscribe();return()=>{void client.removeChannel(channel)}},[load]);
 useEffect(()=>()=>{if(layoutPreview.startsWith("blob:"))URL.revokeObjectURL(layoutPreview)},[layoutPreview]);
 const reset=()=>{setCircuitGeometry(null);setEditingId(null);setForm(emptyForm);setLayoutFile(null);setLayoutPreview("");setGeoJsonText("");setGeoJsonFileName("");setGeoJsonMeta(emptyGeoJsonMeta);setGeoJsonDraft(null);setGeoJsonError("");setDraftRestored(false);setNotice("")};
 const edit=(c:Circuit)=>{setEditingId(c.id);setForm({name:c.name,country_code:c.country_code,total_laps:String(c.total_laps),avg_track_temp_c:String(c.avg_track_temp_c),drs_zones:String(c.drs_zones),straights:String(c.straights),low_speed_corners:String(c.low_speed_corners),high_speed_corners:String(c.high_speed_corners),grip_level:String(c.grip_level),initial_record:c.initial_lap_record_ms?time(c.initial_lap_record_ms).replace(",","."):"",initial_record_driver_name:c.initial_lap_record_driver_name||""});setLayoutFile(null);setLayoutPreview(c.image_url||"");setGeoJsonText("");setGeoJsonFileName("");setGeoJsonDraft(c.geometry_draft||null);setCircuitGeometry(c.circuit_geometry||null);setGeoJsonMeta(c.source_provenance?{provider:c.source_provenance.provider,sourceUrl:c.source_provenance.sourceUrl,licenseId:c.source_provenance.licenseId,attribution:c.source_provenance.attribution,retrievedAt:c.source_provenance.retrievedAt,sourceRevision:c.source_provenance.sourceRevision,knownLimitations:c.source_provenance.knownLimitations}:emptyGeoJsonMeta);setGeoJsonError("");setNotice("")};
 const submit=async(e:FormEvent)=>{e.preventDefault();if(!supabase)return;const record=form.initial_record.trim()?parseTime(form.initial_record):null;if(form.initial_record.trim()&&!record){setNotice("Format lap record harus m:ss.mmm, contoh 1:32.456.");return}if(record&&!form.initial_record_driver_name.trim()){setNotice("Nama driver pemegang lap record awal wajib diisi.");return}if(!editingId&&!layoutFile){setNotice("Gambar layout sirkuit wajib diunggah.");return}if(geoJsonText&&!geoJsonDraft){setNotice("Preview GeoJSON harus berhasil sebelum data geometry disimpan.");return}
 setSaving(true);setNotice("");let uploaded:{path:string;url:string}|null=null;try{if(layoutFile)uploaded=await convertAndUpload(layoutFile,layoutPreviewImage.current);const values={name:form.name.trim(),country_code:form.country_code,total_laps:Number(form.total_laps),avg_track_temp_c:Number(form.avg_track_temp_c),drs_zones:Number(form.drs_zones),straights:Number(form.straights),low_speed_corners:Number(form.low_speed_corners),high_speed_corners:Number(form.high_speed_corners),grip_level:Number(form.grip_level),initial_lap_record_ms:record,initial_lap_record_driver_name:record?form.initial_record_driver_name.trim():null,geometry_draft:geoJsonDraft??(editingId?rows.find(c=>c.id===editingId)?.geometry_draft??null:null),source_provenance:geoJsonDraft?.sourceProvenance??(editingId?rows.find(c=>c.id===editingId)?.source_provenance??null:null),geometry_status:geoJsonText&&geoJsonDraft?"unverified":(editingId?rows.find(c=>c.id===editingId)?.geometry_status??"missing":"missing"),...(uploaded?{image_url:uploaded.url}:{})};
 let savedCircuitId=editingId||"";
 let savedRevision=0;
 if(editingId){
  const {data,error}=await supabase.from("caleris_circuits").update(values).eq("id",editingId).select("id,geometry_revision").single();
  if(error){if(uploaded)await supabase.storage.from("circuit-layouts").remove([uploaded.path]);throw error}
  savedCircuitId=data.id;savedRevision=Number(data.geometry_revision||0);
 }else{
  const {data,error}=await supabase.from("caleris_circuits").insert({...values,created_by:(await supabase.auth.getUser()).data.user?.id||null}).select("id,geometry_revision").single();
  if(error){if(uploaded)await supabase.storage.from("circuit-layouts").remove([uploaded.path]);throw error}
  savedCircuitId=data.id;savedRevision=Number(data.geometry_revision||0);
 }
 if(circuitGeometry){
  const geometryToSave={...circuitGeometry,id:savedCircuitId,revision:"rev-"+String(savedRevision+1)};
  const {error:revisionError}=await supabase.rpc("save_caleris_circuit_revision",{p_circuit_id:savedCircuitId,p_geometry:geometryToSave});
  if(revisionError)throw new Error("Data circuit tersimpan, tetapi geometry revision gagal disimpan: "+revisionError.message);
  setCircuitGeometry(geometryToSave);
 }
 if(editingId&&uploaded){const old=rows.find(c=>c.id===editingId);const path=oldImagePath(old?.image_url||null);if(path)await supabase.storage.from("circuit-layouts").remove([path])}
 setNotice(editingId?"Data circuit berhasil diperbarui.":"Circuit berhasil ditambahkan.");setForm(emptyForm);setEditingId(null);setLayoutFile(null);setLayoutPreview("");setGeoJsonText("");setGeoJsonFileName("");setGeoJsonMeta(emptyGeoJsonMeta);setGeoJsonDraft(null);setGeoJsonError("");setCircuitGeometry(null);setDraftRestored(false);await load();
 }catch(err){setNotice(err instanceof Error?err.message:"Gagal menyimpan circuit.")}finally{setSaving(false)}};
 return <section className="workspace circuit-pool"><header className="page-heading"><span className="section-eyebrow">FIA PANEL · CIRCUIT DATABASE</span><h1 className="page-title">Circuit Pool Input</h1><p className="page-description">Kelola seluruh master circuit. Perubahan tersimpan ke database dan langsung tersinkron ke halaman Circuit Pool.</p></header><section className="workspace-card circuit-admin-list"><div className="section-title-row"><div><span className="section-eyebrow">EXISTING CIRCUITS</span><h2>Data circuit tersimpan ({rows.length})</h2></div><button className="economy-secondary-button" onClick={()=>{setLoading(true);void load()}} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>{loading?<p>Memuat data circuit...</p>:rows.length===0?<p className="s5-empty">Belum ada circuit. Tambahkan melalui form di bawah.</p>:<div className="s5-table-wrap"><table className="s5-table circuit-admin-table"><thead><tr><th>Circuit</th><th>Negara</th><th>Total lap</th><th>AVG temp</th><th>DRS</th><th>Straight</th><th>Low corner</th><th>High corner</th><th>Grip</th><th>Lap record</th><th>Layout</th><th>Geometry</th><th>Maker revision</th><th>Aksi</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{flag(c.country_code)} {countryName(c.country_code)}</td><td>{c.total_laps}</td><td>{c.avg_track_temp_c} °C</td><td>{c.drs_zones}</td><td>{c.straights}</td><td>{c.low_speed_corners}</td><td>{c.high_speed_corners}</td><td>{c.grip_level}/100</td><td>{time(c.lap_record_ms)}</td><td>{c.image_url?<a href={c.image_url} target="_blank" rel="noreferrer">Lihat layout</a>:"Tidak ada"}</td><td><span className={"circuit-geometry-status "+(c.geometry_status==="unverified"?"unverified":c.geometry_status==="verified"?"verified":"")}>{(c.geometry_status||"missing").toUpperCase()}</span></td><td>{c.geometry_revision>0?"REV "+c.geometry_revision:"—"}</td><td><button type="button" className="economy-secondary-button circuit-edit-button" onClick={()=>edit(c)}><Pencil size={14}/> Edit</button></td></tr>)}</tbody></table></div>}</section><section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">{editingId?"EDIT CIRCUIT":"NEW CIRCUIT"}</span><h2>{editingId?"Edit data circuit":"Tambah circuit baru"}</h2></div>{editingId&&<button type="button" className="economy-secondary-button" onClick={reset}>Batal edit</button>}</div><form className="s5-form circuit-input-form" onSubmit={submit}>{draftRestored&&<p className="economy-form-hint">Draft sebelumnya dipulihkan dari penyimpanan lokal perangkat ini. File layout yang dipulihkan siap diunggah tanpa memilih ulang.</p>}{draftError&&<p className="license-notice" role="status">Draft lokal: {draftError}</p>}<label className="s5-field"><span>Nama circuit *</span><input value={form.name} onChange={e=>set("name",e.target.value)} maxLength={160} required/></label><label className="s5-field"><span>Negara circuit *</span><CountryCodeSelect value={form.country_code} onChange={v=>set("country_code",v)}/></label><div className="circuit-input-grid">{([["total_laps","Total lap"],["avg_track_temp_c","AVG track temp (°C)"],["drs_zones","DRS zone"],["straights","Straight"],["low_speed_corners","Low speed corner"],["high_speed_corners","High speed corner"],["grip_level","Grip level (0–100)"]] as const).map(([key,label])=><label className="s5-field" key={key}><span>{label} *</span><input type="number" min={key==="avg_track_temp_c"?"-50":key==="total_laps"?"1":"0"} max={key==="grip_level"?"100":undefined} step={key==="avg_track_temp_c"||key==="grip_level"?"0.01":"1"} value={form[key]} onChange={e=>set(key,e.target.value)} required/></label>)}</div><CircuitMaker key={editingId||"new-circuit"} circuitId={editingId||"new-circuit"} name={form.name} countryCode={form.country_code} totalLaps={Number(form.total_laps)||0} value={circuitGeometry} importedGeoJsonDraft={geoJsonDraft} sourceProvenance={geoJsonDraft?.sourceProvenance??circuitGeometry?.sourceProvenance??(editingId?rows.find(c=>c.id===editingId)?.source_provenance:null)} onChange={setCircuitGeometry}/><label className="s5-field"><span>Gambar layout sirkuit {editingId?"(opsional, upload untuk mengganti)":"*"}</span><input type="file" accept="image/png,image/jpeg,image/webp" required={!editingId} onChange={e=>{const file=e.target.files?.[0]||null;setLayoutFile(file);setLayoutPreview(file?URL.createObjectURL(file):editingId?(rows.find(c=>c.id===editingId)?.image_url||""):"")}}/></label>{layoutPreview&&<img ref={layoutPreviewImage} className="circuit-layout-preview" src={layoutPreview} alt="Preview layout sirkuit"/>}
<section className="circuit-geojson-editor">
 <div className="section-title-row"><div><span className="section-eyebrow">TRACK GEOMETRY · SOURCE REQUIRED</span><h3>GeoJSON centerline draft</h3></div><span className={geoJsonDraft?"circuit-geometry-status unverified":"circuit-geometry-status"}>{geoJsonDraft?"UNVERIFIED DRAFT":"NOT IMPORTED"}</span></div>
 <p className="economy-form-hint">Unggah satu GeoJSON LineString. Data hanya menjadi draft geometri; sektor, tikungan, lebar lintasan, pit lane, DRS, dan track limits tetap perlu verifikasi manual. Tidak ada nilai yang ditebak.</p>
 <label className="s5-field"><span>File GeoJSON (opsional)</span><input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;setGeoJsonText("");setGeoJsonFileName("");setGeoJsonDraft(null);if(file.size>10*1024*1024){setGeoJsonError("Ukuran GeoJSON maksimal 10 MB.");return}try{const text=await file.text();setGeoJsonText(text);setGeoJsonFileName(file.name);setGeoJsonError("")}catch{setGeoJsonError("File GeoJSON tidak dapat dibaca.")}}}/></label>
 {geoJsonFileName&&<p className="economy-form-hint">File dipilih: {geoJsonFileName}</p>}
 <div className="circuit-input-grid">
  <label className="s5-field"><span>Data provider *</span><input value={geoJsonMeta.provider} disabled={!geoJsonText} onChange={event=>setGeoMeta("provider",event.target.value)} placeholder="Nama provider data"/></label>
  <label className="s5-field"><span>Source URL (HTTPS) *</span><input type="url" value={geoJsonMeta.sourceUrl} disabled={!geoJsonText} onChange={event=>setGeoMeta("sourceUrl",event.target.value)} placeholder="https://..."/></label>
  <label className="s5-field"><span>License ID *</span><input value={geoJsonMeta.licenseId} disabled={!geoJsonText} onChange={event=>setGeoMeta("licenseId",event.target.value)} placeholder="ID lisensi data"/></label>
  <label className="s5-field"><span>Attribution *</span><input value={geoJsonMeta.attribution} disabled={!geoJsonText} onChange={event=>setGeoMeta("attribution",event.target.value)} placeholder="Atribusi sumber"/></label>
  <label className="s5-field"><span>Source revision *</span><input value={geoJsonMeta.sourceRevision} disabled={!geoJsonText} onChange={event=>setGeoMeta("sourceRevision",event.target.value)} placeholder="Versi / revision sumber"/></label>
 </div>
 <button type="button" className="economy-secondary-button" disabled={saving||!geoJsonText} onClick={()=>void previewGeoJson()}>{saving?"Memproses...":"Preview GeoJSON"}</button>
 {geoJsonError&&<p className="license-notice" role="alert">{geoJsonError}</p>}
 {geoJsonDraft&&<div className="circuit-geojson-result">
  <svg viewBox="0 0 400 400" role="img" aria-label="Preview centerline GeoJSON"><polyline points={geometryPolyline(geoJsonDraft)} /></svg>
  <div className="circuit-geojson-metrics"><span><b>{Math.round(geoJsonDraft.totalLengthMeters).toLocaleString("id-ID")} m</b>Centerline</span><span><b>{geoJsonDraft.points.length}</b>Points</span><span><b>{geoJsonDraft.isClosed?"Closed":"Open"}</b>Closure</span><span><b>{geoJsonDraft.hasElevationData?"Available":"Missing"}</b>Elevation</span></div>
  <small>SHA-256: {geoJsonDraft.sourceProvenance.geometryHash}</small>
  <ul>{geoJsonDraft.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
 </div>}
</section>
<label className="s5-field"><span>Lap record time (opsional)</span><input value={form.initial_record} onChange={e=>set("initial_record",e.target.value)} placeholder="m:ss.mmm · contoh 1:32.456"/></label><label className="s5-field"><span>Nama driver pemegang record awal</span><input value={form.initial_record_driver_name} onChange={e=>set("initial_record_driver_name",e.target.value)} maxLength={120} placeholder="Nama driver"/></label><p className="economy-form-hint">Record awal hanya menjadi nilai pembuka. Fastest lap dari hasil race resmi akan menggantikannya jika lebih cepat.</p><button className="s5-primary" disabled={saving||!form.country_code}>{saving?"Menyimpan...":editingId?"Simpan perubahan":"Simpan circuit"}</button>{notice&&<p className="license-notice" role="status">{notice}</p>}</form></section></section>
}