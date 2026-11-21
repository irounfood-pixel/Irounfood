async function renderDashboard(){
 const target=$('page'),version=routeVersion,today=koreaDay(),tom=koreaDay(1);
 const orders=state.orders.filter(o=>o.order_status!=='취소'),todayOrders=orders.filter(o=>o.ship_date===today);
 const unfinished=todayOrders.filter(isOpenOrder),late=orders.filter(o=>matchesWork(o,{overdue:true}));
 const failed=state.errors.some(x=>x.startsWith('주문:'));
 const card=(label,value,action,hint='')=>`<button type="button" class="stat work-card" onclick="${action}"><span class="label">${label}</span><span class="num">${value}</span><span class="muted">${hint}</span></button>`;
 target.innerHTML=`<div class="top"><div><h1>오늘 할 일</h1><div class="muted">${today} · 한국 시간 기준</div></div><button class="btn secondary" onclick="init()">새로고침</button></div>${errorBanner()}${!failed&&late.length?`<button class="btn danger" onclick="goWork('orders',{overdue:true})">발송일 지난 미출고 ${late.length}건 → 확인</button>`:''}<div class="grid3">
 ${card('1 · 주문승인',state.errors.some(x=>x.startsWith('고객주문신청:'))?'고객 조회 실패':'고객 '+state.requests.filter(r=>r.status==='신청').length+'건',"goApprovals()",'<span id="home-partner-count">거래처 확인 중…</span>')}
 ${card('2 · 오늘 발송',failed?'조회 실패':todayOrders.length+'건',"openCalendarDay('"+today+"')",'상품 수량 확인 · 명세표 출력')}
 ${card('3 · 오늘 출고처리 대기',failed?'조회 실패':unfinished.length+'건',"goWork('orders',{date:'"+today+"',open:true})",failed?'':('완료 '+todayOrders.filter(o=>o.order_status==='출고완료').length+'건 · 목록에서 출고처리'))}
 </div><div class="panel"><div class="between"><h2>오늘 송장 미입력</h2><span class="muted">오늘 미출고 택배 중 남은 작업</span></div><div id="home-shipping" class="toolbar">확인 중…</div></div><div class="grid3">
 ${card('내일 발송',failed?'조회 실패':orders.filter(o=>o.ship_date===tom).length+'건',"openCalendarDay('"+tom+"')",'내일 준비 물량 확인')}
 ${card('주문현황','전체 보기',"goWork('orders')",'검색 · 수정 · 출고처리')}
 ${card('새 주문','+ 주문등록',"route('order')",'기관·전화 주문 직접 등록')}
 </div>`;
 const [shipping,partner]=await Promise.all([loadShippingSummary(),db.from('partner_order_rows').select('id',{count:'exact',head:true}).in('status',['등록','승인대기']).then(r=>r,e=>({error:e}))]);
 if(state.page!=='dashboard'||routeVersion!==version)return;
 $('home-partner-count').textContent=partner.error?'거래처 조회 실패':('거래처 '+(partner.count||0)+'행 · 고객·ML 통합 확인');
 const missing=orders.filter(o=>isParcelEligible(o)&&matchesWork(o,{date:today,open:true,missing:true}));
 $('home-shipping').innerHTML=!shipping||failed?'<span class="dangertext">조회 실패 · 새로고침해 주세요.</span>':['parcel','mlparcel'].map(page=>`<button class="btn secondary" onclick="goWork('${page}',{date:'${today}',open:true,missing:true})">${page==='mlparcel'?'ML':'일반'} ${missing.filter(o=>isMLParcelOrder(o)===(page==='mlparcel')).length}건 → 송장 입력</button>`).join('');
}

