import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigin=(origin:string)=>origin==="http://localhost:5173"||origin==="https://calerismastersnewgen-mu.vercel.app"||/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
const cors=(origin:string)=>({"Access-Control-Allow-Origin":allowedOrigin(origin)?origin:"https://calerismastersnewgen-mu.vercel.app","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"});
function serviceClient(url:string,key:string){const secret=key.startsWith("sb_secret_");return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},...(secret?{global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>{const req=new Request(input,init);const headers=new Headers(req.headers);headers.delete("Authorization");headers.set("apikey",key);return fetch(new Request(req,{headers}));}}}:{})});}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")??"",headers=cors(origin),respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return respond(405,{error:"Method not allowed."});
 if(!allowedOrigin(origin))return respond(403,{error:"Origin not allowed."});
 try{
  const url=Deno.env.get("SUPABASE_URL"),publishables=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),secrets=Deno.env.get("SUPABASE_SECRET_KEYS"),anon=Deno.env.get("SUPABASE_ANON_KEY"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishable=publishables?JSON.parse(publishables).default:anon,secret=secrets?JSON.parse(secrets).default:null,serviceKey=serviceRole||secret;
  if(!url||!publishable||!serviceKey)return respond(500,{error:"Economy workflow gateway is not configured."});
  const jwt=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(!jwt)return respond(401,{error:"Authentication required."});
  const auth=createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:"Bearer "+jwt}}});
  const {data:authData,error:authError}=await auth.auth.getUser(jwt);if(authError||!authData.user)return respond(401,{error:"Invalid or expired session."});
  const body=await req.json(),action=typeof body.action==="string"?body.action:"",actor=authData.user.id,admin=serviceClient(url,serviceKey);
  if(action==="cash_loan_preview"){
   const {data,error}=await admin.rpc("member_cash_loan_preview",{p_actor_id:actor});if(error)return respond(422,{error:error.message});return respond(200,{success:true,result:data});
  }
  if(action==="apply_cash_loan"){
   const amount=typeof body.amount==="number"?body.amount:Number.NaN,tenor=typeof body.tenorSeasons==="number"?body.tenorSeasons:0;
   if(!Number.isFinite(amount)||amount<=0||amount>999999999999999999.99||Number(amount.toFixed(2))!==amount)return respond(400,{error:"Nominal pinjaman tidak valid."});
   if(!Number.isInteger(tenor)||tenor<1||tenor>4)return respond(400,{error:"Tenor hanya 1 sampai 4 season."});
   const {data,error}=await admin.rpc("member_apply_cash_loan",{p_actor_id:actor,p_amount:amount,p_tenor_seasons:tenor});
   if(error)return respond(422,{error:error.message});return respond(200,{success:true,result:data});
  }
  if(action==="upgrade_development_attribute"){
   const scope=body.scope==="team"?"team":body.scope==="driver"?"driver":"",attributeKey=typeof body.attributeKey==="string"?body.attributeKey:"",newValue=typeof body.newValue==="number"?body.newValue:Number.NaN;
   if(!scope||!attributeKey||!Number.isFinite(newValue))return respond(400,{error:"Data upgrade atribut tidak valid."});
   const {data,error}=await admin.rpc("member_upgrade_development_attribute",{p_actor_id:actor,p_scope:scope,p_attribute_key:attributeKey,p_new_value:newValue});
   if(error)return respond(422,{error:error.message});return respond(200,{success:true,result:data});
  }
  if(action==="upgrade_development_attribute"){
   const scope=body.scope==="team"?"team":body.scope==="driver"?"driver":"",attributeKey=typeof body.attributeKey==="string"?body.attributeKey:"",newValue=typeof body.newValue==="number"?body.newValue:Number.NaN;
   if(!scope||!attributeKey||!Number.isFinite(newValue))return respond(400,{error:"Data upgrade atribut tidak valid."});
   const {data,error}=await admin.rpc("member_upgrade_development_attribute",{p_actor_id:actor,p_scope:scope,p_attribute_key:attributeKey,p_new_value:newValue});
   if(error)return respond(422,{error:error.message});return respond(200,{success:true,result:data});
  }
  if(action==="team_cash_loan_preview"){
   const {data,error}=await admin.rpc("member_team_cash_loan_preview",{p_actor_id:actor});if(error)return respond(422,{error:error.message});return respond(200,{success:true,result:data});
  }
  if(action==="apply_team_cash_loan"){
   const amount=typeof body.amount==="number"?body.amount:Number.NaN,tenor=typeof body.tenorSeasons==="number"?body.tenorSeasons:0;
   if(!Number.isFinite(amount)||amount<=0||amount>999999999999999999.99||Number(amount.toFixed(2))!==amount)return respond(400,{error:"Nominal pinjaman tidak valid."});
   if(!Number.isInteger(tenor)||tenor<1||tenor>4)return respond(400,{error:"Tenor hanya 1 sampai 4 season."});
   const {data,error}=await admin.rpc("member_apply_team_cash_loan",{p_actor_id:actor,p_amount:amount,p_tenor_seasons:tenor});
   if(error)return respond(422,{error:error.message});return respond(200,{success:true,result:data});
  }
  return respond(400,{error:"Unknown Economy workflow action."});
 }catch(error){console.error("Economy workflow gateway error:",error);return respond(500,{error:"Unexpected Economy workflow error."});}
});
