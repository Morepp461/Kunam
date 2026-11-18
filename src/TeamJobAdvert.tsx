import {useEffect,useMemo,useState} from "react";
import {BriefcaseBusiness,LoaderCircle,Send} from "lucide-react";
import {supabase} from "./lib/supabase";
import "./marketplace-directory.css";

type SalaryBand={license_label:string;license_tier:string;salary_min_eur:number;salary_max_eur:number;sort_order:number};
type Row=Record<string,any>;

const euro=(value:number)=>"€ "+Number(value||0).toLocaleString("id-ID",{maximumFractionDigits:0});

export default function TeamJobAdvert(){
 const [team,setTeam]=useState<Row|null>(null),[bands,setBands]=useState<SalaryBand[]>([]),[adverts,setAdverts]=useState<Row[]>([]);
 const [position,setPosition]=useState<"Driver"|"Team Owner">("Driver"),[license,setLicense]=useState("");
 const [salaryMin,setSalaryMin]=useState(""),[salaryMax,setSalaryMax]=useState("");
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[requirements,setRequirements]=useState("");
 const [openSeats,setOpenSeats]=useState("1"),[availableFrom,setAvailableFrom]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");

 const load=async()=>{
  if(!supabase){setLoading(false);return;}
  setLoading(true);setNotice("");
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){setNotice(userError?.message||"Sesi akun tidak ditemukan.");setLoading(false);return;}
  const {data:profile,error:profileError}=await supabase.from("profiles").select("member_id").eq("user_id",user.id).maybeSingle();
  if(profileError||!profile?.member_id){setNotice(profileError?.message||"Karakter Team Owner tidak ditemukan.");setLoading(false);return;}
  const {data:member,error:memberError}=await supabase.from("members").select("id,role,team_id").eq("id",profile.member_id).maybeSingle();
  if(memberError||!member||member.role!=="Owner"||!member.team_id){setNotice(memberError?.message||"Halaman ini hanya tersedia untuk Team Owner yang terhubung dengan tim.");setLoading(false);return;}
  const [teamResult,bandResult,advertResult]=await Promise.all([
   supabase.from("teams").select("id,name,division_key").eq("id",member.team_id).maybeSingle(),
   supabase.from("caleris_driver_salary_bands").select("license_label,license_tier,salary_min_eur,salary_max_eur,sort_order").order("sort_order"),
   supabase.from("caleris_job_adverts").select("id,title,position_kind,minimum_license,salary_min,salary_max,open_seats,status,created_at").eq("team_id",member.team_id).order("created_at",{ascending:false})
  ]);
  if(teamResult.error||bandResult.error||advertResult.error){setNotice(teamResult.error?.message||bandResult.error?.message||advertResult.error?.message||"Gagal memuat lowongan.");setLoading(false);return;}
  setTeam(teamResult.data);setBands((bandResult.data||[]) as SalaryBand[]);setAdverts(advertResult.data||[]);
  setLoading(false);
 };
 useEffect(()=>{void load()},[]);
 const selectedBand=useMemo(()=>bands.find(b=>b.license_label===license)||null,[bands,license]);
 const salaryCeiling=useMemo(()=>bands.reduce((max,b)=>Math.max(max,Number(b.salary_max_eur)),0),[bands]);

 const changePosition=(value:"Driver"|"Team Owner")=>{
  setPosition(value);
  if(value==="Team Owner"){setLicense("");setSalaryMin("");setSalaryMax("");}
 };
 const changeLicense=(value:string)=>{
  setLicense(value);
  const band=bands.find(b=>b.license_label===value);
  if(band){setSalaryMin(String(band.salary_min_eur));setSalaryMax(String(salaryCeiling));}
  else{setSalaryMin("");setSalaryMax("");}
 };
 const publish=async(e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(!supabase||!team)return;
  if(position==="Driver"){
   const min=Number(salaryMin),max=Number(salaryMax);
   if(!selectedBand||!Number.isFinite(min)||!Number.isFinite(max)||min<Number(selectedBand.salary_min_eur)||max>salaryCeiling||max<min){
    setNotice("Rentang gaji harus sesuai lisensi minimum dan batas maksimum Super License.");return;
   }
  }
  setSaving(true);setNotice("");
  const {data:{user}}=await supabase.auth.getUser();
  const {data:season}=await supabase.from("license_seasons").select("id").eq("status","active").order("starts_on",{ascending:false}).limit(1).maybeSingle();
  const {error}=await supabase.from("caleris_job_adverts").insert({
   team_id:team.id,season_id:season?.id||null,division_key:team.division_key||null,
   position_kind:position,title:title.trim()||("Lowongan "+position),
   description:description.trim(),requirements:requirements.trim()||null,
   open_seats:Math.max(1,Math.floor(Number(openSeats)||1)),available_from:availableFrom||null,
   status:"published",created_by:user?.id||null,
   minimum_license:position==="Driver"?license:null,
   salary_min:position==="Driver"?Number(salaryMin):null,
   salary_max:position==="Driver"?Number(salaryMax):null
  });
  setSaving(false);
  if(error){setNotice(error.message);return;}
  setNotice("Lowongan "+position+" berhasil dipublikasikan untuk "+team.name+".");
  setTitle("");setDescription("");setRequirements("");setOpenSeats("1");setAvailableFrom("");
  await load();
 };

 return <section className="workspace">
  <header className="page-heading"><span className="section-eyebrow">TEAM PANEL · RECRUITMENT</span><h1 className="page-title">Place Job Advert</h1><p className="page-description">Terbitkan lowongan resmi untuk tim yang terhubung dengan akunmu. Identitas tim ditentukan otomatis dari karakter Team Owner.</p></header>
  {loading?<div className="workspace-card"><LoaderCircle className="spin"/> Memuat identitas tim...</div>:!team?<div className="workspace-card"><p>{notice||"Tim tidak ditemukan."}</p></div>:<>
   <section className="workspace-card">
    <div className="section-title-row"><div><span className="section-eyebrow">RECRUITMENT FORM</span><h2>Publish Team Vacancy</h2></div><BriefcaseBusiness size={20}/></div>
    <div className="team-contracts-muted">Tim: <strong>{team.name}</strong> · {team.division_key||"Divisi belum ditetapkan"}</div>
    <form className="license-form" onSubmit={publish}>
     <label>Position<select required value={position} onChange={e=>changePosition(e.target.value as "Driver"|"Team Owner")}><option value="Driver">Driver</option><option value="Team Owner">Team Owner</option></select></label>
     {position==="Driver"&&<>
      <label>Minimum driver license<select required value={license} onChange={e=>changeLicense(e.target.value)}><option value="">Pilih lisensi minimum</option>{bands.map(b=><option key={b.license_label} value={b.license_label}>{b.license_label}</option>)}</select></label>
      <div className="license-form-row">
       <label>Salary minimum (€)<input required type="number" min={selectedBand?.salary_min_eur||1} max={salaryCeiling||undefined} step="1000" value={salaryMin} onChange={e=>setSalaryMin(e.target.value)} placeholder="Minimum salary"/></label>
       <label>Salary maximum (€)<input required type="number" min={salaryMin||selectedBand?.salary_min_eur||1} max={salaryCeiling||undefined} step="1000" value={salaryMax} onChange={e=>setSalaryMax(e.target.value)} placeholder="Maximum salary"/></label>
      </div>
      {selectedBand&&<p className="license-muted">Lisensi {selectedBand.license_label}: minimum {euro(Number(selectedBand.salary_min_eur))}. Batas maksimum lowongan mengikuti Super License: {euro(salaryCeiling)}.</p>}
     </>}
     <label>Advert title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Opsional"/></label>
     <label>Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Informasi tambahan (opsional)"/></label>
     <label>Requirements<textarea rows={3} value={requirements} onChange={e=>setRequirements(e.target.value)} placeholder="Persyaratan tambahan (opsional)"/></label>
     <label>Open seats<input type="number" min="1" step="1" value={openSeats} onChange={e=>setOpenSeats(e.target.value)}/></label>
     <label>Available from<input type="date" value={availableFrom} onChange={e=>setAvailableFrom(e.target.value)}/></label>
     <button className="action primary" disabled={saving||!team|| (position==="Driver"&&(!selectedBand||!salaryMin||!salaryMax))}><Send size={15}/>{saving?"Publishing...":"Publish to Job Search"}</button>
    </form>
    {notice&&<p className="license-notice" role="status">{notice}</p>}
   </section>
   <section className="workspace-card"><div className="section-title-row"><div><span className="section-eyebrow">YOUR TEAM LISTINGS</span><h2>Published vacancies</h2></div><span className="empty-tag">{adverts.length} listing</span></div>
    {adverts.length===0?<p className="team-contracts-muted">Belum ada lowongan dari {team.name}.</p>:adverts.map(advert=><article className="team-contract-row" key={advert.id}><div><strong>{advert.title}</strong><small>{advert.position_kind}{advert.minimum_license?" · "+advert.minimum_license:""}</small><small>{advert.salary_min==null?"Tanpa salary":euro(Number(advert.salary_min))+" – "+euro(Number(advert.salary_max))} · {advert.open_seats} seat · {advert.status}</small></div></article>)}
   </section>
  </>}
 </section>;
}
