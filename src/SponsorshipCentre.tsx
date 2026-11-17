import type {Session} from "@supabase/supabase-js";
import BrandEcosystem from "./BrandEcosystem";
export default function SponsorshipCentre({session}:{session:Session}){return <BrandEcosystem session={session} mode="team"/>;}
