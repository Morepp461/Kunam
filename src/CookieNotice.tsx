import {useEffect,useState} from "react";
import {Cookie, X} from "lucide-react";
import "./cookie-notice.css";

const STORAGE_KEY="caleris-cookie-notice-dismissed-v1";

export default function CookieNotice(){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  try{setVisible(localStorage.getItem(STORAGE_KEY)!=="true");}
  catch{setVisible(true);}
 },[]);
 const dismiss=()=>{
  try{localStorage.setItem(STORAGE_KEY,"true");}catch{}
  setVisible(false);
 };
 if(!visible)return null;
 return <aside className="cookie-notice" role="region" aria-label="Informasi cookie">
  <span className="cookie-notice-icon" aria-hidden="true"><Cookie size={19}/></span>
  <div className="cookie-notice-copy"><strong>Informasi Cookie</strong><p>Caleris Masters menggunakan cookie dan penyimpanan browser untuk menjaga fungsi website serta preferensi pengalamanmu. Layanan pihak ketiga juga dapat menggunakan teknologi serupa sesuai kebijakan mereka. Dengan melanjutkan penggunaan website, kamu memahami pemberitahuan ini.</p><a href="/privacy-policy">Baca Kebijakan Privasi</a></div>
  <button type="button" className="cookie-notice-dismiss" onClick={dismiss} aria-label="Tutup pemberitahuan cookie"><span>Tutup</span><X size={16}/></button>
 </aside>;
}
