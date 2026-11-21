const assert = require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema private; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function private.is_admin() returns boolean language sql as $$select auth.uid()='11111111-1111-1111-1111-111111111111'::uuid$$; grant usage on schema auth,private to authenticated;`);
 await db.exec(fs.readFileSync(__dirname+'/../supabase/material_inventory_v2.sql','utf8'));

 await db.exec(fs.readFileSync(__dirname+'/../supabase/material_inventory_receipt_excel.sql','utf8'));
 const q=(s,p=[])=>db.query(s,p),call=(rows,id=crypto.randomUUID())=>q('select public.stock2_import_receipts($1,$2)',[id,JSON.stringify(rows)]);
 await db.exec(`set role anon`);await assert.rejects(()=>call([]),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false)`);await assert.rejects(()=>call([]),/관리자/);
 await db.exec(`select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false)`);

 const add=async payload=>(await q('select public.stock2_save_item($1) id',[JSON.stringify(payload)])).rows[0].id;
 const a=await add({name:'test bread',kind:'raw',unit:'개',purchase_unit:'봉',purchase_factor:20,estimated:false});
 const b=await add({name:'test jam',kind:'raw',unit:'kg'});
 const item=async id=>(await q('select * from stock2_items where id=$1',[id])).rows[0];
 const row=(id,entry_unit,entry_qty,version=2)=>({id,entry_unit,entry_qty,version,note:'test'});
 await assert.rejects(()=>call([row(a,'봉',2,1)]),/실사/);
 for(const [id,qty] of [[a,12],[b,0.2]])await q("select public.stock2_move($1,$2,'set',$3,'test',null,1)",[crypto.randomUUID(),id,qty]);
 const ra=row(a,'봉',2),rb=row(b,'kg',0.5);
 await assert.rejects(()=>call([ra,row(b,'개',2)]),/단위/);
 assert.equal(Number((await item(a)).qty),12);
 await assert.rejects(()=>call([ra,ra]),/중복/);
 const id=crypto.randomUUID();await call([ra,rb],id);await call([ra,rb],id);
 assert.equal(Number((await item(a)).qty),52);assert.equal(Number((await item(b)).qty),0.7);
 await assert.rejects(()=>call([ra,rb]),/변경/);
 assert.equal(Number((await q("select count(*) n from stock2_events where mode='receipt_import'")).rows[0].n),1);
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
