import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createManifestGateway} from '../supabase/functions/partner-photo-export/gateway.mjs';
import {createPhotoExportHandler} from '../supabase/functions/partner-photo-export/core.mjs';
const sheetId='fixed-ml',old='11111111-1111-4111-8111-111111111111',recent='22222222-2222-4222-8222-222222222222';
const row=(id,date)=>({sheet_id:sheetId,status:'승인',approved_order_id:id,ship_date:date,source_row:2});
const photo=(id,n)=>({id:id+'-'+n,order_id:id,storage_path:id+'/drive/file_id_12345',content_type:'image/jpeg'});
const req=input=>new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(50)},body:JSON.stringify(input)});
function fixture({rows=[row(old,'2026-10-01'),row(recent,'2026-11-20')],photos=[...Array.from({length:250},(_,i)=>photo(old,i)),photo(recent,0)]}={}){
 const calls=[];
 const db={rpc:async(name,args)=>{
  calls.push({name,args});
  const selected=rows.filter(r=>(!args.p_order_id||args.p_order_id===r.approved_order_id)&&(!args.p_from||r.ship_date>=args.p_from&&r.ship_date<=args.p_to));
  const ids=new Set(selected.map(r=>r.approved_order_id));
  return {data:{enabled:true,rows:selected.slice(0,20001),photos:photos.filter(p=>ids.has(p.order_id)).slice(0,201)}};
 }};
 const handler=createPhotoExportHandler({sheetId,accessHash:'hash',digest:async()=> 'hash',gateway:createManifestGateway({sheetId,db})});
 return {handler,calls};
}
test('later single-order photos survive more than 201 historical photos',async()=>{
 const f=fixture();const res=await f.handler(req({order_id:recent}));const data=await res.json();
 assert.equal(res.status,200);assert.equal(data.photos.length,1);assert.equal(data.photos[0].order_id,recent);
 assert.deepEqual(f.calls,[{name:'ml_portal_photo_manifest_scoped',args:{p_from:null,p_to:null,p_order_id:recent}}]);
});
test('date filter reaches SQL before its photo cap',async()=>{
 const f=fixture();const res=await f.handler(req({from:'2026-11-20',to:'2026-11-20'}));
 assert.equal((await res.json()).photos.length,1);assert.equal(f.calls[0].args.p_from,'2026-11-20');
});
test('over 200 selected photos fails explicitly, rather than silently truncating',async()=>{
 const f=fixture();assert.equal((await f.handler(req({order_id:old}))).status,413);
});
test('wrong order, bad date, unknown parameter do not expose photos',async()=>{
 const f=fixture();assert.equal((await f.handler(req({order_id:'33333333-3333-4333-8333-333333333333'}))).status,200);
 const invalid=fixture();assert.equal((await invalid.handler(req({from:'2026-02-30',to:'2026-03-01'}))).status,400);assert.equal(invalid.calls.length,0);
 assert.equal((await invalid.handler(req({sheet_id:'other'}))).status,400);
});
test('invalid bearer never calls the database',async()=>{
 const f=fixture();assert.equal((await f.handler(new Request('https://test.invalid',{method:'POST',body:'{}'}))).status,401);assert.equal(f.calls.length,0);
});
test('gateway rejects a photo outside its already-selected SQL scope',async()=>{
 const db={rpc:async()=>({data:{enabled:true,rows:[row(recent,'2026-11-20')],photos:[photo(old,1)]}})};
 const g=createManifestGateway({sheetId,db});await g.enabled(sheetId,{order_id:recent});await assert.rejects(()=>g.photos([recent]),/scope/);
});
test('bounded SQL uses selected order set before photo limit, and only service roles',()=>{
 const sql=fs.readFileSync(new URL('../supabase/ml_portal_direct_admin_orders.sql',import.meta.url),'utf8');
 assert.match(sql,/p_order_id IS NULL OR v.approved_order_id = p_order_id/);
 assert.match(sql,/p\.order_id IN \(SELECT approved_order_id FROM selected\)/);
 assert.match(sql,/ORDER BY p.created_at, p.id LIMIT 201/);
 assert.match(sql,/jsonb_array_length\(v_result\) > 1000/);
 assert.match(sql,/o.deleted_at IS NULL AND o.order_status IS DISTINCT FROM '취소'/);
 assert.match(sql,/o.partner_type = 'ML' OR o.partner_type IS NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.ml_portal_photo_manifest_scoped\(date, date, uuid\) FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.ml_portal_hidden_uids\(text, text\) FROM PUBLIC, anon, authenticated/);
});