function shippingList(day){const a=state.orders.filter(o=>o.ship_date===day&&o.order_status!=='취소');if(!a.length)return '<div class="empty">오늘 발송 주문이 없습니다.</div>';return '<div>'+a.slice(0,8).map(o=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(o.order_no)}</b> · ${esc(o.customer_name||o.address||'')}</div>`).join('')+'</div>'}
function inventoryWarnings(){const a=state.items.filter(i=>Number(i.current_qty)<=0);if(!a.length)return '<div class="empty">현재 재고가 0 이하인 품목이 없습니다.</div>';return a.slice(0,8).map(i=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(i.name)}</b> <span class="dangertext">${fmt(i.current_qty)} ${esc(i.unit||'')}</span></div>`).join('')}
function requestList(){const a=state.requests.filter(x=>x.status==='신청').slice(0,7);if(!a.length)return '<div class="empty">대기 중인 고객 주문신청이 없습니다.</div>';return a.map(x=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(x.customer_name)}</b> · ${esc(x.contact||'')} <span class="badge warn">신청</span></div>`).join('')}
function productOptions(onlyActive=true){return (onlyActive?activeProducts():state.products).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
function itemOptions(){return state.items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)} (${fmt(i.current_qty)} ${esc(i.unit||'')})</option>`).join('')}
function orderPartnerType(order){
 if(order.partner_type==='ML'||order.partner_type==='해당없음')return order.partner_type;
 // Only an authenticated, approved ML sheet relationship can classify a legacy row.
 // Customer names never grant partner visibility.
 return state.mlApprovedOrderIds?.has(String(order.id))?'ML':'미분류';
}
function partnerSelect(id,value=''){
 const selected=['해당없음','ML'].includes(value)?value:'';
 return '<div class="field"><label for="'+id+'">거래처 *</label><select id="'+id+'" required><option value=""'+(!selected?' selected':'')+'>거래처를 선택하세요</option>'+['해당없음','ML'].map(v=>'<option value="'+v+'"'+(v===selected?' selected':'')+'>'+v+'</option>').join('')+'</select><small class="muted">ML 주문은 ML을 선택하세요. 고객명으로 자동 분류하지 않습니다.</small></div>';
}
function renderOrderForm(){
 $('page').innerHTML=`<div class="top"><div><h1>주문등록</h1><div class="muted">기관 주문이나 관리자가 대신 접수하는 고객 주문을 등록합니다.</div></div><button class="btn secondary" onclick="route('orderupload')">엑셀 업로드</button></div>
 <div class="panel"><div class="formgrid3"><div class="field"><label>주문일</label><input id="o_date" type="date" value="${koreaDay()}"></div><div class="field"><label>기관/고객명 *</label><input id="o_customer" placeholder="예: ○○초등학교 / 홍길동"></div><div class="field"><label>담당자</label><input id="o_manager" placeholder="담당자"></div><div class="field"><label>연락처</label><input id="o_contact" placeholder="010-0000-0000"></div><div class="field"><label>배송일 *</label><input id="o_ship" type="date"></div>${partnerSelect('o_partner')}<div class="field"><label>주문경로</label><select id="o_source"><option>기관주문</option><option>온라인주문</option><option>기타</option></select></div><div class="field"><label>배송지 *</label><input id="o_address" placeholder="주소"></div><div class="field"><label>수령방법</label><select id="o_method"><option selected>방문수령</option><option>택배</option></select></div><div class="field"><label>요청사항</label><input id="o_note" placeholder="요청사항"></div></div>
 <div style="margin-top:18px"><div class="between"><h2 style="margin:0">상품</h2><button class="btn secondary" onclick="addOrderLine()">+ 상품 추가</button></div><div id="olines"></div></div>
 <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn primary" onclick="saveOrder()">주문 저장</button></div></div>`;
 addOrderLine();
}
function addOrderLine(){const w=$('olines');const d=document.createElement('div');d.className='kitrow';d.innerHTML=`<div class="field"><label>상품</label><select class="oline-product">${productOptions()}</select></div><div class="field"><label>수량</label><input class="oline-qty" type="number" min="1" value="1"></div><button class="btn danger" onclick="this.parentElement.remove()">×</button>`;w.appendChild(d)}
async function nextOrderNo(){const {data,error}=await db.rpc('next_order_no');if(error)throw error;return String(data)}
async function saveOrder(){
 const customer=$('o_customer').value.trim();
 const ship=$('o_ship').value;
 if(!['해당없음','ML'].includes($('o_partner').value))return toast('거래처를 해당없음 또는 ML로 선택해주세요.');
 if(!customer||!ship||!$('o_address').value.trim())return toast('고객/기관명, 배송일, 배송지는 입력해주세요.');
 const lines=[...document.querySelectorAll('#olines .kitrow')].map(r=>({
   product_id:r.querySelector('.oline-product').value,
   quantity:Number(r.querySelector('.oline-qty').value||0)
 })).filter(x=>Number.isInteger(x.quantity)&&x.quantity>0);
 if(!lines.length)return toast('상품 수량은 1개 이상의 정수로 입력해주세요.');
 try{
   const {data,error}=await db.rpc('create_admin_order_with_partner_v1',{
     p_order_date:$('o_date').value||null,
     p_customer_name:customer,
     p_partner_type:$('o_partner').value,
     p_manager_name:$('o_manager').value.trim()||null,
     p_contact:$('o_contact').value.trim()||null,
     p_ship_date:ship,
     p_order_source:$('o_source').value,
     p_address:$('o_address').value.trim(),
     p_receive_method:$('o_method').value,
     p_note:$('o_note').value.trim()||null,
     p_items:lines.map(x=>({product_id:x.product_id,quantity:x.quantity}))
   });
   if(error)throw error;
   if(!data)throw new Error('주문 생성 결과를 확인할 수 없습니다.');
   toast('주문이 저장되었습니다.');
   await init();
   route('orders');
 }catch(e){toast('저장 실패: '+(e.message||e))}
}
let ordersRenderRequest=0;
function visibleOrders(){const q=(window.__orderq||'').toLowerCase(),status=window.__orderStatus||'전체';return state.orders.filter(o=>isOpenOrder(o)&&(status==='전체'||(o.order_status||'주문접수')===status)&&matchesWork(o,workFilters.orders)&&(!q||JSON.stringify(o).toLowerCase().includes(q)));}
async function renderOrders(){
 const version=routeVersion,request=++ordersRenderRequest,rows=visibleOrders();
 $('page').innerHTML=`<div class="top"><div><h1>주문현황</h1><div class="muted">진행 중인 주문 ${rows.length}건 · 출고완료 처리 시 재고가 차감됩니다.</div></div><div class="toolbar"><button class="btn secondary" onclick="exportOrders()">현재 목록 엑셀</button><button class="btn secondary" onclick="route('orderupload')">엑셀 업로드</button><button class="btn primary" onclick="route('order')">+ 주문등록</button></div></div>${errorBanner()}${workFilterBar('orders')}<div class="toolbar"><input id="order-search" aria-label="주문 검색" placeholder="주문번호 / 기관 / 상품" value="${esc(window.__orderq||'')}" onchange="window.__orderq=this.value;renderOrders()"><select aria-label="주문 상태" onchange="window.__orderStatus=this.value;renderOrders()">${['전체','주문접수','준비중'].map(x=>`<option ${(window.__orderStatus||'전체')===x?'selected':''}>${x}</option>`).join('')}</select><button class="btn light" onclick="init()">새로고침</button></div><div class="panel"><div class="tablewrap"><table class="table"><thead><tr><th>발송일</th><th>주문번호 · 기관</th><th>상품 · 수량</th><th>상태</th><th>송장</th><th>작업</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.ship_date||'미지정')}</td><td><b>${esc(o.order_no)}</b><br>${esc(o.customer_name||'')}<br><span class="badge">${isMLParcelOrder(o)?'ML':esc(o.receive_method||'일반')}</span>${o.note?'<span class="badge warn">요청사항 있음</span>':''}</td><td>${(o.order_items||[]).map(i=>`${esc(i.product_name_snapshot||i.kit_name)} × ${fmt(i.quantity)}`).join('<br>')}</td><td>${esc(o.order_status||'주문접수')}</td><td id="order-track-${o.id}">${isParcelEligible(o)?'확인 중':'해당 없음'}</td><td><div class="toolbar"><button class="btn light" onclick="openOrder('${o.id}')">상세</button>${canEditOrder(o)?`<button class="btn secondary" onclick="openEditOrder('${o.id}')">수정</button>`:''}<button class="btn primary" onclick="shipOrder('${o.id}')">출고완료</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">해당 조건의 미출고 주문이 없습니다.</td></tr>'}</tbody></table></div></div>`;
 const ok=await loadShippingSummary();if(state.page!=='orders'||routeVersion!==version||request!==ordersRenderRequest)return;
 for(const o of rows){const el=$('order-track-'+o.id);if(el&&isParcelEligible(o))el.innerHTML=ok?`<button class="btn light" onclick="goWork('${isMLParcelOrder(o)?'mlparcel':'parcel'}',{id:'${o.id}'})">${String(window.__parcelDetails[o.id]?.tracking_numbers||'').trim()?'입력됨':'미입력'}</button>`:'조회 실패';}
}
function renderOrderProcessing(){return route('orders');}

