import type {Session} from "@supabase/supabase-js";
import {ArrowLeft,Trophy,Coins} from "lucide-react";
import {Link} from "react-router-dom";
export default function ShopPage({session}:{session:Session}){
 void session;
 return <section className="workspace development-shop-page">
  <Link className="back-link" to="/dashboard"><ArrowLeft size={16}/> Dashboard</Link>
  <header className="page-heading"><span className="section-eyebrow">CALERIS MARKETPLACE</span><h1 className="page-title">Shop</h1><p className="page-description">Development tidak lagi dibeli dalam bentuk token. Upgrade dilakukan langsung menggunakan saldo wallet.</p></header>
  <section className="workspace-card development-token-shop-disabled">
   <span className="shop-item-icon"><Trophy size={28}/></span>
   <span className="section-eyebrow">RACE REWARD ONLY</span>
   <h2>Development Token</h2>
   <p>DDP dan TDP hanya diperoleh melalui hasil race. Token tidak dapat dibeli, ditukar dengan saldo wallet, atau dikirim antar akun.</p>
   <p>Token yang diperoleh dari race dapat digunakan sebagai upgrade Development gratis. Untuk upgrade lainnya, buka panel Development dan bayar langsung dari wallet Driver atau Team.</p>
   <Link className="economy-secondary-button" to="/dashboard"><Coins size={15}/> Kembali ke Dashboard</Link>
  </section>
 </section>;
}
