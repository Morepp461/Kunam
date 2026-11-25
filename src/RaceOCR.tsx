import {useState} from "react";
import {createWorker} from "tesseract.js";
import {parseRaceResultOCR,type RaceOCREntry,type RaceOCRDriver,type RaceOCRTeam} from "./lib/race-result-ocr";
type Entry=RaceOCREntry;
type Driver=RaceOCRDriver;
type Team=RaceOCRTeam;
type OCRMeta={rawText:string;sourceImageName:string;confidence:number};
export default function RaceOCR({entries,drivers,teams,onDraft}:{entries:Entry[];drivers:Driver[];teams:Team[];onDraft:(rows:Entry[],meta:OCRMeta)=>void}){
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[raw,setRaw]=useState(""),[message,setMessage]=useState(""),[confidence,setConfidence]=useState<number|null>(null);
 const run=async(file:File)=>{
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setMessage("Pilih gambar PNG, JPG, atau WEBP.");return}
  if(file.size>12*1024*1024){setMessage("Ukuran gambar maksimal 12 MB.");return}
  setBusy(true);setMessage("");setRaw("");setProgress(0);setConfidence(null);let worker:Awaited<ReturnType<typeof createWorker>>|null=null;
  try{
   worker=await createWorker("eng",1,{logger:(event)=>{if(event.status==="recognizing text")setProgress(Math.round((event.progress||0)*100))}});
   const result=await worker.recognize(file);
   const rawText=String(result.data.text||"");
   const parsed=parseRaceResultOCR(rawText,entries,drivers,teams,Number(result.data.confidence||0));
   setRaw(rawText);setConfidence(parsed.confidence);
   onDraft(parsed.rows,{rawText,sourceImageName:file.name,confidence:parsed.confidence});
   setMessage(parsed.matchedDriverCount
    ?`OCR membaca ${parsed.matchedDriverCount} Driver. Confidence ${parsed.confidence.toFixed(0)}%. Draft tersimpan untuk direvisi sebelum konfirmasi.`
    :"Teks berhasil dibaca, tetapi nama Driver belum cocok dengan database. Draft tetap dibuat; pilih Driver dan koreksi data secara manual.");
  }catch(error){setMessage(error instanceof Error?error.message:"OCR gagal membaca gambar. Coba screenshot dengan resolusi lebih tinggi.")}
  finally{if(worker)await worker.terminate();setBusy(false)}
 };
 return <section className="workspace-card race-ocr-card">
  <div className="section-title-row"><div><span className="section-eyebrow">OCR · IMAGE RESULT READER</span><h2>Import race screenshot</h2></div><span className="race-ocr-status">{busy?"Membaca "+progress+"%":"Draft only"}</span></div>
  <p className="page-description">Upload screenshot klasifikasi. OCR mencocokkan nama Driver dan membaca posisi, waktu, gap, status, serta informasi ban yang terbaca. Hasil masuk draft, bukan klasemen resmi.</p>
  <label className="race-ocr-upload"><span>{busy?"Sedang membaca gambar...":"Pilih gambar hasil race"}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void run(file);event.currentTarget.value=""}}/></label>
  {busy&&<div className="race-ocr-progress"><span style={{width:progress+"%"}}/></div>}
  {message&&<p className="race-control-hint" role="status">{message}</p>}
  {confidence!==null&&<p className="race-control-hint">OCR confidence: {confidence.toFixed(1)}% · tetap wajib diperiksa manual.</p>}
  {raw&&<details className="race-ocr-raw"><summary>Periksa teks mentah OCR</summary><pre>{raw}</pre></details>}
 </section>;
}
