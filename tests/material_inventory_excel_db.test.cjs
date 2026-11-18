const assert = require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema private; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function private.is_admin() returns boolean language sql as $$select auth.uid()='11111111-1111-1111-1111-111111111111'::uuid$$; grant usage on schema auth,private to authenticated;`);
 await db.exec(fs.readFileSync(__dirname+'/../supabase/material_inventory_v2.sql','utf8'));

 await db.exec(fs.readFileSync(__dirname+'/../supabase/material_inventory_excel.sql','utf8'));
 const q=(s,p=[])=>db.query(s,p),call=(rows,id=crypto.randomUUID())=>q('select public.stock2_import_stocktake($1,$2)',[id,JSON.stringify(rows)]);
 await db.exec(`set role anon`);await assert.rejects(()=>call([]),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false)`);await assert.rejects(()=>call([]),/관리자/);
 await db.exec(`select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false)`);
 const add=async(name,unit)=>(await q('select public.stock2_save_item($1) id',[JSON.stringify({name,kind:'raw',unit})])).rows[0].id;
 const a=await add('test A','kg'),b=await add('test B','개');
 const row=(id,unit,qty,version=1)=>({id,unit,qty,version,note:'test'});
 const get=async id=>(await q('select * from stock2_items where id=$1',[id])).rows[0];
 await assert.rejects(()=>call([row(a,'kg',1),row(b,'개',1.2)]),/수량/);assert.equal((await get(a)).qty,null);
 for(const rows of [[],[row(a,'kg',-1)],[row(a,'g',1)],[row(a,'kg',1,2)],[row(a,'kg',1),row(a,'kg',2)],[row(a,'kg',0.0000001)],[row(a,'kg','1')]])await assert.rejects(()=>call(rows));
 const rows=[row(a,'kg',0),row(b,'개',3)],id=crypto.randomUUID();await call(rows,id);await call(rows,id);assert.equal(Number((await get(a)).qty),0);assert.equal((await get(b)).version,2);
 await assert.rejects(()=>call([row(a,'kg',5)],id),/같은 요청/);await assert.rejects(()=>call(rows),/버전/);
 assert.equal(Number((await q('select count(*) n from stock2_events')).rows[0].n),1);
 const e=(await q('select * from stock2_events')).rows[0];assert.equal(e.mode,'stocktake_import');assert.equal(e.changes.length,2);assert.equal(e.changes[0].before,null);
 console.log('Atomic Excel DB tests passed (isolated PGlite, production untouched)');await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
