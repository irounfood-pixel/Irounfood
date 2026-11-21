const shippingBusy=new Set();
async function shipOrder(id){const order=state.orders.find(o=>o.id===id);if(!order||!isOpenOrder(order)||shippingBusy.has(id))return;if(!confirm('주문 '+order.order_no+'을 출고완료 처리할까요?\n연결된 재고가 차감됩니다.'))return;shippingBusy.add(id);try{const {data,error}=await db.rpc('ship_order_v2',{p_order_id:id});if(error)throw error;toast('출고완료 및 재고 차감이 처리되었습니다.');closeModal();await loadAll();await route('orders')}catch(e){toast('출고 처리 실패: '+(e.message||e))}finally{shippingBusy.delete(id);}}
async function cancelOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;if(o.order_status==='출고완료')return toast('출고완료 주문은 여기서 취소할 수 없습니다.');if(o.order_status==='취소')return toast('이미 취소된 주문입니다.');if(!confirm('이 주문을 취소할까요?\\n\\n고객 주문에서 승인된 건이면 주문신청을 다시 “신청” 상태로 돌려놓습니다.'))return;try{const {data:didCancel,error}=await db.rpc('cancel_order_v2',{p_order_id:id});if(error)throw error;if(didCancel===false)return toast('이미 취소된 주문입니다.');toast('주문이 취소되었습니다. 고객 주문신청이 있으면 다시 검토할 수 있도록 되돌렸습니다.');closeModal();await loadAll();await route('orders')}catch(e){toast('취소 실패: '+(e.message||e))}}
function exportOrders(){const ids=new Set(visibleOrders().map(o=>o.id));const rows=orderRows().filter(r=>ids.has(r.order.id)).map(r=>({주문번호:r.order.order_no,주문일:r.order.order_date||'',주문경로:r.order.order_source||'',고객기관명:r.order.customer_name||'',담당자:r.order.manager_name||'',연락처:r.order.contact||'',배송일:r.order.ship_date||'',배송지:r.order.address||'',수령방법:r.order.receive_method||'',상품명:r.product_name_snapshot||r.kit_name||'',수량:r.quantity||0,주문상태:r.order.order_status||'',결제상태:r.order.payment_status||'',요청사항:r.order.note||''}));const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'주문내역');XLSX.writeFile(wb,'이로운과자점_주문내역.xlsx')}
function renderRequests(){const history=window.__approvalHistory||false,source=window.__approvalSource||'all';const rows=state.requests.filter(r=>history?r.status!=='신청':r.status==='신청');$('page').innerHTML=`<div class="top"><div><h1>주문승인</h1><div class="muted">고객·ML 주문을 함께 확인합니다. 승인 후 주문현황에서 출고를 처리하세요.</div></div><button class="btn secondary" onclick="init()">새로고침</button></div>${errorBanner()}<div class="toolbar">${[['all','전체'],['customer','고객'],['ml','ML']].map(([k,n])=>`<button class="btn ${source===k?'primary':'light'}" onclick="window.__approvalSource='${k}';renderRequests()">${n}</button>`).join('')}<button class="btn ${!history?'secondary':'light'}" onclick="window.__approvalHistory=false;renderRequests()">승인대기</button><button class="btn ${history?'secondary':'light'}" onclick="window.__approvalHistory=true;renderRequests()">승인·반려 이력</button><button class="btn light" onclick="goWork('orders')">주문현황 보기</button></div><div class="panel ${source==='ml'?'hidden':''}"><h2>고객 주문 · ${rows.length}건</h2><div class="tablewrap"><table class="table"><thead><tr><th>신청일</th><th>고객</th><th>연락처</th><th>상품</th><th>배송지</th><th>상태</th><th>결정</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${dateStr(r.created_at)}</td><td>${esc(r.customer_name)}</td><td>${esc(r.contact||'')}</td><td>${(r.customer_order_request_items||[]).map(i=>esc(i.product_name_snapshot)).join('<br>')}</td><td>${esc(r.address||'')}</td><td><span class="badge ${r.status==='신청'?'warn':r.status==='승인'?'good':'danger'}">${esc(r.status)}</span></td><td style="white-space:nowrap">${r.status==='신청'?`<button class="btn primary" onclick="approveRequest('${r.id}')">주문 등록(승인)</button> <button class="btn danger" onclick="rejectRequest('${r.id}')">거절</button>`:r.status==='거절'?'<span class="muted">거절됨</span>':'<span class="muted">주문 등록됨</span>'}</td></tr>`).join(''):`<tr><td colspan="7"><div class="empty">고객 주문신청이 없습니다.</div></td></tr>`}</tbody></table></div></div><div id="partnerInline" class="${source==='customer'?'hidden':''}"><div class="panel">Google Sheets 승인대기 주문을 불러오는 중입니다.</div></div>`;if(source!=='customer')renderPartnerOrders(true)}
async function approveRequest(id){const r=state.requests.find(x=>x.id===id);if(!r)return;try{const {data:o,error}=await db.rpc('approve_customer_order_v2',{p_request_id:id});if(error)throw error;toast('고객 주문이 내부 주문으로 등록되었습니다.');await init();route('requests')}catch(e){toast('등록 실패: '+(e.message||e))}}
async function rejectRequest(id){const r=state.requests.find(x=>x.id===id);if(!r||r.status!=='신청')return toast('현재 상태에서는 거절할 수 없습니다.');if(!confirm('이 고객 주문신청을 거절할까요?'))return;try{const {data,error}=await db.from('customer_order_requests').update({status:'거절'}).eq('id',id).eq('status','신청').select('id').maybeSingle();if(error)throw error;if(!data)return toast('신청 상태가 변경되었습니다. 새로고침 후 다시 확인해주세요.');toast('고객 주문신청을 거절했습니다.');await init();route('requests')}catch(e){toast('거절 처리 실패: '+(e.message||e))}}
function errorBanner(){return state.errors.length?`<div class="panel" style="border-color:#dfb66e;background:#fffaf0"><b style="color:#865d0b">일부 데이터 조회에 실패했습니다.</b><div style="margin-top:7px;font-size:13px;line-height:1.6">${state.errors.map(x=>esc(x)).join('<br>')}</div><div class="muted" style="margin-top:6px">정상 조회된 상품은 별도로 표시합니다. 목록이 0개이면 아래 안내도 확인하세요.</div></div>`:''}
function renderProducts(){ $('page').innerHTML=`<div class="top"><div><h1>상품관리</h1><div class="muted">새 상품명을 직접 등록하고 판매여부·가격·재고 연결을 관리합니다.</div></div><div class="toolbar"><button class="btn secondary" onclick="init()">새로고침</button><button class="btn primary" onclick="openProduct()">+ 새 상품 등록</button></div></div>${errorBanner()}<div class="panel"><div class="tablewrap"><table class="table"><thead><tr><th>상품명</th><th>종류</th><th>판매가</th><th>재고품목</th><th>재고차감</th><th>판매상태</th><th></th></tr></thead><tbody>${state.products.length?state.products.map(p=>{const it=state.items.find(i=>i.id===p.inventory_item_id);return `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.category||'')}</td><td>${fmt(p.price)}원</td><td>${esc(it?.name||'미연결')}</td><td>${fmt(p.deduction_qty||1)} ${esc(it?.unit||'')}</td><td><span class="badge ${p.active!==false?'good':'danger'}">${p.active!==false?'판매중':'판매중지'}</span></td><td style="white-space:nowrap"><button class="btn light" onclick="openProduct('${p.id}')">수정</button> <button class="btn danger" onclick="deleteProduct('${p.id}')">삭제</button></td></tr>`}).join(''):`<tr><td colspan="7"><div class="empty">${state.errors.some(x=>x.startsWith('상품:'))?'상품 조회 오류가 발생했습니다. 위 오류 내용을 확인하세요.':'상품 조회 결과가 0개입니다. 로그인 계정이 관리자 권한에 연결됐는지 확인하고 새로고침하세요.'}</div></td></tr>`}</tbody></table></div></div>`}
function openProduct(id){const p=id?state.products.find(x=>x.id===id):null;openModal(`<div class="between"><h2 style="margin:0">${p?'상품 수정':'새 상품 등록'}</h2><button class="btn light" onclick="closeModal()">닫기</button></div><div class="formgrid" style="margin-top:16px"><div class="field"><label>상품명 *</label><input id="p_name" value="${esc(p?.name||'')}"></div><div class="field"><label>상품 종류</label><input id="p_cat" value="${esc(p?.category||'')}"></div><div class="field"><label>판매가격</label><input id="p_price" type="number" min="0" value="${Number(p?.price||0)}"></div><div class="field"><label>판매단위</label><input id="p_unit" value="${esc(p?.sale_unit||'개')}"></div><div class="field"><label>실제 재고품목</label><select id="p_item"><option value="">미연결</option>${itemOptions()}</select></div><div class="field"><label>재고 차감수량</label><input id="p_dq" type="number" min="0" step="0.001" value="${Number(p?.deduction_qty??1)}"></div><div class="field"><label>판매여부</label><select id="p_active"><option value="true" ${p?.active!==false?'selected':''}>판매중</option><option value="false" ${p?.active===false?'selected':''}>판매중지</option></select></div><div class="field"><label>상품 설명</label><input id="p_desc" value="${esc(p?.description||'')}"></div></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn primary" onclick="saveProduct('${id||''}')">저장</button></div>`);if(p&&p.inventory_item_id)$('p_item').value=p.inventory_item_id}
async function deleteProduct(id){
 const p=state.products.find(x=>x.id===id);
 if(!p)return toast('삭제할 상품을 찾을 수 없습니다.');
 const ok=confirm(`상품 '${p.name}'을(를) 삭제할까요?\n\n과거 주문에 연결된 상품은 주문 기록 보존을 위해 삭제되지 않습니다. 그런 경우 판매중지로 변경해주세요.`);
 if(!ok)return;
 try{
   const {count,error:checkError}=await db.from('order_items').select('id',{count:'exact',head:true}).eq('product_id',id);
   if(checkError)throw checkError;
   if((count||0)>0){
     toast('이 상품은 기존 주문 내역에 연결되어 있어 삭제할 수 없습니다. 상품 수정에서 판매중지로 변경해주세요.');
     return;
   }
   const {error}=await db.from('products').delete().eq('id',id);
   if(error)throw error;
   toast('상품이 삭제되었습니다.');
   await init();
   route('products');
 }catch(e){
   toast('상품 삭제 실패: '+(e.message||e));
 }
}
async function saveProduct(id){const payload={name:$('p_name').value.trim(),category:$('p_cat').value.trim(),price:Number($('p_price').value||0),sale_unit:$('p_unit').value.trim()||'개',inventory_item_id:$('p_item').value||null,deduction_qty:Number($('p_dq').value||0),active:$('p_active').value==='true',description:$('p_desc').value.trim()};if(!payload.name)return toast('상품명을 입력해주세요.');try{let q=id?db.from('products').update(payload).eq('id',id):db.from('products').insert(payload);const {error}=await q;if(error)throw error;toast('상품이 저장되었습니다.');closeModal();await init();route('products')}catch(e){toast('상품 저장 실패: '+(e.message||e))}}
function openInventoryItem(id){const it=id?state.items.find(x=>x.id===id):null;openModal(`<div class="between"><h2 style="margin:0">${it?'재고품목 수정':'재고품목 추가'}</h2><button class="btn light" onclick="closeModal()">닫기</button></div><div class="formgrid" style="margin-top:16px"><div class="field"><label>품목명 *</label><input id="ii_name" value="${esc(it?.name||'')}"></div><div class="field"><label>구분</label><input id="ii_cat" value="${esc(it?.category||'')}" placeholder="예: 교육키트 / 원재료 / 부자재"></div><div class="field"><label>단위</label><input id="ii_unit" value="${esc(it?.unit||'개')}"></div><div class="field"><label>사용여부</label><select id="ii_active"><option value="true" ${it?.active!==false?'selected':''}>사용</option><option value="false" ${it?.active===false?'selected':''}>사용중지</option></select></div></div><div class="muted" style="margin-top:10px">현재재고는 재고거래로만 변경합니다.</div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn primary" onclick="saveInventoryItem('${id||''}')">저장</button></div>`)}
async function saveInventoryItem(id){const payload={name:$('ii_name').value.trim(),category:$('ii_cat').value.trim(),unit:$('ii_unit').value.trim()||'개',active:$('ii_active').value==='true'};if(!payload.name)return toast('품목명을 입력해주세요.');try{const q=id?db.from('inventory_items').update(payload).eq('id',id):db.from('inventory_items').insert(payload);const {error}=await q;if(error)throw error;toast('재고품목이 저장되었습니다.');closeModal();await init();route('inventory')}catch(e){toast('재고품목 저장 실패: '+(e.message||e))}}
function renderInventory(){ $('page').innerHTML=`<div class="top"><div><h1>재고관리</h1><div class="muted">수량 칸 오른쪽 위 +, 아래 − 버튼을 누르면 1개씩 즉시 저장됩니다. 직접 입력한 숫자는 저장 또는 Enter로 반영됩니다. 변경 이력은 자동 기록됩니다.</div></div><div class="toolbar"><button class="btn secondary" onclick="openInventoryItem()">+ 재고품목 추가</button></div></div><div class="panel"><div class="tablewrap"><table class="table"><thead><tr><th>품목</th><th>구분</th><th>현재재고</th><th>단위</th><th>관리</th></tr></thead><tbody>${state.items.length?state.items.map(i=>`<tr><td><div class="stock-inline"><b>${esc(i.name)}</b><label class="mini" for="stock-qty-${i.id}">재고</label><span class="stock-qty-control"><input class="stock-qty-input" id="stock-qty-${i.id}" type="number" inputmode="decimal" min="0" step="0.001" value="${Number(i.current_qty??0)}" aria-label="${esc(i.name)} 재고 수량" onkeydown="if(event.key==='Enter'){event.preventDefault();saveInlineInventory('${i.id}')}"><span class="stock-step-stack"><button class="stock-step-btn" type="button" id="stock-plus-${i.id}" aria-label="${esc(i.name)} 수량 1 증가 및 즉시 저장" onclick="stepInlineInventory('${i.id}',1)">+</button><button class="stock-step-btn" type="button" id="stock-minus-${i.id}" aria-label="${esc(i.name)} 수량 1 감소 및 즉시 저장" onclick="stepInlineInventory('${i.id}',-1)">−</button></span></span><button class="btn primary" id="stock-save-${i.id}" onclick="saveInlineInventory('${i.id}')">저장</button></div></td><td>${esc(i.category||'')}</td><td class="qty ${Number(i.current_qty)<0?'dangertext':''}">${fmt(i.current_qty)}</td><td>${esc(i.unit||'')}</td><td><button class="btn light" onclick="openInventoryItem('${i.id}')">수정</button></td></tr>`).join(''):`<tr><td colspan="5"><div class="empty">재고품목이 없습니다.</div></td></tr>`}</tbody></table></div></div><div class="panel"><h2 style="margin:0">최근 재고이력</h2><div class="tablewrap"><table class="table"><thead><tr><th>일시</th><th>품목</th><th>수량</th><th>구분</th><th>사유</th></tr></thead><tbody>${state.movements.slice(0,50).map(m=>{const i=state.items.find(x=>x.id===m.inventory_item_id);return `<tr><td>${dateStr(m.created_at)}</td><td>${esc(i?.name||m.inventory_item_id)}</td><td class="${Number(m.delta)<0?'dangertext':'green'}">${Number(m.delta)>0?'+':''}${fmt(m.delta)}</td><td>${esc(m.tx_type||'')}</td><td>${esc(m.reason||'')}</td></tr>`}).join('')}</tbody></table></div></div>`}

