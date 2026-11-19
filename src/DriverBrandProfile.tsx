/** @deprecated Legacy wrapper. Driver sponsorship is routed through the current Brand Ecosystem module; retain until route and import history are verified. */
import type {Session} from "@supabase/supabase-js";
import BrandEcosystem from "./BrandEcosystem";
export default function DriverBrandProfile({session}:{session:Session}){return <BrandEcosystem session={session} mode="driver"/>;}
