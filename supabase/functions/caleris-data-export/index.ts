import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigin=(origin:string)=>origin==="http://localhost:5173"||origin==="https://calerismasters.com"||origin==="https://www.calerismasters.com"||origin==="https://calerismastersnewgen-mu.vercel.app"||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
const cors=(origin:string)=>({"Access-Control-Allow-Origin":allowedOrigin(origin)?origin:"https://calerismastersnewgen-mu.vercel.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400","Content-Type":"application/json","Vary":"Origin"});
function serviceClient(url:string,key:string){
 const secret=key.startsWith("sb_secret_");
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},...(secret?{global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>{const req=new Request(input,init);const headers=new Headers(req.headers);headers.delete("Authorization");headers.set("apikey",key);return fetch(new Request(req,{headers}));}}}:{})});
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")??"",headers=cors(origin),respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return respond(405,{error:"Method not allowed."});
 if(!allowedOrigin(origin))return respond(403,{error:"Origin not allowed."});
 try{
  const url=Deno.env.get("SUPABASE_URL"),publishables=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),secrets=Deno.env.get("SUPABASE_SECRET_KEYS"),anon=Deno.env.get("SUPABASE_ANON_KEY"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishable=publishables?JSON.parse(publishables).default:anon,secret=secrets?JSON.parse(secrets).default:null,serviceKey=serviceRole||secret;
  if(!url||!publishable||!serviceKey)return respond(500,{error:"Caleris data export gateway is not configured."});
  const jwt=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  if(!jwt)return respond(401,{error:"Authentication required."});
  const auth=createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:"Bearer "+jwt}}});
  const {data:authData,error:authError}=await auth.auth.getUser(jwt);
  if(authError||!authData.user)return respond(401,{error:"Invalid or expired session."});
  const admin=serviceClient(url,serviceKey),userId=authData.user.id;
  const {data:adminRecord,error:adminError}=await admin.from("site_admins").select("user_id").eq("user_id",userId).maybeSingle();
  if(adminError){console.error("Data export admin check failed:",adminError.message);return respond(500,{error:"Unable to verify export permission."});}
  let authorized=Boolean(adminRecord);
  if(!authorized){
   const {data:profile,error:profileError}=await admin.from("profiles").select("member_id").eq("user_id",userId).maybeSingle();
   if(profileError){console.error("Data export profile check failed:",profileError.message);return respond(500,{error:"Unable to verify FIA access."});}
   if(profile?.member_id){
    const {data:member,error:memberError}=await admin.from("members").select("role").eq("id",profile.member_id).maybeSingle();
    if(memberError){console.error("Data export role check failed:",memberError.message);return respond(500,{error:"Unable to verify FIA access."});}
    authorized=member?.role==="FIA";
   }
  }
  if(!authorized)return respond(403,{error:"Export access is restricted to Admin and FIA."});
  const queries=await Promise.all([
   admin.from("caleris_member_directory").select("id,character_name,role,team_id,license,public_member_id,nationality,hometown").eq("role","Driver").order("character_name").range(0,4999),
   admin.from("caleris_team_directory").select("id,name,division_key,main_color,secondary_color").order("name").range(0,4999),
   admin.from("caleris_driver_attributes").select("member_id,attributes,updated_at").range(0,4999),
   admin.from("caleris_driver_development_attributes").select("member_id,attribute_key,current_value,updated_at").range(0,9999),
   admin.from("caleris_team_development_parts").select("team_id,part_key,current_value,updated_at").range(0,9999),
   admin.from("caleris_team_profiles").select("team_id,logo_url,country_of_origin,base_location,founded_year,description,vision,long_term_target,main_color,secondary_color").range(0,4999)
  ]);
  const queryNames=["driver directory","team directory","driver attributes","driver development attributes","team development parts","team profiles"];
  const failedIndex=queries.findIndex(q=>q.error);
  if(failedIndex>=0){
   const failure=queries[failedIndex].error;
   console.error("Data export query failed:",{source:queryNames[failedIndex],code:failure?.code,message:failure?.message});
   return respond(422,{error:"Unable to read export data.",source:queryNames[failedIndex],code:failure?.code??"UNKNOWN",detail:failure?.message??"Database query failed."});
  }
  return respond(200,{success:true,generatedAt:new Date().toISOString(),members:queries[0].data??[],teams:queries[1].data??[],driverAttributes:queries[2].data??[],driverDevelopment:queries[3].data??[],teamDevelopment:queries[4].data??[],teamProfiles:queries[5].data??[]});
 }catch(error){console.error("Caleris data export failed:",error);return respond(500,{error:"Unexpected data export error."});}
});
