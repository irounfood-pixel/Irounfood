import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const uid='11111111-1111-4111-8111-111111111111';
const source=fs.readFileSync(new URL('../supabase/functions/partner-portal-manage/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const code=stripTypeScriptTypes(source);
function setup(hidden=[uid],scopeError=null){
 const calls=[];let handler;
 const db={rpc:async(name,args)=>{
  calls.push(name);
  if(name==='ml_portal_hidden_uids')return {data:hidden,error:scopeError};
  if(name==='ml_portal_direct_orders')return {data:[]};
  return {data:{ok:true,rows:[{source_uid:uid},{source_uid:'pending'}],deleted_uids:[]}};
 }};
 vm.runInNewContext(code,{createClient:()=>db,Request,Response,crypto:webcrypto,TextEncoder,Set,Deno:{env:{get:()=>''},serve:h=>handler=h}});
 return {handler,calls};
}
function req(action){return new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(50)},body:JSON.stringify({sheet_id:'a'.repeat(40),action,source_uid:uid,expected:Array(8).fill(''),expected_updated_at:'2026-11-11T00:00:00Z',input:{}})});}
for(const action of ['update','cancel','delete'])test(`hidden captured UID rejects ${action} before mutation RPC`,async()=>{
 const f=setup();assert.equal((await f.handler(req(action))).status,403);assert.deepEqual(f.calls,['ml_portal_hidden_uids']);
});
test('scope auth failure fails closed before mutation',async()=>{
 const f=setup(null,{message:'denied'});assert.equal((await f.handler(req('update'))).status,403);assert.deepEqual(f.calls,['ml_portal_hidden_uids']);
});
test('visible mutation retains original RPC behavior',async()=>{
 const f=setup([]);assert.equal((await f.handler(req('update'))).status,200);assert.deepEqual(f.calls,['ml_portal_hidden_uids','partner_portal_update','ml_portal_hidden_uids']);
});
test('status returns hidden UIDs, removes matching metadata, keeps pending rows',async()=>{
 const f=setup();const res=await f.handler(req('status'));const data=await res.json();assert.equal(res.status,200);
 assert.deepEqual(data.hidden_uids,[uid]);assert.deepEqual(data.rows,[{source_uid:'pending'}]);
});
test('mutation success responses also filter unrelated hidden rows',async()=>{
 const calls=[];let handler;
 const db={rpc:async(name)=>{
  calls.push(name);
  if(name==='ml_portal_hidden_uids')return {data:calls.length===1?[]:[uid]};
  return {data:{ok:true,rows:[{source_uid:uid},{source_uid:'pending'}]}};
 }};
 vm.runInNewContext(code,{createClient:()=>db,Request,Response,crypto:webcrypto,TextEncoder,Set,Deno:{env:{get:()=>''},serve:h=>handler=h}});
 const data=await (await handler(req('update'))).json();
 assert.deepEqual(data.rows,[{source_uid:'pending'}]);assert.deepEqual(data.hidden_uids,[uid]);
});
test('status rechecks hidden rows after direct-order read, before returning',async()=>{
 const calls=[];let handler;let checked=0;
 const db={rpc:async(name)=>{
  calls.push(name);
  if(name==='ml_portal_hidden_uids')return {data:++checked===1?[]:[uid]};
  if(name==='ml_portal_direct_orders')return {data:[]};
  return {data:{ok:true,rows:[{source_uid:uid},{source_uid:'pending'}]}};
 }};
 vm.runInNewContext(code,{createClient:()=>db,Request,Response,crypto:webcrypto,TextEncoder,Set,Deno:{env:{get:()=>''},serve:h=>handler=h}});
 const data=await (await handler(req('status'))).json();
 assert.deepEqual(calls,['ml_portal_hidden_uids','partner_portal_manage','ml_portal_direct_orders','ml_portal_hidden_uids']);
 assert.deepEqual(data.rows,[{source_uid:'pending'}]);assert.deepEqual(data.hidden_uids,[uid]);
});
test('status final scope lookup failure does not return loaded rows',async()=>{
 let handler;let checked=0;
 const db={rpc:async(name)=>{
  if(name==='ml_portal_hidden_uids')return ++checked===1?{data:[]}:{error:{message:'unavailable'}};
  if(name==='ml_portal_direct_orders')return {data:[]};
  return {data:{ok:true,rows:[{source_uid:uid}]}};
 }};
 vm.runInNewContext(code,{createClient:()=>db,Request,Response,crypto:webcrypto,TextEncoder,Set,Deno:{env:{get:()=>''},serve:h=>handler=h}});
 const response=await handler(req('status'));const data=await response.json();
 assert.equal(response.status,502);assert.equal(data.ok,false);assert.equal(data.rows,undefined);
});
