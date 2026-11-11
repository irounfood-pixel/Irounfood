const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const gs=fs.readFileSync(path.join(root,'apps_script/ml_portal_order_actions.gs'),'utf8');
const template=fs.readFileSync(path.join(root,'apps_script/ml_portal_template.html'),'utf8');
const sql=fs.readFileSync(path.join(root,'supabase/ml_portal_direct_admin_orders.sql'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase/functions/partner-portal-manage/index.ts'),'utf8');
const start=gs.indexOf('function mlDirectOrderRows_(');
const stop=gs.indexOf('\nfunction getMLPortalData(){',start);
assert(start>=0&&stop>start);
const projection=Function(gs.slice(start,stop)+'; return mlDirectOrderRows_;')();

test('administrator ML order is projected as read-only, with tracking and photo count',()=>{
 const rows=projection([{
  order_id:'00000000-0000-4000-8000-000000000080',order_no:'260080',
  order_date:'2026-11-04',ship_date:'2026-11-11',order_status:'출고완료',
  recipient:'수령인',contact:'',address:'배송지',note:'',tracking_numbers:'123456',
  ice_small:1,paper_large:2,photo_count:4,
  items:[{name:'과자집',quantity:14},{name:'감정컵케이크',quantity:2}]
 }]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].row.length,15);
 assert.equal(rows[0].row[1],'2026-11-11');
 assert.equal(rows[0].row[8],'123456');
 assert.equal(rows[0].row[9],'1');
 assert.equal(rows[0].row[13],'2');
 assert.equal(rows[0].row[14],'4');
 assert.equal(rows[0].sourceRow,-1);
 assert.equal(rows[1].sourceRow,-2);
 assert.equal(rows[0].state.approved_order_id,rows[1].state.approved_order_id);
 assert.equal(rows[0].state.readonly_direct,true);
 assert.match(template,/if\(state\?\.readonly_direct\)/);
});

test('invalid items are dropped and sheet order rows are never written by direct order helper',()=>{
 assert.equal(projection([{order_id:'id',items:[{name:'',quantity:2},{name:'도넛',quantity:0}]}]).length,0);
 assert.equal(projection(null).length,0);
 const body=gs.slice(start,stop);
 assert(!/mlWrite_|setValues|appendRow|mlPortalApi_/.test(body));
});

test('server access is scoped to ML, unlinked orders and token-protected RPC',()=>{
 assert.match(sql,/o\.partner_type = 'ML'/);
 assert.match(sql,/NOT EXISTS \(\s*SELECT 1 FROM public\.partner_order_rows r/);
 assert.match(sql,/private\.partner_portal_tokens/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.ml_portal_direct_orders/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.ml_portal_direct_orders\(text, text\) TO service_role/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.ml_portal_photo_manifest/);
 assert.match(edge,/action==="status" && data\?\.ok===true/);
 assert.match(edge,/db\.rpc\("ml_portal_direct_orders"/);
});
