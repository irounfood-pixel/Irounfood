'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
(async()=>{
 const dom=new JSDOM('<div id="page"></div><div id="modal" hidden><div id="modalBox"></div></div>',{runScripts:'outside-only',url:'https://test.invalid'}),w=dom.window;
 let checks=0;const ok=(a,b)=>{assert.deepEqual(a,b);checks++;};const has=(text,pattern)=>{assert.match(text,pattern);checks++;};
 const q=id=>w.document.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,0));
 w.state={page:'materials'};w.esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
 w.openModal=html=>{q('modalBox').innerHTML=html;q('modal').hidden=false;};w.closeModal=()=>{q('modalBox').innerHTML='';q('modal').hidden=true;};w.toast=()=>{};w.confirm=()=>true;
 const items=[{id:'r',name:'Test raw',kind:'raw',unit:'kg',qty:1,reserved:0,version:1,active:true},{id:'s',name:'Test portion',kind:'semi',unit:'봉',qty:2,reserved:0,version:1,active:true},{id:'p',name:'Test kit',kind:'product',unit:'개',qty:99,reserved:0,version:1,active:true}];
 const recipes=[{parent_id:'p',yield_qty:1,status:'confirmed',lines:[{itemId:'s',qty:1},{itemId:'r',qty:.1}]},{parent_id:'s',yield_qty:1,status:'confirmed',lines:[{itemId:'r',qty:.2}]}];
 let plans=[],calls=[],filters=[],simulateNetwork=false;
 const before=JSON.stringify(items);
 w.db={from(table){let date;const chain={select:()=>chain,eq:(key,value)=>{date=value;filters.push([key,value]);return chain;},order:()=>chain,limit:()=>chain,then:resolve=>{let data=table==='stock2_items'?items:table==='stock2_recipes'?recipes:table==='stock2_plans'?plans.filter(p=>p.plan_date===date):[];return Promise.resolve({data:structuredClone(data)}).then(resolve);}};return chain;},async rpc(name,args){calls.push({name,args:structuredClone(args)});if(simulateNetwork)throw Error('simulated network failure');if(name==='stock2_save_plan'){const existing=plans.find(p=>p.id===args.p_id);if(existing&&existing.version!==args.p_expected_version)return {error:{message:'다른 창에서 계획이 수정되었습니다',code:'P0001'}};const record={id:args.p_id,plan_date:args.p_date,demands:args.p_demands,notes:args.p_notes,status:args.p_status,version:(existing?.version||0)+1};if(existing)Object.assign(existing,record);else plans.push(record);return {data:record.id};}return {data:true};}};
 w.eval(fs.readFileSync(__dirname+'/../scripts/inventory_planner.js','utf8'));w.eval(fs.readFileSync(__dirname+'/../scripts/material_inventory_ui.js','utf8'));
 await w.renderMaterialInventory();has(q('mi-plans').textContent,/날짜별 생산계획/);ok(filters.at(-1)[0],'plan_date');
 q('mi-plan-add').click();q('mi-plan-date').value='2026-12-01';q('mi-plan-lines').querySelector('select').value='p';q('mi-plan-lines').querySelector('input').value='3';q('mi-plan-notes').value='<img src=x onerror=alert(1)>';
 await q('mi-form').onsubmit({preventDefault(){}});await tick();ok(plans.length,1);ok(calls[0].name,'stock2_save_plan');ok(calls[0].args.p_expected_version,0);ok(q('mi-plan-date-filter').value,'2026-12-01');ok(q('mi-plan-rows').querySelectorAll('img').length,0);has(q('mi-plan-rows').textContent,/<img/);
 q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/부족 재료 있음/);has(q('mi-plan-result').textContent,/3 봉/); // target existing stock 99 is ignored
 ok(JSON.stringify(items),before);
 q('mi-plan-mode').value='recursive';q('mi-plan-mode').onchange();ok(q('mi-plan-result').textContent,'');q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/작업 가능/);has(q('mi-plan-result').textContent,/0.5 kg/);
 q('mi-plan-add').click();q('mi-plan-lines').querySelector('select').value='p';q('mi-plan-lines').querySelector('input').value='2';await q('mi-form').onsubmit({preventDefault(){}});await tick();ok(plans.length,2);
 q('mi-plan-mode').value='recursive';q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/계획 2건 합산/);has(q('mi-plan-result').textContent,/1.1 kg/);has(q('mi-plan-result').textContent,/부족 재료 있음/);has(q('mi-plan-result').textContent,/0.1 kg/);ok(JSON.stringify(items),before);
 // date queries isolate other-day plans, not an unbounded local filter
 q('mi-plan-date-filter').value='2026-12-02';q('mi-plan-date-filter').onchange();await tick();has(q('mi-plan-rows').textContent,/없습니다/);q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/계산할 생산계획이 없습니다/);
 q('mi-plan-date-filter').value='2026-12-01';q('mi-plan-date-filter').onchange();await tick();q('mi-plan-rows').querySelector('button').click();q('mi-plan-status').value='cancelled';await q('mi-form').onsubmit({preventDefault(){}});await tick();ok(plans[0].status,'cancelled');q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/계획 1건 합산/);ok(JSON.stringify(items),before);
 // Invalid fractional piece count and duplicate target rejected before RPC.
 q('mi-plan-add').click();let row=q('mi-plan-lines').firstElementChild;row.querySelector('select').value='p';row.querySelector('input').value='0.5';let count=calls.length;await q('mi-form').onsubmit({preventDefault(){}});has(q('mi-error').textContent,/정수/);ok(calls.length,count);
 row.querySelector('input').value='2';q('mi-plan-addline').click();row=q('mi-plan-lines').lastElementChild;row.querySelector('select').value='p';row.querySelector('input').value='2';await q('mi-form').onsubmit({preventDefault(){}});has(q('mi-error').textContent,/한 행/);ok(calls.length,count);q('mi-close').click();
 // Ambiguous network outcome: changed payload blocked, exact retry permitted.
 q('mi-plan-add').click();row=q('mi-plan-lines').firstElementChild;row.querySelector('select').value='p';row.querySelector('input').value='2';simulateNetwork=true;await q('mi-form').onsubmit({preventDefault(){}});has(q('mi-error').textContent,/network/);count=calls.length;row.querySelector('input').value='3';await q('mi-form').onsubmit({preventDefault(){}});has(q('mi-error').textContent,/불확실/);ok(calls.length,count);row.querySelector('input').value='2';simulateNetwork=false;await q('mi-form').onsubmit({preventDefault(){}});await tick();ok(calls.length,count+1);ok(plans.length,3);ok(JSON.stringify(items),before);
 // Unknown quantity is not presented as a known zero shortage.
 items[0].qty=null;await w.renderMaterialInventory();q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/재고 또는 레시피 확인 필요/);has(q('mi-plan-result').textContent,/전체 발주량으로 사용하지 마세요/);has(q('mi-plan-result').textContent,/확인 필요/);
 // Row cap refuses incomplete aggregate.
 plans=Array.from({length:1000},(_,i)=>({id:'id'+i,plan_date:'2026-12-01',demands:[{itemId:'p',qty:1}],notes:'',status:'planned',version:1}));await w.renderMaterialInventory();q('mi-plan-calculate').click();has(q('mi-plan-result').textContent,/조회 한도/);
 ok(calls.every(c=>c.name==='stock2_save_plan'),true);dom.window.close();console.log(`${checks} production-plan DOM checks passed (not a visual browser test)`);
})().catch(e=>{console.error(e);process.exit(1)});
