import {useEffect,useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./lib/supabase";
import BrandEcosystem from "./BrandEcosystem";
export default function AdminSponsorship(){
 const [session,setSession]=useState<Session|null>(null);
 useEffect(()=>{let active=true;void supabase?.auth.getSession().then(({data})=>{if(active)setSession(data.session)});return()=>{active=false}},[]);
 if(!session)return <section className="workspace"><div className="workspace-card">Memuat sesi Admin...</div></section>;
 return <BrandEcosystem session={session} mode="admin"/>;
}
