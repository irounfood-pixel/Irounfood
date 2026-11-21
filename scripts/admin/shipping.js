const parcelFields=[['ice_small','아이스 소'],['ice_medium','아이스 중'],['ice_large','아이스 대'],['paper_medium','종이 중'],['paper_large','종이 대']];
const parcelBusy=new Set();
function isMLParcelOrder(order){
 return orderPartnerType(order)==='ML';
}
function parcelOrders(details=window.__parcelDetails||{}){
 const today=koreaDay();
 return (state.orders||[]).filter(isParcelEligible)
  .filter(o=>String(o.ship_date)>=today||!String(details[o.id]?.tracking_numbers||'').trim())
  .filter(o=>matchesWork(o,workFilters[state.page],details))
  .filter(o=>state.page==='mlparcel'?isMLParcelOrder(o):!isMLParcelOrder(o))
  .slice().sort((a,b)=>{
   const pastOrder=Number(String(b.ship_date)<today)-Number(String(a.ship_date)<today);
   const dateOrder=String(a.ship_date).localeCompare(String(b.ship_date));
   const aTracked=Boolean(String(details[a.id]?.tracking_numbers||'').trim());
   const bTracked=Boolean(String(details[b.id]?.tracking_numbers||'').trim());
   return pastOrder||dateOrder||Number(aTracked)-Number(bTracked)||
    String(a.order_no||'').localeCompare(String(b.order_no||''));
  });
}

function reorderParcelRows(){
 if(!['parcel','mlparcel'].includes(state.page))return;
 const visible=new Set(parcelOrders().map(o=>o.id));
 if($('parcel-visible-count'))$('parcel-visible-count').textContent='('+visible.size+'건)';
 document.querySelectorAll('.parcel-table tbody tr').forEach(row=>{const b=row.querySelector('[id^="parcel-save-"]');if(b&&!visible.has(b.dataset.id))row.remove();});
 for(const order of parcelOrders()){
  const row=$('parcel-save-'+order.id)?.closest('tr');
  const body=row?.parentElement;
  if(body?.matches('.parcel-table tbody'))body.appendChild(row);
 }
}

