import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import "./pwa-install.css";
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed";platform:string}>};
export default function PWAInstallPrompt(){
 const [installEvent,setInstallEvent]=useState<InstallPromptEvent|null>(null),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{const onBefore=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallPromptEvent);};const onInstalled=()=>setInstallEvent(null);window.addEventListener("beforeinstallprompt",onBefore);window.addEventListener("appinstalled",onInstalled);return()=>{window.removeEventListener("beforeinstallprompt",onBefore);window.removeEventListener("appinstalled",onInstalled);};},[]);
 if(!installEvent||dismissed)return null;
 const install=async()=>{await installEvent.prompt();const choice=await installEvent.userChoice;if(choice.outcome==="accepted")setInstallEvent(null);};
 return <aside className="pwa-install-prompt" aria-label="Install CALERIS MASTERS"><div className="pwa-install-copy"><strong>Install CALERIS MASTERS</strong><span>Akses lebih cepat dari layar utama HP.</span></div><button type="button" className="pwa-install-action" onClick={()=>void install()}><Download size={15}/> Install</button><button type="button" className="pwa-install-close" aria-label="Tutup" onClick={()=>setDismissed(true)}><X size={15}/></button></aside>;
}