function renderShippedOrders(){
 const rows=state.orders.filter(o=>o.order_status==='출고완료').sort((a,b)=>(b.ship_date||'').localeCompare(a.ship_date||'')||String(b.order_no||'').localeCompare(String(a.order_no||'')));
 const totalUnits=rows.reduce((sum,o)=>sum+(o.order_items||[]).reduce((n,i)=>n+Number(i.quantity||0),0),0);
 $('page').innerHTML=`<div class="top"><div><h1>출고완료</h1><div class="muted">출고 처리가 끝난 주문만 별도로 모아 확인하고 엑셀로 다운로드합니다.</div></div><div class="toolbar"><button class="btn secondary" onclick="init()">새로고침</button><button class="btn primary" onclick="exportShippedOrders()">출고완료 목록 다운로드</button></div></div>
 <div class="grid3">${stat('출고완료 주문',fmt(rows.length)+'건')}${stat('출고완료 상품수량',fmt(totalUnits)+'개')}${stat('선택 목록', '전체 기간')}</div>
 <div class="panel"><div class="tablewrap"><table class="table"><thead><tr><th>배송일</th><th>주문번호</th><th>주문자/기관</th><th>연락처</th><th>배송지</th><th>수령방법</th><th>상품 및 수량</th><th>상태</th><th>상세</th></tr></thead><tbody>${rows.length?rows.map(o=>`<tr><td>${esc(o.ship_date||'')}</td><td><b>${esc(o.order_no||'')}</b></td><td>${esc(o.customer_name||'')}</td><td>${esc(o.contact||'')}</td><td style="min-width:220px;white-space:normal;overflow-wrap:anywhere">${esc(o.address||'주소 정보 없음')}</td><td>${esc(o.receive_method||'')}</td><td>${(o.order_items||[]).map(i=>`${esc(i.product_name_snapshot||i.kit_name||'상품명 미상')} × ${fmt(i.quantity)}`).join('<br>')}</td><td><span class="badge good">출고완료</span></td><td><button class="btn light" onclick="openOrder('${o.id}')">상세</button></td></tr>`).join(''):`<tr><td colspan="9"><div class="empty">출고완료 처리된 주문이 없습니다.</div></td></tr>`}</tbody></table></div></div>`;
}
function exportShippedOrders(){
 const rows=orderRows().filter(r=>r.order.order_status==='출고완료').sort((a,b)=>(a.order.ship_date||'').localeCompare(b.order.ship_date||'')||String(a.order.order_no||'').localeCompare(String(b.order.order_no||''))).map(r=>({
  '배송일':r.order.ship_date||'','주문번호':r.order.order_no||'','주문일':r.order.order_date||'','주문자/기관명':r.order.customer_name||'','담당자':r.order.manager_name||'','연락처':r.order.contact||'','배송지':r.order.address||'','수령방법':r.order.receive_method||'','상품명':r.product_name_snapshot||r.kit_name||'','출고수량':Number(r.quantity||0),'주문상태':r.order.order_status||'','요청사항':r.order.note||''
 }));
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'출고완료 목록');
 XLSX.writeFile(wb,'이로운과자점_출고완료목록.xlsx');
}