async function renderParcelEditor(){
 const page=$('page');
 page.innerHTML='<div class="top"><h1>송장·포장박스</h1></div><div class="panel">출고정보를 불러오는 중입니다.</div>';
 const {data,error}=await readPaged(()=>db.from('order_shipping_details').select('*').order('order_id'));
 if(!page.isConnected||!['parcel','mlparcel'].includes(state.page))return;
 if(error){page.innerHTML='<div class="panel dangertext">'+esc(error.message)+'</div>';return}
 const detail=Object.fromEntries((data||[]).map(x=>[x.order_id,x]));
 const orders=parcelOrders(detail);
 window.__parcelDetails=detail;
 const heads='<th>포장박스 수량</th>';
 const parcelRow=o=>{
  const d=detail[o.id]||{};
  const boxes=parcelFields.map(([key,label])=>'<label class="parcel-box-field"><span>'+esc(label)+'</span><div class="parcel-number-control"><input class="parcel-qty-input" type="number" inputmode="numeric" min="0" max="1000" step="1" id="parcel-'+key+'-'+o.id+'" aria-label="'+esc(o.order_no+' '+label)+'" value="'+esc(d[key]??0)+'"><span class="parcel-step-stack"><button type="button" class="parcel-step-btn" data-id="'+o.id+'" data-key="'+key+'" aria-label="'+esc(o.order_no+' '+label+' 1개 증가')+'" onclick="stepParcelBox(this.dataset.id,this.dataset.key,1)">+</button><button type="button" class="parcel-step-btn" data-id="'+o.id+'" data-key="'+key+'" aria-label="'+esc(o.order_no+' '+label+' 1개 감소')+'" onclick="stepParcelBox(this.dataset.id,this.dataset.key,-1)">−</button></span></div></label>').join('');
  return '<tr><td><div class="parcel-order-number"><b>'+esc(o.order_no)+'</b><button type="button" class="parcel-detail-btn" data-id="'+o.id+'" aria-label="'+esc(o.order_no)+' 주문 상세보기" onclick="openParcelOrderDetail(this.dataset.id)">상세</button><button type="button" class="parcel-photo-btn" data-id="'+o.id+'" title="송장 입력 전에도 사진 첨부 가능" aria-label="'+esc(o.order_no)+' 주문 사진 첨부" onclick="openOrderPhotoManager(this.dataset.id)">사진 +</button><span class="parcel-photo-count" id="parcel-photo-count-'+o.id+'" aria-label="첨부사진 수">확인 중</span></div><div class="mini">'+esc(o.ship_date||'')+'</div></td><td class="parcel-address"><b>'+esc(o.manager_name||'수령인 미입력')+'</b><div class="mini">'+esc(o.customer_name||'')+'</div><div>'+esc(o.address||'미입력')+'</div></td><td class="parcel-products">'+(o.order_items||[]).map(i=>'<div>'+esc(i.product_name_snapshot||i.kit_name||'상품명 없음')+' <b>× '+fmt(i.quantity)+'</b></div>').join('')+'</td>'
   +'<td><div class="parcel-track-save"><input class="parcel-track-input" id="parcel-track-'+o.id+'" aria-label="'+esc(o.order_no+' 송장번호')+'" placeholder="쉼표로 여러 개 입력" maxlength="1000" value="'+esc(d.tracking_numbers||'')+'"><button class="btn primary" id="parcel-save-'+o.id+'" data-id="'+o.id+'" onclick="saveInlineParcel(this.dataset.id)">저장</button></div></td>'
   +'<td><div class="parcel-box-grid">'+boxes+'</div></td></tr>';
 };
 const section=(title,group)=>'<section class="panel"><h2>'+title+' <span class="muted" id="parcel-visible-count">('+group.length+'건)</span></h2>'
  +'<div class="tablewrap"><table class="table parcel-table"><thead><tr><th>주문 · 발송일</th><th>수령인 · 배송지</th><th>상품 · 수량</th><th>송장번호</th>'+heads+'</tr></thead><tbody>'
  +(group.map(parcelRow).join('')||'<tr><td colspan="5"><div class="empty">주문이 없습니다.</div></td></tr>')+'</tbody></table></div></section>';
 page.innerHTML='<div class="top"><div><h1>'+ (state.page==='mlparcel'?'ML 송장·포장박스':'송장·포장박스') +'</h1><div class="muted">'+(state.page==='mlparcel'?'ML 주문만 표시합니다.':'일반 택배·기타 거래처 주문을 표시합니다. ML 주문은 별도 메뉴에서 확인하세요.')+' 2026-11-02 발송분부터 택배 주문만 관리합니다. 지난 날짜의 송장 미입력 건을 맨 위에 표시하고, 오늘·예정 주문은 가까운 날짜순으로 표시합니다.</div></div><div class="toolbar"><button class="btn secondary" onclick="renderParcelEditor()">새로고침</button><button class="btn primary" id="parcel-export-xlsx" onclick="exportParcelDetails()">사진 포함 엑셀 다운로드</button></div></div>'
  +'<p class="muted">송장·박스 변경 후 해당 행의 저장을 누르세요. 박스 수량은 + / − 버튼으로 조절하며 여러 송장번호는 쉼표(,)로 구분합니다.</p>'
  +workFilterBar(state.page)+section(state.page==='mlparcel'?'ML 거래처 송장·포장박스':'일반 택배·기타 거래처 송장·포장박스',orders);
 if(orders.length)void refreshParcelPhotoCounts(orders);
}


