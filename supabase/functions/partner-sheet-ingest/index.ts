// Standalone Edge Function for partner-sheet syncing.
// Deploy only after reviewing migration and registering sheet ID + token hash.
// NEVER expose SUPABASE_SERVICE_ROLE_KEY or raw partner token in public Google Sheets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const hex=async(value:string)=>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({ok:false,error:"POST only"},405);
 const auth=req.headers.get("Authorization")||"";
 const token=auth.match(/^Bearer\s+([A-Za-z0-9_-]{40,200})$/)?.[1];
 if(!token)return json({ok:false,error:"missing or invalid token"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return json({ok:false,error:"server not configured"},500);
 try{
  const payload=await req.json();
  const sheet_id=String(payload?.sheet_id||"");
  if(!/^[A-Za-z0-9_-]{25,150}$/.test(sheet_id))return json({ok:false,error:"invalid sheet ID"},400);
  const action=String(payload?.action||'sync');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const digest=await hex(token);
  let ingest:unknown=null;
  let mutation:unknown=null;
  if(action==='sync'){
   const rows=payload?.rows;
   if(!Array.isArray(rows)||rows.length>500)return json({ok:false,error:"up to 500 rows"},400);
   const {data,error}=await db.rpc("partner_sheet_ingest",{
    p_sheet_id:sheet_id,p_token_hash:digest,p_rows:rows
   });
   if(error)return json({ok:false,error:"sync denied or invalid data"},403);
   ingest=data;
  }else if(action==='cancel'||action==='delete'){
   const source_uid=String(payload?.source_uid||"");
   if(!/^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(source_uid))
    return json({ok:false,error:"invalid row identifier"},400);
   const {data,error}=await db.rpc("partner_sheet_manage",{
    p_sheet_id:sheet_id,p_token_hash:digest,p_source_uid:source_uid,p_action:action
   });
   if(error)return json({ok:false,error:"action denied; verify status and shipment"},409);
   mutation=data;
  }else return json({ok:false,error:"invalid action"},400);
  // Shipment data and original uploaded photos are always managed by the admin DB.
  const {data:status,error:statusErr}=await db.rpc("partner_sheet_status",{
   p_sheet_id:sheet_id,p_token_hash:digest
  });
  if(statusErr)return json({ok:false,error:"status sync failed"},422);
  const {data:deleted,error:deletedErr}=await db.rpc("partner_sheet_deleted_uids",{
   p_sheet_id:sheet_id,p_token_hash:digest
  });
  if(deletedErr)return json({ok:false,error:"deleted row sync failed"},422);
  return json({ok:true,ingest,mutation,status_rows:status||[],deleted_uids:deleted||[]});
 }catch(_){return json({ok:false,error:"invalid request"},400);}
});
