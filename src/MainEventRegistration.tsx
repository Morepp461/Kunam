import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { CheckCircle2, ChevronLeft, ChevronRight, Flag, LoaderCircle, ShieldCheck, UploadCloud } from "lucide-react";
import { supabase } from "./lib/supabase";
import { formatImageBytes, optimizeImageToWebp } from "./lib/imageOptimization";
import "./main-event-registration.css";

type Row = Record<string, any>;
type Props = { session: Session };
type Profile = { member_id: string | null; driver_nickname: string | null; web_nickname: string | null; nationality: string | null; hometown: string | null; onboarding_completed: boolean };
type Team = { id: string; name: string; division_key: string | null };
type Engine = { id: string; name: string; manufacturer: string | null; asking_price: number; seller_team_name: string };

const field = (label: string, child: ReactNode, hint?: string) => <label className="mer-field"><span>{label}</span>{child}{hint && <small>{hint}</small>}</label>;

export default function MainEventRegistration({ session }: Props) {
  const [profile,setProfile]=useState<Profile|null>(null);
  const [teams,setTeams]=useState<Team[]>([]);
  const [engines,setEngines]=useState<Engine[]>([]);
  const [step,setStep]=useState(1);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [registration,setRegistration]=useState<Row|null>(null);
  const [nickname,setNickname]=useState("");
  const [role,setRole]=useState<"Driver"|"Owner">("Driver");
  const [avatar,setAvatar]=useState<File|null>(null);
  const [avatarPreview,setAvatarPreview]=useState("");
  const [avatarStats,setAvatarStats]=useState<{originalSize:number;compressedSize:number}|null>(null);
  const [logoStats,setLogoStats]=useState<{originalSize:number;compressedSize:number}|null>(null);
  const [optimizingImage,setOptimizingImage]=useState<"avatar"|"team-logo"|null>(null);
  const [number,setNumber]=useState("");
  const [preferredTeam,setPreferredTeam]=useState("");
  const [epithet,setEpithet]=useState("");
  const [teamName,setTeamName]=useState("");
  const [teamLogo,setTeamLogo]=useState<File|null>(null);
  const [teamLogoPreview,setTeamLogoPreview]=useState("");
  const [baseNation,setBaseNation]=useState("");
  const [teamHometown,setTeamHometown]=useState("");
  const [foundedYear,setFoundedYear]=useState(String(new Date().getFullYear()));
  const [description,setDescription]=useState("");
  const [vision,setVision]=useState("");
  const [longTermTarget,setLongTermTarget]=useState("");
  const [initialDivision,setInitialDivision]=useState("premio");
  const [engineChoice,setEngineChoice]=useState<"new"|"buy">("new");
  const [requestedEngineName,setRequestedEngineName]=useState("");
  const [selectedEngineId,setSelectedEngineId]=useState("");\n  const [engineMarketOpen,setEngineMarketOpen]=useState(false);

  const load=useCallback(async()=>{
    if(!supabase){setNotice("Supabase belum dikonfigurasi.");setLoading(false);return;}
    setLoading(true);setNotice("");
    const [p,t,r,e]=await Promise.all([
      supabase.from("profiles").select("member_id,driver_nickname,web_nickname,nationality,hometown,onboarding_completed").eq("user_id",session.user.id).maybeSingle(),
      supabase.from("caleris_team_directory").select("id,name,division_key").order("name"),
      supabase.from("caleris_member_registrations").select("id,requested_role,status,created_at,review_note").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      supabase.rpc("list_main_event_engine_marketplace")
    ]);
    if(p.error){setNotice(p.error.message);setLoading(false);return;}
    const next=p.data as Profile|null;setProfile(next);
    setNickname(next?.driver_nickname||next?.web_nickname||"");
    if(t.error)setNotice(t.error.message);else setTeams((t.data??[]) as Team[]);
    if(r.error)setNotice(r.error.message);else setRegistration(r.data as Row|null);
    if(e.error)setNotice(e.error.message);else setEngines((e.data??[]) as Engine[]);
    setLoading(false);
  },[session.user.id]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!avatar){setAvatarPreview("");return;}const url=URL.createObjectURL(avatar);setAvatarPreview(url);return()=>URL.revokeObjectURL(url);},[avatar]);
  useEffect(()=>{if(!teamLogo){setTeamLogoPreview("");return;}const url=URL.createObjectURL(teamLogo);setTeamLogoPreview(url);return()=>URL.revokeObjectURL(url);},[teamLogo]);

  const upload=async(bucket:string,file:File)=>{
    if(!supabase)throw new Error("Supabase belum dikonfigurasi.");
    if(file.type!=="image/webp")throw new Error("Upload ditolak: gambar wajib dikonversi ke WebP terlebih dahulu.");
    const maxBytes=bucket==="profile-avatars"?1024*1024:768*1024;
    if(file.size>maxBytes)throw new Error("Ukuran WebP melebihi batas penyimpanan.");
    const uniqueId=typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);
    const path=session.user.id+"/"+bucket+"-"+uniqueId+".webp";
    const {error}=await supabase.storage.from(bucket).upload(path,file,{upsert:false,contentType:"image/webp",cacheControl:"31536000"});
    if(error)throw error;
    return path;
  };
  const onImage=(kind:"avatar"|"team-logo")=>(event:ChangeEvent<HTMLInputElement>)=>{
    const input=event.currentTarget;
    const file=input.files?.[0]??null;
    input.value="";
    if(!file){
      if(kind==="avatar"){setAvatar(null);setAvatarStats(null);}
      else{setTeamLogo(null);setLogoStats(null);}
      return;
    }
    if(optimizingImage)return;
    setOptimizingImage(kind);
    setNotice("");
    void (async()=>{
      try{
        const result=await optimizeImageToWebp(file,kind);
        const stats={originalSize:result.originalSize,compressedSize:result.compressedSize};
        if(kind==="avatar"){setAvatar(result.file);setAvatarStats(stats);}
        else{setTeamLogo(result.file);setLogoStats(stats);}
        const jpegSource=file.type==="image/jpeg"||/\.jpe?g$/i.test(file.name);
        setNotice((kind==="avatar"?"Avatar":"Logo tim")+" berhasil dioptimalkan: "+formatImageBytes(stats.originalSize)+" → "+formatImageBytes(stats.compressedSize)+" (WebP)."+(jpegSource?" Catatan: JPG tidak mendukung transparansi, jadi background tidak otomatis terhapus.":""));
      }catch(error){
        if(kind==="avatar"){setAvatar(null);setAvatarStats(null);}
        else{setTeamLogo(null);setLogoStats(null);}
        setNotice(error instanceof Error?error.message:"Gambar gagal dioptimalkan.");
      }finally{setOptimizingImage(null);}
    })();
  };
  const nextStep=(event:FormEvent)=>{
    event.preventDefault();setNotice("");
    if(!nickname.trim()||nickname.trim().length>32){setNotice("Nickname wajib diisi, maksimal 32 karakter.");return;}
    if(optimizingImage){setNotice("Tunggu sampai optimasi gambar selesai.");return;}
    if(!avatar||avatar.type!=="image/webp"){setNotice("Avatar wajib diunggah dan dikonversi ke WebP.");return;}
    if(role==="Owner"&&(!teamLogo||teamLogo.type!=="image/webp")){setNotice("Logo tim wajib diunggah dan dikonversi ke WebP.");return;}
    setStep(2);
  };
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(!supabase)return;if(optimizingImage){setNotice("Tunggu sampai optimasi gambar selesai.");return;}setSaving(true);setNotice("");
    try{
      const payload:Row={requested_role:role,nickname:nickname.trim()};
      payload.avatar_path=await upload("profile-avatars",avatar!);
      if(role==="Driver"){
        if(!number.trim()||!/^[0-9]{1,4}$/.test(number.trim()))throw new Error("Preferensi nomor Driver wajib 1 sampai 4 digit.");
        if(!epithet.trim())throw new Error("Julukan Driver wajib diisi.");
        payload.driver_number_preference=number.trim();
        payload.preferred_team_id=preferredTeam||null;
        payload.driver_epithet=epithet.trim();
      }else{
        if(!teamName.trim()||!baseNation.trim()||!teamHometown.trim()||!description.trim()||!vision.trim()||!longTermTarget.trim())throw new Error("Lengkapi seluruh informasi tim.");
        payload.team_logo_path=await upload("team-logos",teamLogo!);
        payload.team_name=teamName.trim();
        payload.team_base_nation=baseNation.trim();
        payload.team_hometown=teamHometown.trim();
        payload.team_founded_year=foundedYear;
        payload.team_description=description.trim();
        payload.team_vision=vision.trim();
        payload.team_long_term_target=longTermTarget.trim();
        payload.initial_division=initialDivision;
        payload.engine_choice=engineChoice;
        if(engineChoice==="new"){if(!requestedEngineName.trim())throw new Error("Nama Engine wajib diisi.");payload.requested_engine_name=requestedEngineName.trim();}
        else{if(!selectedEngineId)throw new Error("Pilih Engine yang ingin dibeli.");payload.selected_engine_id=selectedEngineId;}
      }
      const {data,error}=await supabase.rpc("submit_main_event_registration_v2",{p_payload:payload});
      if(error)throw error;
      setRegistration({id:data.registration_id,requested_role:role,status:"pending",created_at:new Date().toISOString()});
      setNotice("Pendaftaran berhasil dikirim dan menunggu persetujuan Admin.");
    }catch(error){setNotice(error instanceof Error?error.message:"Pendaftaran gagal dikirim.");}
    finally{setSaving(false);}
  };

  if(loading)return <section className="workspace"><div className="mer-loading"><LoaderCircle className="mer-spin"/> Memuat formulir pendaftaran...</div></section>;
  if(!profile?.onboarding_completed)return <section className="workspace"><div className="mer-panel"><ShieldCheck/><h1>Paddock Access diperlukan</h1><p>Lengkapi profil dasar terlebih dahulu sebelum mengirim registrasi Main Event.</p></div></section>;
  if(registration?.status==="pending")return <section className="workspace mer-workspace"><header className="page-heading"><span className="section-eyebrow">MAIN EVENT · MEMBER REGISTRATION</span><h1 className="page-title">Pendaftaran Terkirim</h1><p className="page-description">Pengajuanmu sedang menunggu pemeriksaan Admin.</p></header><div className="mer-panel"><CheckCircle2/><h2>Menunggu Persetujuan</h2><p>Role belum aktif. Kamu akan memperoleh akses Main Event sesuai hasil keputusan Admin.</p><span className="mer-status">PENDING REVIEW</span></div></section>;
  if(registration?.status==="approved")return <section className="workspace mer-workspace"><header className="page-heading"><span className="section-eyebrow">MAIN EVENT · MEMBER REGISTRATION</span><h1 className="page-title">Registrasi Disetujui</h1><p className="page-description">Role kamu sudah aktif.</p></header><div className="mer-panel"><CheckCircle2/><h2>Selamat datang di Main Event</h2><p>Role pendaftaran telah disetujui oleh Admin.</p></div></section>;

  return <section className="workspace mer-workspace">
    <header className="page-heading"><span className="section-eyebrow">CALERIS MASTERS · MAIN EVENT</span><h1 className="page-title">Member Registration</h1><p className="page-description">Lengkapi dua tahap pendaftaran. Role dan wallet baru diaktifkan setelah Admin menyetujui pengajuan.</p></header>
    <div className="mer-progress"><span className={step===1?"active":"done"}>01 <b>Identitas & Role</b></span><i/><span className={step===2?"active":""}>02 <b>Detail Pendaftaran</b></span></div>
    {notice&&<div className="mer-notice" role="status">{notice}</div>}
    <form className="mer-card" onSubmit={step===1?nextStep:submit}>
      {step===1?<><div className="mer-card-heading"><span>STEP 01 / 02</span><h2>Identitas Member</h2><p>Data lokasi diambil langsung dari profil dan tidak dapat diedit di formulir ini.</p></div>
        {field("Nickname",<input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={32} required placeholder="Nickname driver"/>)}
        <div className="mer-upload"><div className="mer-image-preview">{avatarPreview?<img src={avatarPreview} alt="Preview avatar"/>:<Flag size={26}/>}</div><div><strong>Avatar · Wajib</strong><p>Driver suit, tanpa background, tampilan setengah badan. PNG/JPG/WebP akan dikompres menjadi WebP. Transparansi PNG/WebP dipertahankan; JPG tetap memiliki background.</p>{avatarStats&&<small className="mer-image-stats">{formatImageBytes(avatarStats.originalSize)} → {formatImageBytes(avatarStats.compressedSize)} · WebP</small>}<label className="mer-upload-button"><UploadCloud size={15}/> {optimizingImage==="avatar"?"Mengoptimalkan...":"Upload avatar"}<input type="file" accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp" onChange={onImage("avatar")} disabled={Boolean(optimizingImage)}/></label></div></div>
        <div className="mer-readonly-grid"><div><span>Nationality</span><strong>{profile.nationality||"Belum tersedia"}</strong></div><div><span>Hometown</span><strong>{profile.hometown||"Belum tersedia"}</strong></div></div>
        {field("Role",<select value={role} onChange={e=>setRole(e.target.value as "Driver"|"Owner")}><option value="Driver">Driver</option><option value="Owner">Team Owner</option></select>,"FIA hanya dapat diberikan melalui undangan khusus Admin.")}
      </>:<><div className="mer-card-heading"><span>STEP 02 / 02</span><h2>{role==="Driver"?"Driver Preferences":"Team Owner Application"}</h2><p>{role==="Driver"?"Preferensi akan diteruskan ke tim pilihan sebagai lamaran Driver.":"Informasi tim akan diperiksa Admin sebelum tim dan wallet dibuat."}</p></div>
        {role==="Driver"?<>
          {field("Preferensi Driver Number",<input inputMode="numeric" value={number} onChange={e=>setNumber(e.target.value.replace(/[^0-9]/g,"").slice(0,4))} placeholder="Contoh: 33" required/>)}
          {field("Preferensi Tim",<select value={preferredTeam} onChange={e=>setPreferredTeam(e.target.value)}><option value="">Tidak memilih tim</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name}{team.division_key?" · "+team.division_key.toUpperCase():""}</option>)}</select>,"Jika memilih tim, lamaran Driver akan langsung masuk ke inbox tim tersebut.")}
          {field("Julukan Driver",<input value={epithet} onChange={e=>setEpithet(e.target.value)} maxLength={60} placeholder="Contoh: Smooth Operator" required/>)}
        </>:<>
          {field("Nama Tim",<input value={teamName} onChange={e=>setTeamName(e.target.value)} maxLength={60} required/>)}
          <div className="mer-upload"><div className="mer-image-preview">{teamLogoPreview?<img src={teamLogoPreview} alt="Preview logo tim"/>:<Flag size={26}/>}</div><div><strong>Logo Tim · Wajib</strong><p>Tanpa background. PNG/JPG/WebP otomatis dikompres menjadi WebP. Transparansi PNG/WebP dipertahankan; JPG tetap memiliki background.</p>{logoStats&&<small className="mer-image-stats">{formatImageBytes(logoStats.originalSize)} → {formatImageBytes(logoStats.compressedSize)} · WebP</small>}<label className="mer-upload-button"><UploadCloud size={15}/> {optimizingImage==="team-logo"?"Mengoptimalkan...":"Upload logo"}<input type="file" accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp" onChange={onImage("team-logo")} disabled={Boolean(optimizingImage)}/></label></div></div>
          {field("Pilih Divisi Awal",<select value={initialDivision} onChange={e=>setInitialDivision(e.target.value)} required><option value="premio">Caleris Premio</option><option value="zwei">Caleris Zwei</option></select>)}
          <div className="mer-engine-choice"><strong>Engine</strong><p>Pilih membuat engine baru atau membeli engine milik tim lain.</p><div className="mer-engine-options"><label><input type="radio" name="engine-choice" checked={engineChoice==="new"} onChange={()=>setEngineChoice("new")}/> Buat Engine Baru</label><label><input type="radio" name="engine-choice" checked={engineChoice==="buy"} onChange={()=>setEngineChoice("buy")}/> Beli Engine</label></div>
          {engineChoice==="new"? <>{field("Nama Engine",<input value={requestedEngineName} onChange={e=>setRequestedEngineName(e.target.value)} maxLength={60} placeholder="Nama engine tim" required/>)}<small className="mer-engine-price">Biaya pembuatan: €80.000.000</small></> : <div className="mer-engine-buy"><button type="button" className="mer-secondary" onClick={()=>setEngineMarketOpen(true)}>Pilih Engine dari Tim Lain</button>{selectedEngineId&&<p>Dipilih: <strong>{engines.find(engine=>engine.id===selectedEngineId)?.name||"Engine"}</strong></p>}{engineMarketOpen&&<div className="mer-engine-overlay" role="presentation" onClick={()=>setEngineMarketOpen(false)}><section className="mer-engine-modal" role="dialog" aria-modal="true" aria-label="Daftar engine yang dijual" onClick={e=>e.stopPropagation()}><div className="mer-engine-modal-head"><div><strong>ENGINE MARKET</strong><p>Pilih engine yang ditawarkan tim lain.</p></div><button type="button" className="mer-secondary" onClick={()=>setEngineMarketOpen(false)}>Tutup</button></div>{engines.length===0?<p>Belum ada engine yang ditawarkan tim lain.</p>:engines.map(engine=><label key={engine.id} className={selectedEngineId===engine.id?"selected":""}><input type="radio" name="selected-engine" checked={selectedEngineId===engine.id} onChange={()=>setSelectedEngineId(engine.id)}/><span><strong>{engine.name}</strong><small>{engine.manufacturer||engine.seller_team_name} · Dijual oleh {engine.seller_team_name}</small></span><b>{new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(engine.asking_price)}</b></label>)}</section></div>}</div>}</div>
          {field("Base Nation",<input value={baseNation} onChange={e=>setBaseNation(e.target.value)} maxLength={80} placeholder="Negara basis tim" required/>)}
          {field("Hometown",<input value={teamHometown} onChange={e=>setTeamHometown(e.target.value)} maxLength={120} placeholder="Kota basis tim" required/>)}
          {field("Tahun Berdiri",<input type="number" min="1800" max={new Date().getFullYear()+1} value={foundedYear} onChange={e=>setFoundedYear(e.target.value)} required/>)}
          {field("Deskripsi Tim",<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} maxLength={1500} required/>)}
          {field("Visi",<textarea rows={3} value={vision} onChange={e=>setVision(e.target.value)} maxLength={1000} required/>)}
          {field("Target Jangka Panjang",<textarea rows={3} value={longTermTarget} onChange={e=>setLongTermTarget(e.target.value)} maxLength={1000} required/>)}
        </>}
      </>}
      <div className="mer-actions">{step===2&&<button type="button" className="mer-secondary" onClick={()=>setStep(1)} disabled={saving}><ChevronLeft size={16}/> Kembali</button>}{step===1?<button type="submit" className="mer-primary" disabled={Boolean(optimizingImage)}>{optimizingImage?"Mengoptimalkan gambar...":<>Lanjut Tahap 2 <ChevronRight size={16}/></>}</button>:<button type="submit" className="mer-primary" disabled={saving||Boolean(optimizingImage)}>{saving?<><LoaderCircle className="mer-spin" size={16}/> Mengirim...</>:<>Kirim Pendaftaran <CheckCircle2 size={16}/></>}</button>}</div>
    </form>
  </section>;
}