function openParcelOrderDetail(id){
 const o=state.orders.find(item=>item.id===id);
 if(!o)return toast('주문을 찾을 수 없습니다.');
 const d=window.__parcelDetails?.[id]||{};
 const items=Array.isArray(o.order_items)?o.order_items:[];
 const fields=[
  ['주문일',o.order_date],['발송일',o.ship_date],
  ['주문자/기관',o.customer_name],['담당자/수령인',o.manager_name||o.customer_name],
  ['연락처',o.contact],['배송지',o.address],['수령방법',o.receive_method],
  ['거래처',orderPartnerType(o)],['주문경로',o.order_source],['주문상태',o.order_status],['결제상태',o.payment_status]
 ];
 const values=fields.map(([label,value])=>'<div><b>'+esc(label)+'</b><div style="margin-top:5px;overflow-wrap:anywhere">'+esc(value||'-')+'</div></div>').join('');
 const itemRows=items.length?items.map(item=>
  '<tr><td>'+esc(item.product_name_snapshot||item.kit_name||'상품명 없음')+'</td><td class="right">'+fmt(item.quantity)+'개</td></tr>'
 ).join(''):'<tr><td colspan="2" class="muted">등록된 상품이 없습니다.</td></tr>';
 const boxes=parcelFields.map(([key,label])=>'<div><span class="muted">'+esc(label)+'</span> <b>'+fmt(d[key]??0)+'</b></div>').join('');
 openModal(
  '<div class="between"><div><h2 style="margin:0">주문 '+esc(o.order_no||'')+' 상세</h2><div class="muted">주문 상세정보 · 아래 주문 수정 버튼에서 변경할 수 있습니다.</div></div><button type="button" class="btn light" onclick="closeModal()">닫기</button></div>'
  +'<div class="panel" style="margin-top:14px"><h3 style="margin:0 0 13px">주문 기본정보</h3><div class="formgrid">'+values+'</div>'
  +'<div style="margin-top:15px"><b>요청사항</b><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 0">'+esc(o.note||'없음')+'</p></div></div>'
  +'<div class="panel"><h3 style="margin-top:0">주문 상품</h3><div class="tablewrap"><table class="table" style="min-width:0"><thead><tr><th>상품명</th><th class="right">수량</th></tr></thead><tbody>'+itemRows+'</tbody></table></div></div>'
  +'<div class="panel"><h3 style="margin:0 0 10px">저장된 송장·포장정보</h3><div class="field"><label>송장번호</label><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(d.tracking_numbers||'미등록')+'</div></div><div class="toolbar" style="margin-top:12px">'+boxes+'</div></div>'
  +'<div class="toolbar" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn light" data-id="'+esc(o.id)+'" onclick="openOrderDocumentChooser(this.dataset.id)">명세표 출력</button></div>'
  +(canEditOrder(o)?'<div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" data-id="'+esc(o.id)+'" onclick="openEditOrder(this.dataset.id)">주문 수정</button></div>':'')
 );
}

async function refreshParcelPhotoCounts(orders=photoExportOrders()){
 if(!['parcel','mlparcel'].includes(state.page)||!orders.length)return;
 const ids=orders.map(o=>o.id);
 const countMap=new Map(ids.map(id=>[id,0]));
 try{
  for(let i=0;i<ids.length;i+=50){
   const batch=ids.slice(i,i+50);
   for(let page=0;;page++){
    const {data,error}=await db.from('order_photos').select('order_id').in('order_id',batch).range(page*500,page*500+499);
    if(error)throw error;
    for(const photo of data||[])countMap.set(photo.order_id,(countMap.get(photo.order_id)||0)+1);
    if(!data||data.length<500)break;
   }
  }
  if(!['parcel','mlparcel'].includes(state.page))return;
  for(const [id,n] of countMap){
   const label=$('parcel-photo-count-'+id);
   if(label)label.textContent=n+'장';
  }
 }catch(e){
  if(!['parcel','mlparcel'].includes(state.page))return;
  for(const id of ids){
   const label=$('parcel-photo-count-'+id);
   if(label)label.textContent='조회 실패';
  }
  toast('첨부사진 수 조회 실패: '+(e.message||e));
 }
}

