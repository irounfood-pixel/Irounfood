/* Isolated material inventory UI. Existing order/stock modules are untouched. */
(function() {
'use strict';
let snapshot={items:[],recipes:[],events:[],plans:[]}, generation=0;
const q=id=>document.getElementById(id);
const num=n=>n===null||n===undefined?'미입력':Number(n).toLocaleString('ko-KR',{maximumFractionDigits:6});
const kinds={raw:'원재료·구매품',semi:'반제품',product:'제품'};
const safe=v=>esc(String(v??''));
const options=(items,selected)=>items.map(i=>`<option value="${safe(i.id)}" ${selected===i.id?'selected':''}>${safe(i.name)} (${safe(i.unit)})</option>`).join('');
const field=(label,id,value='',type='text',extra='')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${safe(value)}" ${extra}></div>`;
function plannerData(){return {items:snapshot.items.filter(i=>i.active!==false).map(i=>({id:i.id,kind:i.kind,unit:i.unit,stock:i.qty,reserved:i.reserved,estimate:i.estimated})),recipes:snapshot.recipes.map(r=>({parentId:r.parent_id,yieldQty:r.yield_qty,status:r.status,lines:r.lines}))};}
function capacityText(item){
 if(item.kind==='raw') return '—';
 const d=plannerData(),r=InventoryPlanner.capacity(d.items,d.recipes,item.id,{mode:'immediate'});
 if(r.qty===null) return r.status==='invalid'?'사양 확인 필요':'재고·레시피 확인 필요';
 return `${r.status==='estimated'?'약 ':''}${num(r.qty)} ${safe(item.unit)}${r.capped?' 이상':''}`;
}
window.renderMaterialInventory=async function(){
 const token=++generation;
 if(!planDateFilter)planDateFilter=todayKorea();
 q('page').innerHTML='<div class="panel">원재료·반제품·제품 재고를 불러오는 중…</div>';
 try {
  const result=await Promise.all([db.from('stock2_items').select('*').order('name'),db.from('stock2_recipes').select('*'),db.from('stock2_events').select('*').order('created_at',{ascending:false}).limit(100),db.from('stock2_plans').select('*').eq('plan_date',planDateFilter).order('created_at').limit(1000)]);
  if(token!==generation || state.page && state.page!=='materials') return;
  for(const r of result)if(r.error)throw r.error;
  snapshot={items:result[0].data||[],recipes:result[1].data||[],events:result[2].data||[],plans:result[3].data||[]};
  draw();
 }catch(e){if(token!==generation || state.page!=='materials')return;q('page').innerHTML=`<div class="panel"><h2>재고 화면을 불러오지 못했어요</h2><p>${safe(e.message||e)}</p><p>기존 주문과 기존 재고는 변경되지 않았습니다.</p><button class="btn secondary" id="mi-retry">다시 확인</button></div>`;q('mi-retry').onclick=window.renderMaterialInventory;}
};
function draw(){
 q('page').innerHTML=`<div class="top"><div><h1>원재료·반제품·제품</h1><div class="muted">입고 · 실사 · 생산 · 수동 예약 · 출고</div></div><div class="toolbar"><button class="btn secondary" id="mi-download">엑셀 체크리스트</button><button class="btn secondary" id="mi-upload">엑셀 실재고 업로드</button><button class="btn secondary" id="mi-refresh">새로고침</button><button class="btn primary" id="mi-add">+ 품목 등록</button></div></div>
 <div class="panel"><b>기존 주문·재고와 분리된 새 관리대장</b><p>주문 승인·출고와 자동 연결되지 않습니다. 예약도 수동 입력입니다. 빈 재고는 0이 아니라 미입력이며, 입고 전 최초 실사 수량을 입력해 주세요.</p><p class="muted">작업 가능 수량은 현재 준비된 반제품·원재료로 조립할 수 있는 수량입니다. 원재료로 반제품을 추가 생산하는 수량은 포함하지 않습니다. 여러 제품이 재료를 공유하므로 제품별 가능 수량을 합산하면 안 됩니다. 추정 개수는 출고 전 실제 수량을 확인하세요.</p></div>
 <div class="panel"><div class="toolbar"><label for="mi-filter">구분</label><select id="mi-filter"><option value="">전체</option>${Object.entries(kinds).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select><input id="mi-search" placeholder="품목명 검색" aria-label="품목명 검색"></div><div class="tablewrap"><table class="table"><thead><tr><th>품목 / 입고규격</th><th>구분</th><th>실재고</th><th>수동 예약</th><th>가용재고</th><th>추가 작업 가능</th><th>관리</th></tr></thead><tbody id="mi-rows"></tbody></table></div></div>
 <div id="mi-plans"></div>
 <div class="panel"><h2>최근 변경 이력</h2><div class="tablewrap"><table class="table"><thead><tr><th>일시</th><th>품목</th><th>작업</th><th>입력수량</th><th>사유</th></tr></thead><tbody>${snapshot.events.map(e=>`<tr><td>${safe(new Date(e.created_at).toLocaleString('ko-KR'))}</td><td>${safe(snapshot.items.find(i=>i.id===e.item_id)?.name||e.item_id)}</td><td>${safe(({receive:'입고',set:'실사',reserve:'수동예약',issue:'출고',produce:'생산',stocktake_import:'엑셀 실사'})[e.mode]||e.mode)}</td><td>${num(e.qty)}</td><td>${safe(e.reason)}${e.mode==='stocktake_import'?`<details><summary>품목별 변경 내역</summary>${(e.changes||[]).map(c=>`<div>${safe(snapshot.items.find(i=>i.id===c.id)?.name||c.id)}: ${num(c.before)} → ${num(c.after)} ${safe(snapshot.items.find(i=>i.id===c.id)?.unit||'')} ${safe(c.note||'')}</div>`).join('')}</details>`:''}</td></tr>`).join('')||'<tr><td colspan="5">아직 변경 이력이 없습니다.</td></tr>'}</tbody></table></div></div>`;
 q('mi-download').onclick=downloadStocktake;q('mi-upload').onclick=uploadStocktake;q('mi-refresh').onclick=window.renderMaterialInventory;q('mi-add').onclick=()=>editItem(null);q('mi-filter').onchange=drawRows;q('mi-search').oninput=drawRows;drawRows();drawPlans();
}
function drawRows(){const filter=q('mi-filter').value,search=q('mi-search').value.trim().toLowerCase();
 const items=snapshot.items.filter(i=>i.active!==false&&(!filter||i.kind===filter)&&i.name.toLowerCase().includes(search));
 q('mi-rows').innerHTML=items.map(i=>`<tr><td><b>${safe(i.name)}</b><div class="mini">${safe(i.purchase_unit||'입고단위 미입력')} ${i.purchase_factor==null?'':`→ ${num(i.purchase_factor)} ${safe(i.unit)}`}</div>${i.notes?`<div class="mini">${safe(i.notes)}</div>`:''}</td><td>${safe(kinds[i.kind])}</td><td>${i.estimated?'약 ':''}${num(i.qty)} ${safe(i.unit)}</td><td>${num(i.reserved)} ${safe(i.unit)}</td><td>${i.qty==null?'확인 필요':num(i.qty-i.reserved)}</td><td>${capacityText(i)}</td><td><button class="btn light" data-action="edit" data-id="${i.id}">사양</button> <button class="btn primary" data-action="move" data-id="${i.id}">입출고·실사</button> ${i.kind==='raw'?'':`<button class="btn light" data-action="recipe" data-id="${i.id}">레시피</button>`}</td></tr>`).join('')||'<tr><td colspan="7">해당 품목이 없습니다.</td></tr>';
 q('mi-rows').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=snapshot.items.find(x=>x.id===b.dataset.id);({edit:editItem,move:moveItem,recipe:editRecipe})[b.dataset.action](i);});
}
function modal(title,body){openModal(`<div class="between"><h2>${title}</h2><button class="btn light" id="mi-close">닫기</button></div><form id="mi-form">${body}<p id="mi-error" role="alert" class="dangertext"></p><button class="btn primary" id="mi-submit" type="submit">저장</button></form>`);q('mi-close').onclick=closeModal;}
function bindSave(handler){
 let busy=false;
 const requestId=crypto.randomUUID(),form=q('mi-form'),submit=q('mi-submit'),close=q('mi-close'),error=q('mi-error'),modalElement=q('modal');
 const stillCurrent=()=>q('mi-form')===form;
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  const blockClose=ev=>{if(ev.target.id==='modal'&&stillCurrent()){ev.stopImmediatePropagation();ev.preventDefault();}};
  modalElement.addEventListener('click',blockClose,true);submit.disabled=true;close.disabled=true;error.textContent='';
  try{
   await handler(requestId);toast('새 관리대장에 저장했습니다.');
   if(stillCurrent()){closeModal();if(state.page==='materials')await window.renderMaterialInventory();}
  }catch(err){if(stillCurrent()){error.textContent=err.message||String(err);submit.disabled=false;close.disabled=false;}}
  finally{modalElement.removeEventListener('click',blockClose,true);busy=false;}
 };
}
const pendingRequests=new Map();
async function rpc(name,args){
 const key=['stock2_move','stock2_save_plan','stock2_import_stocktake'].includes(name)?args.p_request:null,serialized=JSON.stringify(args);
 if(key&&pendingRequests.has(key)&&pendingRequests.get(key)!==serialized)throw Error('이전 요청의 저장 결과가 불확실합니다. 창을 닫고 새로고침하여 이력을 확인한 뒤 다시 작업해 주세요.');
 if(key)pendingRequests.set(key,serialized);
 const r=await db.rpc(name,args);
 if(r.error){if(key&&r.error.code)pendingRequests.delete(key);throw r.error;}
 if(key)pendingRequests.delete(key);return r.data;
}
function number(id,allowBlank=false){const v=q(id).value.trim();if(!v&&allowBlank)return null;if(!v||!Number.isFinite(Number(v)))throw Error('수량을 숫자로 입력해 주세요.');return Number(v);}
function editItem(item){modal(item?'품목 사양 수정':'새 품목',`<div class="formgrid">${field('품목명 *','mi-name',item?.name||'')}
 <div class="field"><label>구분</label><select id="mi-kind">${Object.entries(kinds).map(([v,n])=>`<option value="${v}" ${item?.kind===v?'selected':''}>${n}</option>`).join('')}</select></div><div class="field"><label>기본 재고단위</label><select id="mi-unit">${['kg','개','봉','세트','팩','장','쌍','롤'].map(u=>`<option ${item?.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
 ${field('구매·입고단위 이름 (예: 1kg 1봉)','mi-punit',item?.purchase_unit||'')}${field('입고단위 1당 기본단위 수량','mi-factor',item?.purchase_factor??'','number','step="0.000001" min="0"')}<div class="field"><label><input type="checkbox" id="mi-estimate" ${item?.estimated?'checked':''}> 수량 환산은 추정치 (예: 소시지 약 40개)</label></div><div class="field"><label>메모</label><textarea id="mi-notes">${safe(item?.notes||'')}</textarea></div></div><p class="muted">사양 저장은 입고 처리가 아닙니다. 통상 구매량 1,000개를 현재 재고로 자동 입력하지 않습니다.</p>`);
 if(item){q('mi-kind').disabled=true;q('mi-unit').disabled=true;}
 bindSave(async()=>{const name=q('mi-name').value.trim();if(!name)throw Error('품목명을 입력해 주세요.');await rpc('stock2_save_item',{p_payload:{id:item?.id||null,name,kind:q('mi-kind').value,unit:q('mi-unit').value,purchase_unit:q('mi-punit').value.trim(),purchase_factor:number('mi-factor',true),estimated:q('mi-estimate').checked,notes:q('mi-notes').value.trim(),expected_version:item?.version??null}});});
}
function editRecipe(item){const recipe=snapshot.recipes.find(r=>r.parent_id===item.id),eligible=snapshot.items.filter(i=>i.active!==false&&i.id!==item.id&&i.kind!=='product');
 modal(`${safe(item.name)} 레시피`,`${field(`1배합 생산량 (${safe(item.unit)})`,'mi-yield',recipe?.yield_qty??'','number','min="0" step="0.000001"')}<div class="field"><label>상태</label><select id="mi-status"><option value="draft">확인 중 (계산에 사용 안 함)</option><option value="confirmed" ${recipe?.status==='confirmed'?'selected':''}>확정</option></select></div><div id="mi-lines"></div><button class="btn secondary" id="mi-addline" type="button">+ 재료 추가</button><p class="muted">재료 수량은 기본단위 기준입니다. 15g은 0.015kg입니다. 식탁보처럼 4인당 1개는 0.25와 올림을 선택하세요. 실제 배합량이 없는 레시피는 확인 중으로 저장하세요.</p>`);
 function addLine(line={}){const row=document.createElement('div');row.className='formgrid';row.style.margin='12px 0';row.innerHTML=`<div class="field"><label>재료</label><select class="mi-component"><option value="">선택</option>${options(eligible,line.itemId)}</select></div><div class="field"><label>1배합 소요량 (선택 재료 기본단위)</label><input type="number" class="mi-lineqty" min="0" step="0.000001" value="${safe(line.qty??'')}"></div><label><input type="checkbox" class="mi-ceil" ${line.rounding==='ceil'?'checked':''}> 총 필요량 올림</label><button class="btn danger mi-remove" type="button">재료 삭제</button>`;row.querySelector('.mi-remove').onclick=()=>row.remove();q('mi-lines').append(row);}
 (recipe?.lines?.length?recipe.lines:[{}]).forEach(addLine);q('mi-addline').onclick=()=>addLine();
 bindSave(async()=>{const lines=[...q('mi-lines').children].map(row=>({itemId:row.querySelector('select').value,qty:row.querySelector('.mi-lineqty').value===''?null:Number(row.querySelector('.mi-lineqty').value),...(row.querySelector('.mi-ceil').checked?{rounding:'ceil'}:{})}));if(lines.some(l=>!l.itemId))throw Error('모든 재료를 선택하거나 빈 행을 삭제해 주세요.');if(new Set(lines.map(l=>l.itemId)).size!==lines.length)throw Error('동일한 재료는 한 행으로 합쳐 주세요.');await rpc('stock2_save_recipe',{p_parent:item.id,p_yield:number('mi-yield',true),p_lines:lines,p_status:q('mi-status').value,p_expected_version:item.version});});
}

let planDateFilter='';
function todayKorea(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());}
function drawPlans(){
 if(!planDateFilter)planDateFilter=todayKorea();
 q('mi-plans').innerHTML=`<div class="panel"><div class="between"><h2>날짜별 생산계획</h2><button class="btn primary" id="mi-plan-add">+ 생산계획 입력</button></div><p>계획 수량은 <b>새로 만들 수량</b>입니다. 완제품 재고를 빼지 않습니다. 저장·취소·계산은 재고를 변경하거나 예약하지 않습니다.</p><p class="muted">주문과 자동 연결되지 않으므로 동일 주문을 중복 입력하지 마세요. 생산이 끝나면 해당 품목의 ‘입출고·실사 → 생산 완료 기록’에서 실제 생산량과 사용량을 별도로 기록하세요.</p><div class="toolbar"><label for="mi-plan-date-filter">조회일</label><input id="mi-plan-date-filter" type="date" value="${safe(planDateFilter)}"><label for="mi-plan-mode">재료 계산</label><select id="mi-plan-mode"><option value="immediate">현재 반제품·원재료로 작업</option><option value="recursive">부족한 반제품도 추가 생산</option></select><button class="btn secondary" id="mi-plan-calculate">이 날짜 전체 필요량 계산</button></div><div class="tablewrap"><table class="table"><thead><tr><th>생산일</th><th>품목 · 새로 만들 수량</th><th>메모</th><th>상태</th><th>관리</th></tr></thead><tbody id="mi-plan-rows"></tbody></table></div><p class="mini">최근 조회는 날짜별 최대 1,000건입니다. 1,000건에 도달하면 누락 방지를 위해 합산 계산을 중단합니다. 다른 날짜와 별도 계산됩니다.</p><div id="mi-plan-result" aria-live="polite"></div></div>`;
 q('mi-plan-add').onclick=()=>editPlan(null);
 q('mi-plan-date-filter').onchange=()=>{planDateFilter=q('mi-plan-date-filter').value||todayKorea();window.renderMaterialInventory();};
 q('mi-plan-mode').onchange=()=>{q('mi-plan-result').innerHTML='';};
 q('mi-plan-calculate').onclick=calculatePlans;drawPlanRows();
}
function drawPlanRows(){
 const plans=snapshot.plans.filter(p=>p.plan_date===planDateFilter);
 q('mi-plan-rows').innerHTML=plans.map(p=>`<tr><td>${safe(p.plan_date)}</td><td>${p.demands.map(l=>{const i=snapshot.items.find(i=>i.id===l.itemId);return `${safe(i?.name||'삭제·누락 품목')} ${num(l.qty)} ${safe(i?.unit||'')}`;}).join('<br>')}</td><td>${safe(p.notes)}</td><td>${p.status==='cancelled'?'취소':'계획'}</td><td><button class="btn light" data-plan-id="${safe(p.id)}">수정·취소</button></td></tr>`).join('')||'<tr><td colspan="5">이 날짜에 저장된 생산계획이 없습니다.</td></tr>';
 q('mi-plan-rows').querySelectorAll('button').forEach(b=>b.onclick=()=>editPlan(snapshot.plans.find(p=>p.id===b.dataset.planId)));
}
function editPlan(plan){
 const eligible=snapshot.items.filter(i=>i.active!==false&&i.kind!=='raw'),id=plan?.id||crypto.randomUUID();
 modal(plan?'생산계획 수정':'생산계획 입력',`${field('생산 예정일 *','mi-plan-date',plan?.plan_date||planDateFilter||todayKorea(),'date','required')}<div class="field"><label for="mi-plan-status">상태</label><select id="mi-plan-status"><option value="planned">계획</option><option value="cancelled" ${plan?.status==='cancelled'?'selected':''}>취소</option></select></div><div id="mi-plan-lines"></div><button class="btn secondary" id="mi-plan-addline" type="button">+ 생산 품목</button><div class="field"><label for="mi-plan-notes">메모 (최대 1,000자)</label><textarea id="mi-plan-notes" maxlength="1000">${safe(plan?.notes||'')}</textarea></div><p class="muted">제품·반제품의 새로 만들 수량을 입력합니다. 계획 저장만으로 재고가 차감되거나 생산 완료 처리되지 않습니다. 재료 필요량은 조회 시점의 레시피·재고로 다시 계산합니다.</p>`);
 function addLine(line={}){const row=document.createElement('div');row.className='formgrid';row.style.margin='12px 0';row.innerHTML=`<div class="field"><label>생산할 품목</label><select class="mi-plan-item"><option value="">선택</option>${options(eligible,line.itemId)}</select></div><div class="field"><label>새로 만들 수량 (선택 품목 단위)</label><input class="mi-plan-qty" type="number" min="0.000001" max="999999999" step="0.000001" value="${safe(line.qty??'')}" required></div><button class="btn danger mi-plan-remove" type="button">품목 삭제</button>`;row.querySelector('.mi-plan-remove').onclick=()=>row.remove();q('mi-plan-lines').append(row);}
 (plan?.demands?.length?plan.demands:[{}]).forEach(addLine);const planForm=q('mi-form');q('mi-plan-addline').onclick=()=>{if(q('mi-plan-lines').children.length>=100){toast('계획당 최대 100개 품목까지 입력할 수 있습니다.');return;}addLine();};
 bindSave(async requestId=>{
  const date=q('mi-plan-date').value,notes=q('mi-plan-notes').value.trim(),status=q('mi-plan-status').value;
  if(date<'2000-01-01'||date>'2100-12-31'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('생산 예정일을 확인해 주세요.');
  const demands=[...q('mi-plan-lines').children].map(row=>({itemId:row.querySelector('.mi-plan-item').value,qty:Number(row.querySelector('.mi-plan-qty').value)}));
  if(!demands.length||demands.length>100)throw Error('생산 품목을 1~100개 입력해 주세요.');
  if(new Set(demands.map(l=>l.itemId)).size!==demands.length)throw Error('같은 품목은 한 행으로 합쳐 주세요.');
  for(const l of demands){const item=eligible.find(i=>i.id===l.itemId);if(!item||!Number.isFinite(l.qty)||l.qty<0.000001||l.qty>=1000000000||(item.unit!=='kg'&&!Number.isInteger(l.qty)))throw Error('품목·양수를 확인해 주세요. 개수 단위는 정수로 입력하세요.');}
  await rpc('stock2_save_plan',{p_request:requestId,p_id:id,p_date:date,p_demands:demands,p_notes:notes,p_status:status,p_expected_version:plan?.version??0});if(q('mi-form')===planForm&&state.page==='materials')planDateFilter=date;
 });
}
function calculatePlans(){
 const plans=snapshot.plans.filter(p=>p.plan_date===planDateFilter&&p.status==='planned'),target=q('mi-plan-result');
 if(snapshot.plans.length>=1000){target.innerHTML='<p class="dangertext">조회 한도에 도달하여 일부 계획이 누락될 수 있습니다. 전체 필요량 계산을 중단했습니다.</p>';return;}
 if(!plans.length){target.innerHTML='<p>계산할 생산계획이 없습니다.</p>';return;}
 const d=plannerData(),mode=q('mi-plan-mode').value;
 const result=InventoryPlanner.plan(d.items,d.recipes,plans.flatMap(p=>p.demands),{mode,useFinishedStock:false});
 const titles={ready:'현재 입력 재고 기준 작업 가능',estimated:'추정 환산값 포함 · 실수량 확인 필요',shortage:'부족 재료 있음',unknown:'재고 또는 레시피 확인 필요',invalid:'품목·레시피 입력 오류 확인 필요'};
 const lookup=id=>snapshot.items.find(i=>i.id===id),shortages=new Map((result.shortages||[]).map(l=>[l.itemId,l.qty]));
 const problemNames={UNKNOWN_STOCK:'재고 미입력',DRAFT_RECIPE:'레시피 확인 중',MISSING_RECIPE:'레시피 없음',INVALID_DEMAND:'계획 품목·수량 확인',RECIPE_CYCLE:'순환 레시피'};
 const issues=(result.issues||[]).map(i=>`<li>${safe(lookup(i.itemId)?.name||i.itemId||'입력값')}: ${safe(problemNames[i.code]||i.code)}</li>`).join('');
 const rows=(result.required||[]).map(l=>{const i=lookup(l.itemId),available=i?.qty==null?null:i.qty-(i.reserved||0);return `<tr><td>${safe(i?.name||l.itemId)}</td><td>${safe(kinds[i?.kind]||'')}</td><td>${num(l.qty)} ${safe(l.unit)}</td><td>${available===null?'미입력':`${i.estimated?'약 ':''}${num(available)} ${safe(l.unit)}`}</td><td>${available===null||(result.issues||[]).some(x=>x.itemId===l.itemId)?'확인 필요':`${num(shortages.get(l.itemId)||0)} ${safe(l.unit)}`}</td></tr>`;}).join('');
 const made=(result.produced||[]).map(l=>`<li>${safe(lookup(l.itemId)?.name||l.itemId)}: ${num(l.qty)} ${safe(l.unit)}</li>`).join('');
 target.innerHTML=`<h3>${safe(titles[result.status]||'확인 필요')}</h3><p>${safe(planDateFilter)} · 계획 ${plans.length}건 합산 · 현재 저장된 레시피 기준 · 손실률 미포함</p><p class="muted">공통 재료는 한 번만 배분합니다. 새로 만들 수량을 기준으로 전체 배합 단위로 올림하여 제안합니다. 수동 예약분은 가용재고에서 제외하며, 다른 날짜의 계획·미연결 주문은 자동 차감하지 않습니다. 이 결과는 납품 확약이 아닙니다.</p>${issues?`<ul class="dangertext">${issues}</ul><p>확인되지 않은 부분은 계산에서 누락될 수 있습니다. 아래는 확인 가능한 범위이며 전체 발주량으로 사용하지 마세요.</p>`:''}<h4>작업·소분 필요량 및 재료 합계</h4><div class="tablewrap"><table class="table"><thead><tr><th>품목 (등록 규격)</th><th>구분</th><th>총 필요량</th><th>현재 가용재고</th><th>부족량</th></tr></thead><tbody>${rows||'<tr><td colspan="5">계산 가능한 재료가 없습니다.</td></tr>'}</tbody></table></div>${made?`<h4>계산상 생산 제안량 (실제 완료 아님)</h4><ul>${made}</ul>`:''}<p class="mini">반제품 추가 생산 모드에서는 반제품과 그 원재료가 함께 표시됩니다. 서로 다른 단계의 수량을 더하지 마세요. 현재 재고가 있는 반제품은 우선 사용하며, 해당 원재료는 다시 차감 계산하지 않습니다.</p>`;
}

async function downloadStocktake(){
 try{if(typeof XLSX==='undefined')throw Error('엑셀 도구를 불러오지 못했습니다. 새로고침하세요.');const r=await db.from('stock2_items').select('*').order('name');if(r.error)throw r.error;if((r.data||[]).length>=1000)throw Error('품목 조회 한도에 도달했습니다. 누락 방지를 위해 다운로드를 중단합니다.');XLSX.writeFile(InventoryExcel.workbook(r.data||[],XLSX),`재고체크리스트_${todayKorea()}.xlsx`);}catch(e){toast(e.message||String(e));}
}
function uploadStocktake(){
 modal('엑셀 실재고 업로드','<p>실재고는 보유 총수량으로 대체합니다. 공란은 미변경, 0은 재고 0입니다. 기존 주문·기존 재고는 변경하지 않습니다.</p><input id="mi-file" type="file" accept=".xlsx"><div id="mi-preview"></div>');
 const form=q('mi-form'),button=q('mi-submit');button.disabled=true;button.textContent='미리보기 확인 후 저장';let changes=null,reading=0;
 q('mi-file').onchange=async()=>{const token=++reading;changes=null;button.disabled=true;q('mi-preview').innerHTML='';q('mi-error').textContent='';try{
 const file=q('mi-file').files[0];if(!file)return;if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw Error('5MB 이하의 .xlsx 파일을 선택하세요.');
 if(typeof XLSX==='undefined')throw Error('엑셀 도구 로딩 실패. 새로고침하세요.');
 const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true,cellDates:false}),r=await db.from('stock2_items').select('*');if(r.error)throw r.error;
 if(token!==reading||q('mi-form')!==form)return;if((r.data||[]).length>=1000)throw Error('품목 조회 한도에 도달했습니다. 누락 방지를 위해 업로드를 중단합니다.');changes=InventoryExcel.read(book,r.data||[],XLSX);
 q('mi-preview').innerHTML=`<h3>${changes.length}개 품목 변경 예정</h3><p>공란 품목은 변경하지 않습니다. 아래 수량과 단위를 확인하세요.</p><div class="tablewrap"><table class="table"><thead><tr><th>품목</th><th>현재</th><th>변경 후</th><th>메모</th></tr></thead><tbody>${changes.map(c=>`<tr><td>${safe(c.name)}</td><td>${num(c.before)} ${safe(c.unit)}</td><td>${num(c.qty)} ${safe(c.unit)}</td><td>${safe(c.note)}</td></tr>`).join('')}</tbody></table></div>`;button.disabled=false;
 }catch(e){if(token===reading&&q('mi-form')===form)q('mi-error').textContent=e.message||String(e);}};
 bindSave(async requestId=>{if(!changes)throw Error('파일 검증이 필요합니다.');if(!confirm(`${changes.length}개 품목을 미리보기의 실재고로 변경할까요? 입고 추가가 아닌 총수량 대체입니다.`))throw Error('저장을 취소했습니다.');q('mi-file').disabled=true;await rpc('stock2_import_stocktake',{p_request:requestId,p_rows:changes.map(({id,unit,version,qty,note})=>({id,unit,version,qty,note}))});});
}

function moveItem(item){const recipe=snapshot.recipes.find(r=>r.parent_id===item.id),canProduce=item.kind!=='raw'&&recipe?.status==='confirmed';
 modal(`${safe(item.name)} 입출고·실사`,`<p>현재 ${num(item.qty)} ${safe(item.unit)} / 수동예약 ${num(item.reserved)} ${safe(item.unit)}</p><div class="field"><label>작업</label><select id="mi-mode"><option value="set">실사 수량으로 맞추기</option><option value="receive">입고</option><option value="reserve">수동 예약 총수량 설정</option><option value="issue">수동 출고</option>${canProduce?'<option value="produce">생산 완료 기록</option>':''}</select></div>${field(`수량 (${safe(item.unit)})`,'mi-qty','','number','min="0" step="0.000001"')}<div class="field" id="mi-entrywrap"><label>입고 수량 입력단위</label><select id="mi-entryunit"><option value="base">기본단위 (${safe(item.unit)})</option>${item.purchase_factor>0?`<option value="purchase">구매단위 (${safe(item.purchase_unit||'입고단위')})</option>`:''}</select></div><div id="mi-convert"></div><div id="mi-consume"></div>${field('사유 / 로트·소비기한 메모 *','mi-reason')}<p class="muted" id="mi-help"></p>`);
 function update(){const mode=q('mi-mode').value,qty=Number(q('mi-qty').value),batches=canProduce&&qty>0?Math.ceil(qty/recipe.yield_qty):0;
 q('mi-help').textContent=({set:'창고에서 센 총수량으로 변경합니다. 기존 주문관리의 재고는 바뀌지 않습니다.',receive:'현재 실재고에 더합니다. 최초 실사가 안 된 품목은 먼저 실사 수량을 입력하세요.',reserve:'기존 예약에 더하는 것이 아니라 수동 예약 총수량을 설정합니다. 주문과 자동 연결되지 않습니다.',issue:'가용재고에서 수동 차감합니다. 기존 주문 출고 처리와 중복 기록하지 않도록 확인하세요.',produce:'실제 완성 수량을 더하고 아래 실제 사용량을 한 번에 차감합니다. 아래 제안량은 전체 배합 단위이며 실제 사용량으로 수정할 수 있습니다.'})[mode];
 q('mi-entrywrap').style.display=mode==='receive'?'':'none';if(mode!=='receive')q('mi-entryunit').value='base';
 const usingPurchase=mode==='receive'&&q('mi-entryunit').value==='purchase';
 q('mi-convert').textContent=mode==='receive'&&item.purchase_factor?`구매단위 1 ${item.purchase_unit||''} = ${num(item.purchase_factor)} ${item.unit}. ${usingPurchase?`입고 반영량: ${num(qty*item.purchase_factor)} ${item.unit}`:'현재 기본단위로 입력 중'}${item.estimated?' (추정 환산값: 실제 수량 확인 필요)':''}`:'';
 q('mi-consume').innerHTML=mode==='produce'?`<h3>실제 재료 사용량</h3>${recipe.lines.map((l,index)=>{const child=snapshot.items.find(i=>i.id===l.itemId),amount=l.qty*batches;return field(`${safe(child?.name||l.itemId)} (${safe(child?.unit||'')})`,'mi-input-'+index,l.rounding==='ceil'?Math.ceil(amount):amount,'number','min="0" step="0.000001"');}).join('')}`:'';
 }
 q('mi-mode').onchange=update;q('mi-qty').onchange=update;q('mi-entryunit').onchange=update;update();
 bindSave(async requestId=>{const mode=q('mi-mode').value,reason=q('mi-reason').value.trim();let qty=number('mi-qty');if(mode==='receive'&&q('mi-entryunit').value==='purchase')qty=Number((qty*item.purchase_factor).toFixed(6));if(qty<0||(!['set','reserve'].includes(mode)&&qty===0))throw Error('수량 범위를 확인해 주세요.');if(item.unit!=='kg'&&!Number.isInteger(qty))throw Error('개수 단위 입고량은 정수여야 합니다. 환산량을 확인해 주세요.');if(!reason)throw Error('사유를 입력해 주세요.');if(item.qty===null&&mode!=='set')throw Error('먼저 최초 실사 수량을 입력해 주세요.');let inputs=null;if(mode==='produce')inputs=recipe.lines.map((l,index)=>{const amount=number('mi-input-'+index),component=snapshot.items.find(i=>i.id===l.itemId);if(amount<=0||(component.unit!=='kg'&&!Number.isInteger(amount)))throw Error('재료 실제 사용량은 양수이며 개수 단위는 정수여야 합니다.');return {itemId:l.itemId,qty:amount};});if(!confirm(`${item.name}: ${mode==='set'?'실사 총수량':mode==='reserve'?'수동예약 총수량':'처리수량'} ${num(qty)} ${item.unit}을 저장할까요?${mode==='produce'?' 재료 사용량도 함께 차감됩니다.':''}`))throw Error('저장을 취소했습니다.');await rpc('stock2_move',{p_request:requestId,p_item:item.id,p_mode:mode,p_qty:qty,p_reason:reason,p_inputs:inputs,p_expected_version:item.version});});
}
})();
