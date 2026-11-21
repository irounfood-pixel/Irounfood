/* 거래처별 Google Sheets 연동 — 관리자 검토 화면. 인증된 관리자만 RLS로 조회 가능 */
let partnerSelected=new Set();
function partnerIds(){return [...document.querySelectorAll('input[data-partner-id]:checked')].map(x=>x.dataset.partnerId)}

function mlProductKey(name){return String(name||'').normalize('NFKC').trim().replace(/^(?:\[\s*이로운(?:과자점|교육)?\s*\]\s*)+/,'').replace(/[\s"'‘’“”]/g,'').toLowerCase();}
function mlProductDistance(a,b){
 const row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const previous=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=previous;}}return row[b.length];
}
function mlProductCandidates(name,products=activeProducts()){
 const key=mlProductKey(name),exact=products.filter(p=>p.name===name);
 if(exact.length===1)return {match:exact[0],candidates:exact,kind:'exact'};
 const normalized=products.filter(p=>mlProductKey(p.name)===key);
 if(normalized.length===1)return {match:normalized[0],candidates:normalized,kind:'normalized'};
 if(normalized.length>1)return {match:null,candidates:normalized,kind:'ambiguous'};
 const candidates=key.length<2||key.length>200?[]:products.map(p=>({p,k:mlProductKey(p.name)}))
 .filter(x=>(key.match(/\d+/g)||[]).join('|')===(x.k.match(/\d+/g)||[]).join('|'))
 .map(x=>({...x,d:mlProductDistance(key,x.k)}))
 .filter(x=>x.d<=Math.min(2,Math.max(1,Math.floor(Math.max(key.length,x.k.length)*0.25))))
 .sort((a,b)=>a.d-b.d||a.p.name.localeCompare(b.p.name,'ko')).slice(0,3).map(x=>x.p);
 return {match:null,candidates,kind:'review'};
}
function mlProductSelector(r){
 if(r.partner_sheet_sources?.partner_name!=='ML')return esc(r.product_name);
 const result=mlProductCandidates(r.product_name),products=activeProducts(),suggested=new Set(result.candidates.map(p=>p.id));
 const sorted=[...result.candidates,...products.filter(p=>!suggested.has(p.id))];
 return '<div>'+esc(r.product_name)+'</div><select id="ml-product-'+esc(r.id)+'" aria-label="연결할 상품" style="max-width:240px;margin-top:5px"><option value="">상품 확인 후 선택</option>'
 +sorted.map(p=>'<option value="'+esc(p.id)+'" '+(result.match?.id===p.id?'selected':'')+'>'+esc(p.name)+(suggested.has(p.id)&&!result.match?' (추천)':'')+'</option>').join('')
 +'</select><div class="mini">'+(result.kind==='exact'?'상품 일치':result.kind==='normalized'?'브랜드·띄어쓰기 정리 후 일치':'상품 확인 필요 · 오타 후보는 직접 선택')+'</div>';
}

async function renderPartnerOrders(embedded=false){
 const target=embedded?$('partnerInline'):$('page');
 if(!target)return;
 target.innerHTML='<div class="top"><h1>거래처 주문 승인</h1></div><div class="panel">거래처에서 입력한 주문을 불러오는 중입니다.</div>';
 const {data,error}=await readPaged(()=>db.from('partner_order_rows')
  .select('id,sheet_id,source_row,order_date,ship_date,product_name,quantity,recipient,contact,address,note,status,approved_order_id,updated_at,partner_sheet_sources(partner_name)')
  .order('updated_at',{ascending:false}).order('id'));
 if(error){target.innerHTML='<div class="top"><h1>거래처 주문 승인</h1></div><div class="panel dangertext">'+esc(error.message)+'</div>';return}
 if(!target.isConnected)return;
 const rows=(data||[]).filter(r=>window.__approvalSource!=='ml'||r.partner_sheet_sources?.partner_name==='ML'), pending=rows.filter(r=>['등록','승인대기'].includes(r.status)).sort((a,b)=>String(a.ship_date||'9999').localeCompare(String(b.ship_date||'9999')));
 window.__partnerRows=rows; partnerSelected.clear();
 const table=pending.map(r=>'<tr><td><input type="checkbox" data-partner-id="'+esc(r.id)+'"></td><td>'+esc(r.partner_sheet_sources?.partner_name||'-')+'</td><td>'+esc(r.order_date)+'</td><td>'+esc(r.ship_date)+'</td><td>'+esc(r.recipient)+'</td><td>'+esc(r.contact)+'</td><td>'+mlProductSelector(r)+'</td><td>'+esc(r.quantity)+'</td><td>'+esc(r.address)+'</td><td>'+esc(r.note||'')+'</td><td><a class="btn light" target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/'+encodeURIComponent(r.sheet_id)+'/edit#range=A'+Number(r.source_row)+':H'+Number(r.source_row)+'">수정</a> <button class="btn danger" onclick="deleteRegisteredPartnerRow(\''+r.id+'\')">삭제</button></td></tr>').join('');
 target.innerHTML='<div class="top"><h2>Google Sheets 거래처 주문 승인</h2><button class="btn light" onclick="renderPartnerOrders('+embedded+')">새로고침</button></div>'
 +'<div class="panel '+(window.__approvalHistory?'hidden':'')+'"><b>승인대기 '+pending.length+'행</b><p class="muted">동일 거래처·주문일·발송일·수령인·연락처·주소의 상품 행만 함께 선택하세요. 동일 정보의 별도 주문은 구분하여 승인하세요.</p>'
 +'<div class="toolbar"><button class="btn primary" onclick="approveSelectedPartnerRows()">선택한 행을 한 주문으로 승인</button>'
 +'<button class="btn danger" onclick="rejectSelectedPartnerRows()">선택 반려</button></div>'
 +'<div class="tablewrap"><table class="table"><thead><tr><th>선택</th><th>거래처</th><th>주문일</th><th>발송일</th><th>수령인</th><th>연락처</th><th>상품</th><th>수량</th><th>배송지</th><th>요청</th><th>관리</th></tr></thead><tbody>'
 +(table||'<tr><td colspan="11" class="empty">현재 등록 주문이 없습니다.</td></tr>')+'</tbody></table></div></div>'
 +'<div class="panel '+(window.__approvalHistory?'':'hidden')+'"><b>승인 완료 / 반려 기록</b><p class="muted">ML 주문은 승인 상태에서 바로 수정·삭제할 수 있습니다.</p>'
 +'<div class="tablewrap"><table class="table"><thead><tr><th>상태</th><th>거래처</th><th>발송일</th><th>수령인</th><th>상품</th><th>운영 주문 ID</th><th>관리</th></tr></thead><tbody>'
 +(rows.filter(r=>r.status==='승인'||r.status==='반려').map(r=>'<tr><td>'+esc(r.status)+'</td><td>'+esc(r.partner_sheet_sources?.partner_name||'')+'</td><td>'+esc(r.ship_date)+'</td><td>'+esc(r.recipient)+'</td><td>'+esc(r.product_name)+'</td><td>'+esc(r.approved_order_id||'-')+'</td><td>'+(r.partner_sheet_sources?.partner_name==='ML'?'<button class="btn light" onclick="editMLPartnerRow(\''+r.id+'\')">수정</button> <button class="btn danger" onclick="deleteRegisteredPartnerRow(\''+r.id+'\')">삭제</button>':(r.status==='승인'&&r.approved_order_id?'<button class="btn light" onclick="revertPartnerApproval(\''+r.id+'\')">승인 취소 → 등록</button>':''))+'</td></tr>').join('')||'<tr><td colspan="7">처리 이력이 없습니다.</td></tr>')+'</tbody></table></div></div>';
}
async function approveSelectedPartnerRows(){
 const ids=partnerIds();if(!ids.length)return toast('승인할 상품 행을 선택해주세요.');
 const rows=(window.__partnerRows||[]).filter(r=>ids.includes(r.id));
 const key=r=>[r.sheet_id,r.order_date,r.ship_date,r.recipient,r.contact,r.address].join('|');
 if(new Set(rows.map(key)).size!==1)return toast('서로 다른 배송정보는 함께 승인할 수 없습니다.');
 if(!confirm(rows.length+'개 상품 행을 한 주문으로 승인할까요? 승인을 누르면 운영 주문이 생성됩니다.'))return;
 let approvalCall;
 if(rows.every(r=>r.partner_sheet_sources?.partner_name==='ML')){
  const matches=rows.map(r=>{
   const product=activeProducts().find(p=>String(p.id)===$('ml-product-'+r.id)?.value);
   return product?{row_id:r.id,expected:mlPartnerFields(r),updated_at:r.updated_at,product_name:product.name}:null;
  });
  if(matches.some(m=>!m))return toast('상품 확인이 필요한 행에서 연결할 상품을 선택해주세요.');
  const changes=matches.filter(m=>m.expected[2]!==m.product_name);
  if(changes.length&&!confirm('다음 상품으로 연결해 승인합니다.\n'+changes.map(m=>m.expected[2]+' → '+m.product_name).join('\n')))return;
  approvalCall=db.rpc('approve_ml_matched_rows',{p_matches:matches});
 }else approvalCall=db.rpc('approve_partner_sheet_rows',{p_row_ids:ids});
 const {data,error}=await approvalCall;
 if(error)return toast('승인 실패: '+error.message);
 toast('주문접수 등록 완료: '+data);await loadAll();await route(state.page);
}
async function rejectSelectedPartnerRows(){
 const ids=partnerIds();if(!ids.length)return toast('반려할 상품 행을 선택해주세요.');
 if(!confirm(ids.length+'개 행을 반려할까요? 반려한 행은 시트 자동 동기화로 다시 접수되지 않습니다.'))return;
 const {error}=await db.rpc('reject_partner_sheet_rows',{p_row_ids:ids});
 if(error)return toast('반려 실패: '+error.message);
 await renderPartnerOrders(state.page==='requests');toast('선택한 행을 반려했습니다.');
}

async function revertPartnerApproval(rowId){
 const row=(window.__partnerRows||[]).find(r=>r.id===rowId);
 if(!row||row.status!=='승인'||!row.approved_order_id)return toast('승인된 거래처 주문만 취소할 수 있습니다.');
 if(!confirm('이 주문의 승인을 취소할까요? 같은 주문에 연결된 상품도 모두 등록 상태로 되돌아갑니다. 출고완료는 취소할 수 없습니다.'))return;
 const {error}=await db.rpc('cancel_order_v2',{p_order_id:row.approved_order_id});
 if(error)return toast('승인 취소 실패: '+error.message);
 toast('승인이 취소되었습니다. 거래처 주문은 등록 상태로 돌아가며 시트 잠금은 다음 동기화에서 해제됩니다.');
 await loadAll();await renderPartnerOrders(state.page==='requests');
}
async function deleteRegisteredPartnerRow(rowId){
 const row=(window.__partnerRows||[]).find(r=>r.id===rowId);
 if(!row||!(['등록','승인대기','반려'].includes(row.status)||row.status==='승인'&&row.partner_sheet_sources?.partner_name==='ML'))return toast('삭제할 주문을 확인해 주세요.');
 if(!confirm('이 거래처 주문을 삭제할까요? 공유 시트의 해당 행도 다음 동기화에서 삭제되며 되돌릴 수 없습니다.'))return;
 const {error}=await db.rpc('admin_manage_partner_row',{p_row_id:rowId,p_action:'delete'});
 if(error)return toast('삭제 실패: '+error.message);
 toast('등록 주문을 삭제했습니다. 공유 시트는 다음 동기화에서 반영됩니다.');
 await renderPartnerOrders(state.page==='requests');
}
