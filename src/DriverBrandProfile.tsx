import type {Session} from "@supabase/supabase-js";
import BrandEcosystem from "./BrandEcosystem";
export default function DriverBrandProfile({session}:{session:Session}){return <BrandEcosystem session={session} mode="driver"/>;}