async function stepInlineInventory(id,step){
  const field=$('stock-qty-'+id);
  if(!field||field.disabled||stockSaving.has(id))return;
  const value=Number(field.value);
  if(field.value.trim()===''||!Number.isFinite(value)||value<0)return toast('재고 수량을 먼저 확인해주세요.');
  const next=Math.round((value+step)*1000)/1000;
  if(next<0)return toast('재고 수량은 0 미만으로 줄일 수 없습니다.');
  const previous=field.value;
  field.value=String(next);
  const plus=$('stock-plus-'+id),minus=$('stock-minus-'+id);
  if(plus)plus.disabled=true;
  if(minus)minus.disabled=true;
  try{const saved=await saveInlineInventory(id);if(!saved&&field.isConnected)field.value=previous;}finally{
    if(field.isConnected && !stockSaving.has(id)){
      if(plus)plus.disabled=false;
      if(minus)minus.disabled=false;
    }
  }
}

const stockSaving = new Set();
async function saveInlineInventory(id) {
  const item=state.items.find(i=>i.id===id);
  const field=$('stock-qty-'+id),button=$('stock-save-'+id);
  if(!item||!field||stockSaving.has(id))return;
  const raw=field.value.trim(),target=Number(raw),original=Number(item.current_qty??0);
  if(!raw||!Number.isFinite(target)||target<0||Math.abs(target-Math.round(target*1000)/1000)>1e-9){
    toast('재고 수량은 0 이상의 숫자로 소수점 셋째 자리까지 입력해주세요.');return;
  }
  if(Math.abs(original-target)<1e-9){toast('기존 재고와 같은 수량입니다.');return;}
  stockSaving.add(id);
  field.disabled=true;button.disabled=true;button.textContent='저장 중';
  try {
    const {data:latest,error:readError}=await db.from('inventory_items').select('current_qty').eq('id',id).single();
    if(readError)throw readError;
    if(Math.abs(Number(latest.current_qty??0)-original)>1e-9){
      throw new Error('다른 작업에서 재고가 변경됐습니다. 재고관리 화면을 새로고침한 후 다시 입력해주세요.');
    }
    const delta=Math.round((target-original)*1000)/1000;
    const {error}=await db.rpc('record_inventory_movement',{
      p_inventory_item_id:id,p_delta:delta,p_tx_type:'재고조정',
      p_reason:'재고관리 직접 입력 ('+original+' → '+target+')',
      p_lot:'',p_expiry:null
    });
    if(error)throw error;
    await loadAll();
    renderInventory();
    toast('재고가 '+fmt(target)+' '+(item.unit||'')+'(으)로 변경됐습니다.');
    return true;
  }catch(e){
    toast('재고 저장 실패: '+(e.message||e));
    return false;
  }finally{
    stockSaving.delete(id);
    if(field.isConnected)field.disabled=false;
    if(button.isConnected){button.disabled=false;button.textContent='저장';}
  }
}