function showCalendarDate(ds){const os=state.orders.filter(o=>o.ship_date===ds&&o.order_status!=='취소').sort((a,b)=>String(a.order_no||'').localeCompare(String(b.order_no||'')));const totals=new Map();os.forEach(o=>(o.order_items||[]).forEach(i=>{const name=i.product_name_snapshot||i.kit_name||'상품명 미상';totals.set(name,(totals.get(name)||0)+Number(i.quantity||0))}));const sum=[...totals.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ko')).map(([n,q])=>`<div>${esc(n)} <b>${fmt(q)}개</b></div>`).join('')||'<div class="empty">해당 날짜 주문이 없습니다.</div>';const detail=os.map(o=>`<tr><td>${esc(o.order_no||'')}</td><td>${esc(o.customer_name||'')}</td><td>${esc(o.address||'주소 정보 없음')}</td><td>${(o.order_items||[]).map(i=>`${esc(i.product_name_snapshot||i.kit_name)} × ${fmt(i.quantity)}`).join('<br>')}</td><td><span class="badge ${o.order_status==='출고완료'?'good':'warn'}">${esc(o.order_status||'주문접수')}</span></td><td><button class="btn primary" data-date="${esc(ds)}" data-order="${esc(o.id)}" onclick="printCalendarStatements(this.dataset.date,this.dataset.order)">명세표 출력</button><button class="btn light" onclick="closeModal();openOrder('${o.id}')">주문 상세</button></td></tr>`).join('');openModal(`<div class="between"><div><h2 style="margin:0">${esc(ds)} 주문 내역</h2><div class="muted">상품별 합계와 개별 주문을 함께 확인합니다.</div></div><button class="btn light" onclick="closeModal()">닫기</button></div><div class="toolbar" style="margin-top:16px"><button class="btn primary" data-date="${esc(ds)}" onclick="printCalendarStatements(this.dataset.date)">이날 명세표 전체 출력</button><span class="muted">가격 없이 상품명·수량·수령인·주소·연락처·요청사항 표시 · A4 주문별 새 페이지 · 긴 내용은 다음 장으로</span></div><div class="panel"><h3 style="margin-top:0">상품별 합계</h3>${sum}</div><div class="panel"><h3 style="margin-top:0">주문별 내역 (${os.length}건)</h3><div class="tablewrap"><table class="table"><thead><tr><th>주문번호</th><th>주문자/기관</th><th>배송지</th><th>상품·수량</th><th>상태</th><th>처리</th></tr></thead><tbody>${detail||'<tr><td colspan="6">주문 없음</td></tr>'}</tbody></table></div></div>`)}

function calendarStatementOrders(ds,orderId){
 return state.orders.filter(o=>o.ship_date===ds&&o.order_status!=='취소'&&!o.deleted_at&&(!orderId||String(o.id)===String(orderId)))
  .sort((a,b)=>String(a.order_no||'').localeCompare(String(b.order_no||'')));
}
function calendarStatementsHtml(ds,orders){
 const sheets=orders.map(o=>{
  const rows=(o.order_items||[]).map(i=>'<tr class="item-row"><td>'+esc(i.product_name_snapshot||i.kit_name||'상품명 미상')+'</td><td class="quantity">'+fmt(i.quantity)+'개</td></tr><tr class="material-row"><td colspan="2">'+IrounOrderMaterials.render(i,o.order_items||[])+'</td></tr>').join('');
  return '<section class="statement"><div class="statement-content"><h1>거래명세표</h1><div class="order-line"><span>발송일 <b>'+esc(ds)+'</b></span><span>주문번호 <b>'+esc(o.order_no||'-')+'</b></span></div><div class="meta"><div class="customer"><span class="label">주문자/기관</span><strong>'+esc(o.customer_name||'-')+'</strong></div><div><span class="label">수령인</span><b>'+esc(o.manager_name||'-')+'</b></div><div><span class="label">주소</span><span>'+esc(o.address||'-')+'</span></div><div><span class="label">연락처</span><b>'+esc(o.contact||'-')+'</b></div></div><table><colgroup><col style="width:78%"><col style="width:22%"></colgroup><thead><tr><th>상품명</th><th>수량</th></tr></thead><tbody>'+(rows||'<tr><td colspan="2">등록된 상품이 없습니다.</td></tr>')+'</tbody></table><div class="statement-note"><b>요청사항</b><div>'+esc(o.note||'-')+'</div></div></div>'+IrounOrderMaterials.renderPacking(o.order_items||[],{orderNo:o.order_no,customer:o.customer_name,shipDate:ds})+'</section>';
 });
 const pages=sheets.map(sheet=>'<div class="print-page">'+sheet+'</div>');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>'+esc(ds)+' 발송 거래명세표</title><style>'
  +"@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#e5e5e5;color:#000;font:16px/1.45 Arial,\"Noto Sans KR\",\"Malgun Gothic\",sans-serif}.controls{padding:14px;text-align:center;position:sticky;top:0;background:#fff;border-bottom:1px solid #999;z-index:1}.controls button{font:inherit;padding:9px 22px;cursor:pointer}.controls p{margin:6px 0 0;font-size:13px}.print-page{width:190mm;min-height:276mm;height:auto;margin:20px auto;background:#fff;display:block}.material-details{font-size:12px;line-height:1.5;font-weight:400;margin-top:5px}.material-missing{font-size:12px;font-weight:400;color:#555;margin-top:4px}.statement{padding:6mm 5mm;overflow:visible}.statement-content{overflow:visible}.statement-note{margin-top:9px;padding:8px 10px;border:1px solid #333;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.statement-note>b{display:block;margin-bottom:3px}h1{text-align:center;font-size:26px;letter-spacing:2px;margin:0 0 9px;line-height:1.2}.order-line{display:flex;justify-content:space-between;gap:10px;font-size:13px;border-bottom:2px solid #000;padding-bottom:7px;margin-bottom:8px;overflow-wrap:anywhere}.meta{display:grid;gap:5px;margin-bottom:10px;overflow-wrap:anywhere}.meta>div{display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;align-items:baseline}.label{font-size:13px;font-weight:700}.customer strong{font-size:20px;line-height:1.3}table{width:100%;border-collapse:collapse;table-layout:fixed;border:1.5px solid #000}th,td{border:1px solid #333;padding:8px 10px;overflow-wrap:anywhere}th{border-bottom:2px solid #000;text-align:left;font-size:15px}td:first-child{font-weight:600}.quantity{text-align:right;font-size:20px;font-weight:800;white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.item-row{break-after:avoid;page-break-after:avoid}.material-row td{font-weight:400;padding:5px 10px}.material-row .material-details,.material-row .material-missing{margin-top:0}@media print{body{background:#fff}.controls{display:none}.print-page{margin:0;min-height:0;height:auto;break-inside:auto;page-break-inside:auto;break-after:page;page-break-after:always}.statement,.statement-content{break-inside:auto;page-break-inside:auto}.print-page:last-child{break-after:auto;page-break-after:auto}}"
  +IrounOrderMaterials.packingCss+'</style></head><body><div class="controls"><button onclick="window.print()">인쇄 / PDF 저장</button><p>A4 세로 · 주문마다 새 페이지 · 긴 내용은 다음 장으로 이어집니다 · 배율 100%로 인쇄하세요.</p></div>'+pages.join('')+'</body></html>';
}
function printCalendarStatements(ds,orderId){
 const orders=calendarStatementOrders(ds,orderId);
 if(!orders.length)return toast('출력할 주문이 없습니다.');
 const popup=window.open('','_blank','width=960,height=800');
 if(!popup)return toast('팝업이 차단되었습니다. 팝업을 허용한 후 다시 눌러주세요.');
 popup.opener=null;
 popup.document.open();popup.document.write(calendarStatementsHtml(ds,orders));popup.document.close();
}

function canEditOrder(order){return order&&['주문접수','준비중'].includes(order.order_status);}
function openEditOrder(id){
 const o=state.orders.find(x=>x.id===id);
 if(!canEditOrder(o))return toast('출고 전 주문접수·준비중 주문만 수정할 수 있습니다.');
 window.__editingOrder={id:o.id,updated_at:o.updated_at,busy:false};
 const field=(label,id,value,type='text')=>'<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value||'')+'"></div>';
 openModal('<div class="between"><h2 style="margin:0">주문 '+esc(o.order_no)+' 수정</h2><button type="button" class="btn light" onclick="closeModal()">닫기</button></div>'
  +'<p class="muted">승인된 주문을 관리자가 수정합니다. 저장 시 재고는 차감되지 않습니다.</p><div class="formgrid">'
  +field('주문일','edit-order-date',o.order_date,'date')+field('기관/고객명 *','edit-order-customer',o.customer_name)
  +partnerSelect('edit-order-partner',orderPartnerType(o))
  +field('담당자/수령인','edit-order-manager',o.manager_name)+field('연락처','edit-order-contact',o.contact)
  +field('배송일 *','edit-order-ship',o.ship_date,'date')
  +'<div class="field"><label for="edit-order-method">수령방법</label><select id="edit-order-method"><option value="택배">택배</option><option value="방문수령">방문수령</option></select></div>'
  +field('배송지 *','edit-order-address',o.address)
  +'<div class="field"><label for="edit-order-note">요청사항</label><textarea id="edit-order-note">'+esc(o.note||'')+'</textarea></div></div>'
  +'<div class="between" style="margin:18px 0 10px"><h3 style="margin:0">상품·수량</h3><button type="button" class="btn secondary" onclick="addEditOrderLine()">+ 상품 추가</button></div><div id="edit-order-lines"></div>'
  +'<div class="toolbar" style="justify-content:flex-end;margin-top:16px"><button type="button" class="btn light" onclick="closeModal()">취소</button><button type="button" class="btn primary" id="edit-order-save" onclick="saveEditedOrder()">수정 저장</button></div>');
 $('edit-order-method').value=o.receive_method||'택배';
 for(const item of o.order_items||[])addEditOrderLine(item);
 if(!(o.order_items||[]).length)addEditOrderLine();
}
function addEditOrderLine(item=null){
 const host=$('edit-order-lines');if(!host)return;
 const row=document.createElement('div');row.className='kitrow';row.dataset.itemId=item?String(item.id):'';
 const selected=item?.product_id||'';
 let options=activeProducts().map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
 if(item&&!activeProducts().some(p=>p.id===selected))options='<option value="'+esc(selected)+'">'+esc(item.product_name_snapshot||item.kit_name||'기존 상품')+' (기존 주문)</option>'+options;
 row.innerHTML='<div class="field"><label>상품</label><select class="edit-order-product" aria-label="수정할 상품">'+options+'</select></div>'
  +'<div class="field"><label>수량</label><input class="edit-order-qty" aria-label="수정할 수량" type="number" min="1" max="1000" step="1" value="'+esc(item?.quantity??1)+'"></div>'
  +'<button type="button" class="btn danger" aria-label="주문 상품 행 삭제" onclick="this.parentElement.remove()">×</button>';
 host.appendChild(row);
 if(item)row.querySelector('.edit-order-product').value=selected;
}
async function saveEditedOrder(){
 const draft=window.__editingOrder;if(!draft||draft.busy)return;
 const fields={order_date:$('edit-order-date').value||null,customer_name:$('edit-order-customer').value.trim(),
  partner_type:$('edit-order-partner').value,
  manager_name:$('edit-order-manager').value.trim(),contact:$('edit-order-contact').value.trim(),
  ship_date:$('edit-order-ship').value,address:$('edit-order-address').value.trim(),
  receive_method:$('edit-order-method').value,note:$('edit-order-note').value.trim()};
 if(!['해당없음','ML'].includes(fields.partner_type))return toast('거래처를 해당없음 또는 ML로 선택해주세요.');
 if(!fields.customer_name||!fields.ship_date||!fields.address)return toast('고객/기관명, 배송일, 배송지는 입력해주세요.');
 const rows=[...document.querySelectorAll('#edit-order-lines .kitrow')];
 const items=rows.map(row=>({item_id:row.dataset.itemId||null,product_id:row.querySelector('.edit-order-product').value||null,
  quantity:Number(row.querySelector('.edit-order-qty').value)}));
 if(!items.length||items.length>100||items.some(i=>!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>1000||(!i.item_id&&!i.product_id)))
  return toast('상품을 선택하고 수량을 1~1000개의 정수로 입력해주세요.');
 const selectedNames=new Set();
 for(const item of items){
  const original=(state.orders.find(o=>o.id===draft.id)?.order_items||[]).find(i=>String(i.id)===String(item.item_id));
  const unchanged=original&&String(original.product_id||'')===String(item.product_id||'');
  const name=unchanged?original.kit_name:state.products.find(p=>String(p.id)===String(item.product_id))?.name;
  if(name&&selectedNames.has(name))return toast('같은 상품이 여러 줄에 선택되어 있습니다. 상품별로 한 줄만 남기고 수량을 합쳐주세요.');
  if(name)selectedNames.add(name);
 }
 const button=$('edit-order-save');draft.busy=true;button.disabled=true;button.textContent='저장 중';
 try{
  const {data,error}=await db.rpc('admin_update_order_v2',{p_order_id:draft.id,p_expected_updated_at:draft.updated_at,p_fields:fields,p_items:items});
  if(error)throw error;
  if(!data)throw new Error('주문 수정 결과를 확인할 수 없습니다.');
  if(window.__editingOrder===draft){closeModal();window.__editingOrder=null;}
  toast('주문 수정이 저장되었습니다.');await init();
 }catch(e){toast('주문 수정 실패: '+(e.message||e));}
 finally{draft.busy=false;if(button.isConnected){button.disabled=false;button.textContent='수정 저장';}}
}

function openOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;openModal(`<div class="between"><h2 style="margin:0">주문 ${esc(o.order_no)}</h2><button class="btn light" onclick="closeModal()">닫기</button></div><div class="panel" style="margin-top:14px"><div class="formgrid"><div><b>고객/기관</b><div>${esc(o.customer_name||'')}</div></div><div><b>연락처</b><div>${esc(o.contact||'')}</div></div><div><b>배송일</b><div>${esc(o.ship_date||'')}</div></div><div><b>배송지</b><div>${esc(o.address||'주소 정보 없음')}</div></div><div><b>거래처</b><div>${esc(orderPartnerType(o))}</div></div><div><b>주문경로</b><div>${esc(o.order_source||'')}</div></div><div><b>요청사항</b><div>${esc(o.note||'')}</div></div></div><div style="margin-top:16px"><b>상품</b>${(o.order_items||[]).map(i=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)">${esc(i.product_name_snapshot||i.kit_name)} × ${fmt(i.quantity)}</div>`).join('')}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn light" onclick="openOrderDocumentChooser('${o.id}')">명세표 출력</button> ${canEditOrder(o)?`<button class="btn secondary" onclick="openEditOrder('${o.id}')">주문 수정</button>`:''}${o.order_status!=='출고완료'&&o.order_status!=='취소'?`<button class="btn primary" onclick="shipOrder('${o.id}')">출고완료 처리</button>`:''}${o.order_status!=='출고완료'&&o.order_status!=='취소'?`<button class="btn danger" onclick="cancelOrder('${o.id}')">주문 취소</button>`:''}</div></div>`)}