function openOrderPhotoManager(id){
 const order=state.orders.find(o=>o.id===id);
 if(!order)return toast('주문을 찾을 수 없습니다.');
 activePhotoOrder=id;
 openModal('<div class="between"><div><h2 style="margin:0">주문 '+esc(order.order_no)+' 사진 첨부</h2><div class="muted">송장번호와 관계없이 사진을 등록할 수 있습니다.</div></div><button class="btn light" onclick="closeModal()">닫기</button></div>'
  +'<div class="panel" style="margin-top:14px"><div class="muted">JPG·PNG·WEBP · 최대 30장 · 자동 저용량 저장 · 휴대폰 원본 유지</div>'
  +'<div class="toolbar" style="margin-top:10px"><input id="orderPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" multiple onchange="queueOrderPhotos(this.dataset.id)" data-id="'+id+'" aria-label="주문 사진 선택">'
  +'<button class="btn secondary" id="orderPhotoUpload" data-id="'+id+'" onclick="uploadOrderPhotos(this.dataset.id)">사진 올리기</button></div>'
  +'<p id="photoProgress" class="mini" role="status"></p><div id="photoQueue" class="order-photo-grid"></div><button type="button" class="btn light" id="photoClear" data-id="'+id+'" onclick="clearPhotoQueue(this.dataset.id)">선택 취소</button>'
  +'<div id="orderPhotos" style="margin-top:12px">사진 목록을 불러오는 중입니다.</div></div>');
 renderPhotoQueue(id);loadOrderPhotos(id);
}

let photoExportBusy=false;
let excelJsScriptPromise=null;
// Only load the separate image-capable Excel engine when a user exports pictures.
function loadImageExcelEngine(){
 if(window.ExcelJS?.Workbook)return Promise.resolve(window.ExcelJS);
 if(excelJsScriptPromise)return excelJsScriptPromise;
 excelJsScriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  script.async=true;
  script.onload=()=>window.ExcelJS?.Workbook?resolve(window.ExcelJS):reject(new Error('사진 포함 엑셀 모듈을 불러오지 못했습니다.'));
  script.onerror=()=>reject(new Error('사진 포함 엑셀 모듈 연결에 실패했습니다. 인터넷 연결을 확인해주세요.'));
  document.head.appendChild(script);
 }).catch(e=>{excelJsScriptPromise=null;throw e});
 return excelJsScriptPromise;
}
function photoExportHeaders(){
 return ['주문번호','주문일','발송일','주문자/기관','수령인/담당자','연락처','배송지',
  '송장번호','아이스박스 소','아이스박스 중','아이스박스 대','종이박스 중','종이박스 대',
  '총 박스 수','주문상태','상품명 및 수량','요청사항','첨부사진 수'];
}
function photoExportOrders(){
 return parcelOrders();
}

