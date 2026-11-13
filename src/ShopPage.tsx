import type {Session} from "@supabase/supabase-js";
import {ArrowLeft} from "lucide-react";
import {Link} from "react-router-dom";
import DevelopmentShop from "./DevelopmentShop";
export default function ShopPage({session}:{session:Session}){
 return <section className="workspace development-shop-page">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MARKETPLACE</span><h1 className="page-title">Shop</h1><p className="page-description">Beli item resmi menggunakan wallet ¢p.</p></header>
  <DevelopmentShop session={session}/>
 </section>;
}