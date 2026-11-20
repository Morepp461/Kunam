import type {Session} from "@supabase/supabase-js";
import {ArrowLeft,Clock3} from "lucide-react";
import {Link} from "react-router-dom";

export default function ShopPage({session}:{session:Session}){
 void session;
 return <section className="workspace development-shop-page">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MARKETPLACE</span><h1 className="page-title">Shop</h1><p className="page-description">Item Shop tidak dapat dibeli saat ini. Marketplace CALERIS sedang disiapkan.</p></header>
  <section className="workspace-card shop-upcoming-card" aria-label="Shop upcoming">
   <span className="shop-upcoming-orbit shop-upcoming-orbit-one"/>
   <span className="shop-upcoming-orbit shop-upcoming-orbit-two"/>
   <span className="shop-upcoming-icon"><Clock3 size={27}/></span>
   <span className="section-eyebrow">CALERIS MARKETPLACE</span>
   <h2 className="shop-upcoming-title">UPCOMING</h2>
   <p>Something is being prepared for the paddock.</p>
   <span className="shop-upcoming-status"><i/> COMING SOON</span>
  </section>
 </section>;
}
