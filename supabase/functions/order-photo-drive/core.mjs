export function createAdminDriveHandler({supabaseUrl,apiKey,bridgeUrl,fetchImpl=fetch}) {
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({ok:false,error:'POST only'},405);
  const token=req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]{20,8192})$/)?.[1];
  if(!token)return reply({ok:false,error:'주문관리 로그인이 필요합니다.'},401);
  try {
   const authHeaders={apikey:apiKey,Authorization:'Bearer '+token};
   const reader=req.body?.getReader();if(!reader)return reply({ok:false,error:'사진 요청이 없습니다.'},400);
   const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>7200000){await reader.cancel();return reply({ok:false,error:'요청이 너무 큽니다.'},413);}chunks.push(value);}
   const raw=new Uint8Array(size);let offset=0;for(const value of chunks){raw.set(value,offset);offset+=value.length;}
   let input;try{input=JSON.parse(new TextDecoder().decode(raw));}catch{return reply({ok:false,error:'올바르지 않은 요청입니다.'},400);}
   if(!input || !['upload','read','trash','mlRead'].includes(input.action) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.order_id||''))return reply({ok:false,error:'사진 요청을 확인해주세요.'},400);
   if(input.action==='mlRead'){
    // Fixed, existing read-only ML share-link capability; never accepted for mutations.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if(hash!=='fe8b5f40dbc6a149002ac70c685689efc409da9751484cd7f5fb84365a62f004')return reply({ok:false,error:'ML 사진 접근 권한을 확인해주세요.'},401);
   }else{
    const user=await fetchImpl(supabaseUrl+'/auth/v1/user',{headers:authHeaders});
    if(!user.ok)return reply({ok:false,error:'주문관리 로그인을 다시 확인해주세요.'},401);
    const order=await fetchImpl(supabaseUrl+'/rest/v1/orders?select=id&id=eq.'+input.order_id,{headers:authHeaders});
    if(!order.ok || (await order.json()).length!==1)return reply({ok:false,error:'주문 관리자 권한이 필요합니다.'},403);
   }
   const payload={action:input.action,order_id:input.order_id,photo_id:input.photo_id,access_token:token};
   if(input.action==='upload')Object.assign(payload,{base64:input.base64,content_type:input.content_type,original_name:input.original_name,size_bytes:input.size_bytes});
   const upstream=await fetchImpl(bridgeUrl,{method:'POST',headers:{'Content-Type':'text/plain; charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(90000)});
   if(!upstream.ok)return reply({ok:false,error:'구글 드라이브 연결에 실패했습니다.'},502);
   let result;try{result=await upstream.json();}catch{return reply({ok:false,error:'구글 연결 프로그램 배포를 확인해주세요.'},502);}
   if(!result || typeof result.ok!=='boolean')return reply({ok:false,error:'사진 처리 결과를 확인하지 못했습니다.'},502);
   return reply(result,result.ok?200:400);
  }catch{return reply({ok:false,error:'사진 처리 중 연결이 끊겼습니다. 업로드 결과를 확인 후 다시 시도해주세요.'},502);}
 };
}
