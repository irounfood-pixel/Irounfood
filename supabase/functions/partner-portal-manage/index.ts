import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({ok:false,error:"POST only"},405);
 const token=(req.headers.get("Authorization")||"").match(/^Bearer\s+([A-Za-z0-9_-]{40,200})$/)?.[1];
 if(!token)return reply({ok:false,error:"인증이 필요합니다."},401);
 try{
  const p=await req.json(),sheet=String(p.sheet_id||""),action=String(p.action||"");
  if(!/^[A-Za-z0-9_-]{25,150}$/.test(sheet)||!["status","cancel","delete"].includes(action))
   return reply({ok:false,error:"잘못된 요청입니다."},400);
  if(action!=="status"&&(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(p.source_uid||""))
    ||!Array.isArray(p.expected)||p.expected.length!==8||!p.expected_updated_at))
   return reply({ok:false,error:"주문 정보를 새로고침해 주세요."},400);
  const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))].map(v=>v.toString(16).padStart(2,"0")).join("");
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc("partner_portal_manage",{p_sheet_id:sheet,p_token_hash:hash,p_action:action,
   p_source_uid:p.source_uid||null,p_expected:p.expected||null,p_expected_updated_at:p.expected_updated_at||null});
  if(error)return reply({ok:false,error:action==="status"?"거래처 인증 또는 연결을 확인해 주세요.":"처리할 수 없습니다. 주문 상태를 새로고침해 주세요. 출고완료 주문은 취소·삭제할 수 없습니다."},409);
  return reply(data);
 }catch{return reply({ok:false,error:"잘못된 요청입니다."},400);}
});