async function loadOrderPhotosForExcel(orders){
 const result=[];
 const ids=orders.map(o=>o.id);
 for(let i=0;i<ids.length;i+=50){
  const group=ids.slice(i,i+50);
  for(let page=0;;page++){
   const {data,error}=await db.from('order_photos')
    .select('id,order_id,storage_path,original_name,created_at')
    .in('order_id',group).order('created_at',{ascending:true})
    .range(page*500,page*500+499);
   if(error)throw new Error('첨부사진 조회 실패: '+error.message);
   result.push(...(data||[]));
   if(result.length>200)throw new Error('첨부사진이 200장을 초과합니다. 전체 파일이 너무 커질 수 있어 현재는 다운로드를 중단합니다.');
   if(!data||data.length<500)break;
  }
 }
 return result.sort(IrounPhotoDrive.comparePhotos);
}
async function photoBlobToExcelImage(blob){
 const decoded=await createImageBitmap(blob);
 try{
  if(!decoded.width||!decoded.height)throw new Error('이미지 크기를 확인하지 못했습니다.');
  const ratio=Math.min(1,1200/decoded.width,1200/decoded.height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(decoded.width*ratio));
  canvas.height=Math.max(1,Math.round(decoded.height*ratio));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('이미지 변환을 사용할 수 없습니다.');
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(decoded,0,0,canvas.width,canvas.height);
  const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(
   v=>v?resolve(v):reject(new Error('이미지 JPEG 변환 실패')),'image/jpeg',0.84));
  const dataUrl=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(new Error('사진을 읽지 못했습니다.'));
   reader.readAsDataURL(jpeg);
  });
  return {dataUrl,width:canvas.width,height:canvas.height};
 }finally{if(typeof decoded.close==='function')decoded.close();}
}
async function exportParcelDetails(){
 if(photoExportBusy)return;
 const orders=photoExportOrders();
 if(!orders.length)return toast('다운로드할 주문 내역이 없습니다.');
 const button=$('parcel-export-xlsx');
 photoExportBusy=true;
 if(button){button.disabled=true;button.textContent='사진 포함 엑셀 생성 중';}
 try{
  const [ExcelJS,photos]=await Promise.all([loadImageExcelEngine(),loadOrderPhotosForExcel(orders)]);
  const details=window.__parcelDetails||{};
  const byOrder=new Map();
  for(const photo of photos){
   if(!byOrder.has(photo.order_id))byOrder.set(photo.order_id,[]);
   byOrder.get(photo.order_id).push(photo);
  }
  const workbook=new ExcelJS.Workbook();
  workbook.creator='이로운과자점';
  workbook.created=new Date();
  const summary=workbook.addWorksheet('송장포장박스');
  const headers=photoExportHeaders();
  summary.addRow(headers);
  const widths=[17,13,13,24,22,19,38,42,16,16,16,16,16,15,14,45,30,14];
  summary.columns=widths.map(w=>({width:w}));
  summary.views=[{state:'frozen',ySplit:1}];
  summary.autoFilter={from:'A1',to:'R1'};
  summary.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  summary.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF315C4A'}};
  for(const order of orders){
   const d=details[order.id]||{};
   const boxes=parcelFields.map(([key])=>Number(d[key]||0));
   const row=summary.addRow([
    String(order.order_no||''),String(order.order_date||''),String(order.ship_date||''),
    String(order.customer_name||''),String(order.manager_name||order.customer_name||''),
    String(order.contact||''),String(order.address||''),String(d.tracking_numbers||''),
    ...boxes,boxes.reduce((a,b)=>a+b,0),String(order.order_status||''),
    (order.order_items||[]).map(i=>
     String(i.product_name_snapshot||i.kit_name||'')+' × '+Number(i.quantity||0)).join(' / '),
    String(order.note||''),(byOrder.get(order.id)||[]).length
   ]);
   for(const col of [1,6,8]){const cell=row.getCell(col);cell.numFmt='@';cell.value=String(cell.value??'');}
   row.alignment={vertical:'middle'};
   row.height=25;
  }
  const photosSheet=workbook.addWorksheet('주문사진');
  photosSheet.columns=[
   {header:'주문번호',width:18},{header:'주문자/기관',width:26},
   {header:'배송일',width:16},{header:'파일명',width:35},
   {header:'사진 등록일',width:23},{header:'첨부 사진',width:33}
  ];
  photosSheet.views=[{state:'frozen',ySplit:1}];
  photosSheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  photosSheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF315C4A'}};
  const orderById=new Map(orders.map(o=>[o.id,o]));
  if(!photos.length){
   photosSheet.addRow(['등록된 주문 사진이 없습니다.']);
  }else{
   for(let i=0;i<photos.length;i++){
    const photo=photos[i],order=orderById.get(photo.order_id);
    if(!order)continue;
    if(button)button.textContent='사진 포함 중 ('+(i+1)+'/'+photos.length+')';
    let blob,downloadError;
    if(IrounPhotoDrive.isDrive(photo)){
     try{blob=await IrounPhotoDrive.read(db,photo);}catch(e){downloadError=e;}
    }else{
     ({data:blob,error:downloadError}=await db.storage.from(ORDER_PHOTO_BUCKET).download(photo.storage_path));
    }
    if(downloadError||!blob)throw new Error(
     '주문 '+order.order_no+' 사진 '+(photo.original_name||'')+'을(를) 가져오지 못했습니다: '+(downloadError?.message||'파일 없음'));
    const converted=await photoBlobToExcelImage(blob);
    const row=photosSheet.addRow([
     String(order.order_no||''),String(order.customer_name||''),
     String(order.ship_date||''),String(photo.original_name||''),
     String(photo.created_at||'').slice(0,19).replace('T',' '),''
    ]);
    row.getCell(1).numFmt='@';
    row.height=115;
    row.alignment={vertical:'middle'};
    const imageId=workbook.addImage({base64:converted.dataUrl,extension:'jpeg'});
    const ratio=Math.min(190/converted.width,145/converted.height,1);
    photosSheet.addImage(imageId,{
     tl:{col:5,row:row.number-1},
     ext:{width:converted.width*ratio,height:converted.height*ratio},
     editAs:'oneCell'
    });
   }
  }
  if(button)button.textContent='엑셀 파일 생성 중';
  const bytes=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([bytes],{
   type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const link=document.createElement('a');
  link.href=url;
  link.download='이로운과자점_송장포장박스_주문사진포함.xlsx';
  document.body.appendChild(link);
  link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  toast('주문 '+orders.length+'건, 첨부사진 '+photos.length+'장이 엑셀에 포함되었습니다.');
 }catch(e){
  toast('사진 포함 엑셀 다운로드 실패: '+(e.message||e));
 }finally{
  photoExportBusy=false;
  if(button?.isConnected){button.disabled=false;button.textContent='사진 포함 엑셀 다운로드';}
 }
}

function stepParcelBox(orderId,key,step){
 if(!parcelFields.some(([field])=>field===key)||parcelBusy.has(orderId))return;
 const field=$('parcel-'+key+'-'+orderId);
 if(!field)return;
 const raw=field.value.trim();
 if(!/^\d+$/.test(raw))return toast('박스 수량은 0~1000의 정수로 입력해주세요.');
 const value=Number(raw);
 if(!Number.isSafeInteger(value)||value<0||value>1000)return toast('박스 수량은 0~1000의 정수로 입력해주세요.');
 const next=value+step;
 if(next<0||next>1000)return toast('박스 수량은 0~1000개까지 입력할 수 있습니다.');
 field.value=String(next);
}
async function saveInlineParcel(id){
 if(parcelBusy.has(id))return;
 const order=state.orders.find(x=>x.id===id);
 if(!order)return toast('주문을 찾을 수 없습니다.');
 const track=$('parcel-track-'+id);
 const button=$('parcel-save-'+id);
 if(!track||!button)return;
 const tracking=track.value.trim();
 if(tracking.length>1000)return toast('송장번호는 1000자 이내로 입력해주세요.');
 const counts=[];
 for(const [key] of parcelFields){
  const input=$('parcel-'+key+'-'+id),raw=input?.value.trim()??'';
  if(!/^\d+$/.test(raw)||Number(raw)>1000)return toast('박스별 수량은 0~1000의 정수로 입력하세요.');
  counts.push(Number(raw));
 }
 const original=window.__parcelDetails?.[id]||null;
 if(original&&tracking===String(original.tracking_numbers||'')&&parcelFields.every(([k],i)=>counts[i]===Number(original[k]||0)))return toast('변경된 내용이 없습니다.');
 parcelBusy.add(id);button.disabled=true;button.textContent='저장 중';
 try{
  const {data:current,error:checkError}=await db.from('order_shipping_details').select('*').eq('order_id',id).maybeSingle();
  if(checkError)throw checkError;
  if((original?.updated_at||null)!==(current?.updated_at||null))throw new Error('다른 작업에서 출고정보가 변경됐습니다. 새로고침 후 다시 입력해주세요.');
  const {error}=await db.rpc('admin_save_order_shipping',{
   p_order_id:id,p_tracking:tracking,
   p_ice_small:counts[0],p_ice_medium:counts[1],p_ice_large:counts[2],
   p_paper_medium:counts[3],p_paper_large:counts[4]
  });
  if(error)throw error;
  const {data:updated,error:refreshError}=await db.from('order_shipping_details').select('*').eq('order_id',id).single();
  if(refreshError)throw refreshError;
  window.__parcelDetails[id]=updated;
  reorderParcelRows();
  toast('주문 '+order.order_no+' 송장·박스 저장 완료');
 }catch(e){toast('출고정보 저장 실패: '+(e.message||e))}
 finally{parcelBusy.delete(id);button.disabled=false;button.textContent='저장';}
}
