import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminDriveHandler} from '../supabase/functions/order-photo-drive/core.mjs';
const order='11111111-1111-4111-8111-111111111111';
const token='valid.token.for.tests.only';
function setup(callback=()=>({ok:true})){const calls=[];const handler=createAdminDriveHandler({supabaseUrl:'https://project.supabase.co',apiKey:'public-test',bridgeUrl:'https://script.google.com/test/exec',fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(callback(url,options)),{status:200});}});return {handler,calls};}
function request(body={action:'read',order_id:order,photo_id:order},auth=token){return new Request('https://project.supabase.co/photo',{method:'POST',headers:auth?{Authorization:'Bearer '+auth}: {},body:JSON.stringify(body)});}
test('missing authorization is blocked before upstream calls',async()=>{const e=setup();assert.equal((await e.handler(request({},null))).status,401);assert.equal(e.calls.length,0);});
test('non-admin empty order response blocks Drive upstream',async()=>{const e=setup(url=>url.includes('/orders?')?[]:{id:order});assert.equal((await e.handler(request())).status,403);assert.equal(e.calls.length,2);});
test('client cannot substitute forwarded access token or URL',async()=>{const e=setup(url=>url.includes('/orders?')?[{id:order}]:{ok:true});const r=await e.handler(request({action:'read',order_id:order,photo_id:order,access_token:'attacker-token',bridgeUrl:'https://evil.test'}));assert.equal(r.status,200);const payload=JSON.parse(e.calls[2].options.body);assert.equal(payload.access_token,token);assert.equal(e.calls[2].url,'https://script.google.com/test/exec');assert.equal('bridgeUrl' in payload,false);});
test('ML read rejects arbitrary capability before upstream calls',async()=>{const e=setup();assert.equal((await e.handler(request({action:'mlRead',order_id:order}))).status,401);assert.equal(e.calls.length,0);});
test('oversized request stops before orders and Drive requests',async()=>{const e=setup();const r=await e.handler(request({action:'upload',order_id:order,base64:'a'.repeat(7200001)}));assert.equal(r.status,413);assert.equal(e.calls.length,0);});
test('authenticated request gets bounded non-cacheable response',async()=>{const e=setup(url=>url.includes('/orders?')?[{id:order}]:{ok:true,base64:'YWJj',content_type:'image/jpeg'});const r=await e.handler(request());assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal((await r.json()).base64,'YWJj');});
