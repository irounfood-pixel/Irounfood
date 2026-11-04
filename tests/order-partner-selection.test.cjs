const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('admin.html','utf8');
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',isConnected:true,classList:{add(){},remove(){}},addEventListener(){},appendChild(){}});return elements.get(id);};
const calls=[],rows=[{dataset:{itemId:'1'},querySelector:s=>({value:s.includes('product')?'product-id':'2'})}];
const db={rpc:async(name,args)=>{calls.push({name,args});return {data:'order-id'};},auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}}};
const c={console,Intl,Date,Map,Set,Promise,Number,String,Array,Math,JSON,Object,RegExp,Error,setTimeout,clearTimeout,confirm:()=>true,
 IrounBackGuard:{install(){}},supabase:{createClient:()=>db},document:{getElementById:el,querySelectorAll:()=>rows,createElement:()=>({})},requestAnimationFrame:()=>0,MutationObserver:class{observe(){}}};
c.window=c;c.addEventListener=()=>{};c.scrollTo=()=>{};vm.createContext(c);
for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))if(m[1])vm.runInContext(m[1],c);
const run=s=>vm.runInContext(s,c);
(async()=>{
 for(const [order,expected] of [[{customer_name:'ML_기관'},'ML'],[{customer_name:'일반기관'},'해당없음'],[{customer_name:'ML_기관',partner_type:'해당없음'},'해당없음'],[{customer_name:'학교',partner_type:'ML'},'ML']]){
  c.example=order;assert.equal(run('orderPartnerType(example)'),expected);assert.equal(run('isMLParcelOrder(example)'),expected==='ML');
 }
 assert.match(run("partnerSelect('o_partner')"),/value="해당없음" selected/);
 run("state.orders=[{id:'order-id',order_no:'123',customer_name:'학교',partner_type:'ML',order_status:'주문접수',order_items:[]}];init=async()=>{};route=()=>{};toast=()=>{};closeModal=()=>{};addEditOrderLine=()=>{};openOrder('order-id')");
 assert.match(el('modalBox').innerHTML,/<b>거래처<\/b><div>ML/);
 run("openEditOrder('order-id')");assert.match(el('modalBox').innerHTML,/value="ML" selected/);
 for(const [id,value] of Object.entries({'edit-order-customer':'학교','edit-order-ship':'2026-11-10','edit-order-address':'주소','edit-order-method':'택배','edit-order-partner':'해당없음'}))el(id).value=value;
 await run('saveEditedOrder()');assert.equal(calls.at(-1).args.p_fields.partner_type,'해당없음');assert.equal(calls.at(-1).args.p_fields.customer_name,'학교');
 for(const [id,value] of Object.entries({o_customer:'일반학교',o_ship:'2026-11-10',o_address:'주소',o_method:'방문수령',o_partner:'ML'}))el(id).value=value;
 await run('saveOrder()');assert.equal(calls.at(-1).name,'create_admin_order_with_partner_v1');assert.equal(calls.at(-1).args.p_partner_type,'ML');assert.equal(calls.at(-1).args.p_customer_name,'일반학교');
 console.log('PASS: legacy classification, explicit override in both directions, default selection, details, edit and create payloads, institution name preserved');
})().catch(e=>{console.error(e);process.exitCode=1;});