function openMovement(itemId,sign){openModal(`<div class="between"><h2 style="margin:0">재고 ${sign===-1?'차감':'추가'}</h2><button class="btn light" onclick="closeModal()">닫기</button></div><div class="formgrid" style="margin-top:16px"><div class="field"><label>품목</label><select id="m_item">${itemOptions()}</select></div><div class="field"><label>수량</label><input id="m_qty" type="number" min="0.001" step="0.001" value="1"></div><div class="field"><label>구분</label><select id="m_type"><option>재고조정</option><option>구매입고</option><option>폐기</option><option>샘플사용</option><option>반품</option><option>기타</option></select></div><div class="field"><label>사유</label><input id="m_reason" placeholder="예: 실사차이 / 파손 / 구매입고"></div><div class="field"><label>LOT</label><input id="m_lot"></div><div class="field"><label>유통기한</label><input id="m_exp" type="date"></div></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn primary" onclick="saveMovement(${sign===-1?-1:1})">저장</button></div>`);if(itemId)$('m_item').value=itemId}
async function saveMovement(sign){const item=$('m_item').value,qty=Number($('m_qty').value||0);if(!item||qty<=0)return toast('품목과 수량을 확인해주세요.');try{const {error}=await db.rpc('record_inventory_movement',{p_inventory_item_id:item,p_delta:sign*qty,p_tx_type:$('m_type').value,p_reason:$('m_reason').value.trim(),p_lot:$('m_lot').value.trim(),p_expiry:$('m_exp').value||null});if(error)throw error;toast('재고가 반영되었습니다.');closeModal();await init();route('inventory')}catch(e){toast('재고 처리 실패: '+(e.message||e))}}
