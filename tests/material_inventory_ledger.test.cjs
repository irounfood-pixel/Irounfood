'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
test('kg ledger records actual quantities and refreshes separate dispatch and production counts',async()=>{
 const dom=new JSDOM('<main id="page"></main><div id="modal"><div id="modalBox"></div></div>',{url:'https://test.invalid',runScripts:'outside-only'});
 const w=dom.window,q=id=>w.document.getElementById(id),find=id=>items.find(i=>i.id===id);
 const items=[
  {id:'r',name:'테스트 원재료',kind:'raw',unit:'kg',qty:2,reserved:0,version:1,purchase_factor:10,purchase_unit:'10kg 봉지'},
  {id:'u',name:'미입력 원재료',kind:'raw',unit:'kg',qty:null,reserved:0,version:1},
  {id:'piece',name:'숟가락',kind:'raw',unit:'개',qty:20,reserved:0,version:1},
  {id:'s',name:'테스트 소분',kind:'semi',unit:'봉',qty:2,reserved:0,version:1},
  {id:'p',name:'테스트 키트',kind:'product',unit:'개',qty:5,reserved:1,version:1},
  {id:'p2',name:'레시피 미등록 제품',kind:'product',unit:'개',qty:null,reserved:0,version:1}
 ];
 const recipes=[{parent_id:'s',yield_qty:1,status:'confirmed',lines:[{itemId:'r',qty:.25}]},{parent_id:'p',yield_qty:1,status:'confirmed',lines:[{itemId:'s',qty:1}]}];
 const events=[{created_at:'2026-11-20T15:20:00Z',item_id:'s',mode:'produce',qty:2,reason:'<b>예시</b>',changes:[{id:'r',before:2.5,after:2},{id:'s',before:0,after:2}]}],calls=[];
 w.state={page:'materials'};
 w.esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
 w.openModal=html=>{q('modalBox').innerHTML=html;};w.closeModal=()=>{q('modalBox').innerHTML='';};w.toast=()=>{};w.confirm=()=>true;
 w.db={from(table){const chain={select:()=>chain,order:()=>chain,eq:()=>chain,limit:()=>chain,then:resolve=>Promise.resolve({data:structuredClone(({stock2_items:items,stock2_recipes:recipes,stock2_events:events})[table]||[])}).then(resolve)};return chain;},rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  const i=find(args.p_item),before=i.qty;
  assert.equal(args.p_expected_version,i.version++);
  i.qty=args.p_mode==='receive'?i.qty+args.p_qty:i.qty-args.p_qty;
  events.unshift({created_at:'2026-11-21T01:00:00Z',item_id:i.id,mode:args.p_mode,qty:args.p_qty,reason:args.p_reason,changes:[{id:i.id,before,after:i.qty}]});
  return {data:true};
 }};
 for(const file of ['inventory_planner.js','material_inventory_ui.js'])w.eval(fs.readFileSync(__dirname+'/../scripts/'+file,'utf8'));
 await w.renderMaterialInventory();
 w.document.querySelector('[data-mi-view=ledger]').click();
 const txt=()=>q('mi-ledger').textContent;
 assert.match(txt(),/지금 출고할 완제품/);
 assert.match(txt(),/테스트 키트4 개10 개/);
 assert.match(txt(),/미입력재고·레시피 확인 필요/);
 assert.match(txt(),/생산에 사용-0.5 kg2 kg<b>예시<\/b>/);
 assert.match(txt(),/2026\. 11\. 21/);
 const submit=()=>q('mi-form').onsubmit({preventDefault(){}});
 const pick=async(id)=>{q('mi-pick-item').value=id;await submit();};
 assert.equal(q('mi-ledger-add'),null);assert.equal(q('mi-ledger-count'),null);
 q('mi-record').click();q('mi-record-mode').value='receive';q('mi-record-mode').dispatchEvent(new w.Event('change'));
 await pick('u');assert.match(q('mi-error').textContent,/먼저 실사/);
 await pick('r');assert.equal(q('mi-mode').value,'receive');assert.equal(q('mi-mode').disabled,false);
 assert.equal(q('mi-entryunit').value,'base');
 q('mi-qty').value='0.5';q('mi-reason').value='입고 테스트';await submit();
 assert.equal(calls[0].name,'stock2_move');assert.equal(calls[0].args.p_qty,.5);assert.match(txt(),/테스트 키트4 개12 개/);assert.match(txt(),/입고\+0.5 kg2.5 kg/);
 q('mi-ledger-out').click();await pick('r');assert.equal(q('mi-mode').value,'issue');
 q('mi-qty').value='0.25';q('mi-reason').value='사용 테스트';await submit();
 assert.equal(calls[1].args.p_mode,'issue');assert.match(txt(),/테스트 키트4 개11 개/);assert.match(txt(),/사용·출고-0.25 kg2.25 kg/);
 assert.equal(find('piece').qty,20);assert.equal(find('p').qty,5);
 dom.window.close();
});
