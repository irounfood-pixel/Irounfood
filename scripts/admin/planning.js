function renderCalendar(){const now=window.__cal||new Date();const y=now.getFullYear(),m=now.getMonth();const first=new Date(y,m,1),last=new Date(y,m+1,0);const start=first.getDay();let cells='';for(let i=0;i<start;i++)cells+='<div class="day mutedday"></div>';for(let d=1;d<=last.getDate();d++){const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const os=state.orders.filter(o=>o.ship_date===ds&&o.order_status!=='취소');const totals=new Map();os.forEach(o=>(o.order_items||[]).forEach(i=>{const name=i.product_name_snapshot||i.kit_name||'상품명 미상';totals.set(name,(totals.get(name)||0)+Number(i.quantity||0))}));const summary=[...totals.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ko')).map(([name,qty])=>`<div class="mini">${esc(name)} ${fmt(qty)}개</div>`).join('');cells+=`<button type="button" class="day" style="text-align:left;width:100%;color:inherit;cursor:${os.length?'pointer':'default'}" ${os.length?`onclick="showCalendarDate('${ds}')"`: 'disabled'}><div class="n">${d}</div><div class="count">${os.length?os.length+'건 주문':''}</div>${summary}${os.length?'<div class="mini green" style="margin-top:5px">주문 내역 · 명세표</div>':''}</button>`} $('page').innerHTML=`<div class="top"><div><h1>발송캘린더</h1><div class="muted">배송일별 상품 수량 합계 · 취소 주문 제외</div></div><div class="toolbar"><button class="btn secondary" onclick="window.__cal=new Date(${y},${m-1},1);renderCalendar()">‹</button><b>${y}년 ${m+1}월</b><button class="btn secondary" onclick="window.__cal=new Date(${y},${m+1},1);renderCalendar()">›</button><button class="btn secondary" onclick="exportShippingSchedule('${y}-${String(m+1).padStart(2,'0')}')">이달 발송 엑셀</button><button class="btn light" onclick="route('prep')">준비량 보기</button></div></div><div class="calendar">${cells}</div>`}

function selectedPrepMonth(){return $('prep_month')?.value || new Date().toISOString().slice(0,7)}
function monthlyOrderRows(month){return orderRows().filter(r=>String(r.order.ship_date||'').startsWith(month)&&r.order.order_status!=='취소'&&r.order.order_status!=='출고완료')}
function prepSummary(month){
 const rows=monthlyOrderRows(month), byItem=new Map(), byProduct=new Map();
 for(const r of rows){
  const qty=Number(r.quantity||0), productName=r.product_name_snapshot||r.kit_name||'상품명 미상';
  const itemId=r.inventory_item_id_snapshot||null, deduction=Number(r.inventory_deduction_snapshot??1), required=qty*deduction;
  const pk=productName; const pr=byProduct.get(pk)||{상품명:productName,주문수량:0,재고연결: itemId?'연결':'미연결'};pr.주문수량+=qty;byProduct.set(pk,pr);
  const item=state.items.find(i=>i.id===itemId); const key=itemId||('unlinked:'+productName);
  const it=byItem.get(key)||{재고품목:item?.name||(itemId?'품목정보없음':`미연결 상품: ${productName}`),단위:item?.unit||'',필요수량:0,관련상품:new Set(),연결여부:itemId?'연결':'미연결'};
  it.필요수량+=required;it.관련상품.add(productName);byItem.set(key,it);
 }
 return {rows, products:[...byProduct.values()].sort((a,b)=>a.상품명.localeCompare(b.상품명,'ko')), items:[...byItem.values()].map(x=>({...x,관련상품:[...x.관련상품].join(', ')})).sort((a,b)=>a.재고품목.localeCompare(b.재고품목,'ko'))};
}
function renderMonthlyPrep(){
 const month=window.__prepMonth||new Date().toISOString().slice(0,7); const {rows,products,items}=prepSummary(month);
 $('page').innerHTML=`<div class="top"><div><h1>월별 준비량</h1><div class="muted">배송일 기준 · 취소 및 출고완료 주문 제외 · 아직 출고되지 않은 주문만 준비량에 반영합니다.</div></div><div class="toolbar"><input id="prep_month" type="month" value="${month}" onchange="window.__prepMonth=this.value;renderMonthlyPrep()"><button class="btn primary" onclick="exportMonthlyPrep()">월별 준비량 엑셀</button></div></div>
 <div class="grid3"><div class="stat"><div class="label">대상 주문상품 행</div><div class="num">${fmt(rows.length)}건</div></div><div class="stat"><div class="label">상품 종류</div><div class="num">${fmt(products.length)}종</div></div><div class="stat"><div class="label">재고품목 종류</div><div class="num">${fmt(items.length)}종</div></div></div>
 <div class="panel"><h2 style="margin-top:0">재고품목별 준비 필요량</h2><div class="muted">상품과 재고품목이 연결되지 않은 경우 별도 ‘미연결 상품’으로 표시됩니다. 실제 생산/포장 전 연결 설정을 확인하세요.</div><div class="tablewrap"><table class="table"><thead><tr><th>재고품목</th><th>필요수량</th><th>단위</th><th>연결여부</th><th>관련 상품</th></tr></thead><tbody>${items.length?items.map(i=>`<tr><td><b>${esc(i.재고품목)}</b></td><td class="qty">${fmt(i.필요수량)}</td><td>${esc(i.단위)}</td><td><span class="badge ${i.연결여부==='연결'?'good':'warn'}">${i.연결여부}</span></td><td>${esc(i.관련상품)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty">선택한 달에 발송 예정 주문이 없습니다.</div></td></tr>`}</tbody></table></div></div>
 <div class="panel"><h2 style="margin-top:0">상품별 주문수량</h2><div class="tablewrap"><table class="table"><thead><tr><th>상품명</th><th>주문수량</th><th>재고 연결</th></tr></thead><tbody>${products.length?products.map(p=>`<tr><td>${esc(p.상품명)}</td><td class="qty">${fmt(p.주문수량)}</td><td><span class="badge ${p.재고연결==='연결'?'good':'warn'}">${p.재고연결}</span></td></tr>`).join(''):`<tr><td colspan="3"><div class="empty">주문 데이터가 없습니다.</div></td></tr>`}</tbody></table></div></div>`;
}
function exportMonthlyPrep(){
 const month=selectedPrepMonth();const {rows,products,items}=prepSummary(month);
 const wb=XLSX.utils.book_new();
 const itemRows=items.map(x=>({'재고품목':x.재고품목,'필요수량':x.필요수량,'단위':x.단위,'연결여부':x.연결여부,'관련상품':x.관련상품}));
 const productRows=products.map(x=>({'상품명':x.상품명,'주문수량':x.주문수량,'재고연결':x.재고연결}));
 const detailRows=rows.map(r=>({'배송일':r.order.ship_date||'','주문번호':r.order.order_no||'','고객/기관':r.order.customer_name||'','상품명':r.product_name_snapshot||r.kit_name||'','주문수량':Number(r.quantity||0),'차감단위수량':Number(r.inventory_deduction_snapshot??1),'재고품목ID':r.inventory_item_id_snapshot||'','재고필요수량':Number(r.quantity||0)*Number(r.inventory_deduction_snapshot??1),'주문상태':r.order.order_status||''}));
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(itemRows),'재고품목별 준비량');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(productRows),'상품별 주문수량');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detailRows),'배송일별 상세');XLSX.writeFile(wb,`이로운과자점_${month}_월별준비량.xlsx`);
}
function exportShippingSchedule(month){
 const orders=state.orders.filter(o=>String(o.ship_date||'').startsWith(month)&&o.order_status!=='취소').sort((a,b)=>(a.ship_date||'').localeCompare(b.ship_date||'')||(a.customer_name||'').localeCompare(b.customer_name||'','ko'));
 const details=orders.map(o=>{const products=(o.order_items||[]).map(i=>`${i.product_name_snapshot||i.kit_name||'상품명 미상'} ${Number(i.quantity||0)}개`).join(' / ');return {'배송일':o.ship_date||'','주문번호':o.order_no||'','주문자/기관명':o.customer_name||'','담당자':o.manager_name||'','연락처':o.contact||'','배송지':o.address||'','수령방법':o.receive_method||'','주문상품 및 수량':products,'요청사항':o.note||'','주문상태':o.order_status||''}});
 const totals=new Map();orders.forEach(o=>(o.order_items||[]).forEach(i=>{const key=`${o.ship_date||''}\t${i.product_name_snapshot||i.kit_name||'상품명 미상'}`;const prev=totals.get(key)||{배송일:o.ship_date||'',상품명:i.product_name_snapshot||i.kit_name||'상품명 미상',합계수량:0};prev.합계수량+=Number(i.quantity||0);totals.set(key,prev)}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(details),'배송일별 주문자·상품');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([...totals.values()].sort((a,b)=>a.배송일.localeCompare(b.배송일)||a.상품명.localeCompare(b.상품명,'ko'))),'배송일별 상품합계');XLSX.writeFile(wb,`이로운과자점_${month}_배송일별주문상품.xlsx`);
}

function renderSettings(){ $('page').innerHTML=`<div class="top"><div><h1>설정</h1><div class="muted">현재 페이지의 운영 설정입니다.</div></div></div><div class="panel"><h2 style="margin-top:0">현재 운영 원칙</h2><div class="muted">주문 접수 자체는 재고를 차감하지 않습니다. 실제 출고완료 처리에서 재고가 차감됩니다. 재료·생산 재고는 별도 메뉴에서 관리하며, 생산계획 저장만으로 재고를 차감하지 않습니다.</div></div><div class="panel"><h2 style="margin-top:0">관리자 비밀번호</h2><div class="muted">관리자 인증은 Supabase Auth를 사용합니다. 관리자 계정은 Supabase Authentication에서 관리합니다.</div></div>`}
function openModal(html){$('modalBox').innerHTML=html;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden')}
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
