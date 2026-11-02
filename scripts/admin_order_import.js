let adminImport={version:0,orders:[],hash:'',duplicates:[],busy:false,saving:false};
function renderOrderUpload(){
 $('page').innerHTML=`<div class="top"><div><h1>엑셀 주문등록</h1><div class="muted">빈 양식 작성 → 파일 선택 → 미리보기 확인 → 주문 등록</div></div><button class="btn secondary" onclick="route('order')">직접 입력</button></div>
 <div class="panel"><div class="toolbar"><button class="btn secondary" onclick="downloadAdminOrderTemplate()">빈 양식 다운로드</button><label class="btn light">엑셀 파일 선택<input id="admin-import-file" aria-label="주문 엑셀 파일" type="file" accept=".xlsx,.xls" style="display:block;margin-top:8px"></label></div>
 <p class="muted">최대 500행 · 8MB. 같은 주문묶음번호는 한 주문으로 등록합니다. 번호가 비어 있으면 행마다 별도 주문입니다.<br>주문일이 비어 있으면 오늘, 수령방법이 비어 있으면 방문수령입니다. 같은 묶음은 날짜·고객·배송정보·요청사항을 동일하게 작성해 주세요.</p>
 <div id="admin-import-status" role="status" aria-live="polite"></div><div id="admin-import-preview"></div>
 <button id="admin-import-save" class="btn primary" disabled onclick="saveAdminOrderImport()">확인한 주문 등록</button></div>`;
 $('admin-import-file').onchange=e=>readAdminOrderImport(e.target.files[0]);
 renderAdminImportPreview();
}
function adminImportStatus(message){const el=$('admin-import-status');if(el)el.textContent=message;}
function downloadAdminOrderTemplate(){
 const h=IrounOrderImport.headers,ws=XLSX.utils.aoa_to_sheet([h,...Array.from({length:100},()=>h.map(()=>''))]);
 ws['!cols']=[16,15,15,24,20,22,50,16,26,12,45].map(wch=>({wch}));
 for(let r=1;r<=100;r++)for(const c of [0,1,2,5]){const key=XLSX.utils.encode_cell({r,c});ws[key]={t:'s',v:'',z:'@'};}
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'주문입력');
 const guide=[['항목','작성 방법'],['주문묶음번호','같은 주문의 상품행에 같은 번호(예: 1)를 입력. 비우면 행별 주문.'],['주문일','YYYY-MM-DD. 비우면 등록일.'],['발송일','YYYY-MM-DD. 필수.'],['고객/기관명 · 배송지','필수. 방문수령도 기존 주문등록과 동일하게 장소를 입력.'],['수령방법','택배 또는 방문수령. 비우면 방문수령.'],['연락처','앞자리 0이 유지되도록 문자로 입력.'],['상품명','상품목록 시트의 이름을 그대로 사용.'],['수량','1~1000 정수. 같은 주문의 동일 상품은 합산.'],['묶음 정보','같은 묶음의 주문일·발송일·고객·담당자/수령인·연락처·배송지·수령방법·요청사항은 동일하게 작성.'],['중복','이미 등록한 파일은 다시 등록되지 않음. 정상 재주문은 주문일 또는 요청사항으로 구분.'],['저장','관리자가 확인 후 주문접수/미결제로 등록. 이 단계에서는 재고를 차감하지 않음.']];
 const gs=XLSX.utils.aoa_to_sheet(guide);gs['!cols']=[28,100];XLSX.utils.book_append_sheet(wb,gs,'작성안내');
 const ps=XLSX.utils.aoa_to_sheet([['상품명'],...state.products.filter(p=>p.active!==false).map(p=>[p.name])]);ps['!cols']=[36];XLSX.utils.book_append_sheet(wb,ps,'상품목록');
 XLSX.writeFile(wb,'관리자_주문업로드_빈양식.xlsx');
}
function renderAdminImportPreview(){
 const panel=$('admin-import-preview'),save=$('admin-import-save');if(!panel||!save)return;
 save.disabled=true;panel.replaceChildren();
 if(adminImport.busy){adminImportStatus(adminImport.saving?'주문을 등록하고 있습니다. 화면을 닫지 마세요.':'파일과 기존 주문을 확인하고 있습니다.');return;}
 if(adminImport.error){adminImportStatus(adminImport.error);return;}
 if(adminImport.done){adminImportStatus(adminImport.done);return;}
 const orders=adminImport.orders;if(!orders.length){adminImportStatus('빈 양식에 주문을 작성한 뒤 파일을 선택해 주세요.');return;}
 adminImportStatus('상품 '+adminImport.rowCount+'행 → 주문 '+orders.length+'건 · 중복 의심 '+adminImport.duplicates.length+'건. 내용을 확인한 뒤 등록하세요.');
 panel.innerHTML=`<div class="tablewrap" style="max-height:440px;overflow:auto"><table class="table"><thead><tr><th>묶음 / 엑셀 행</th><th>주문일 / 발송일</th><th>고객 / 수령인</th><th>배송정보</th><th>상품·수량</th><th>중복 확인</th></tr></thead><tbody>${orders.map((g,i)=>{
 const d=adminImport.duplicates.find(x=>x.index===i);
 const warning=d?`<div>기존 주문: ${d.matches.map(x=>esc(x.order_no)).join(', ')||'없음'}${d.same_file_orders.length?'<br>파일 내 같은 주문: '+d.same_file_orders.map(n=>esc(orders[n-1]?.label||n)).join(', '):''}</div><label><input type="checkbox" data-import-confirm="${esc(d.token)}"> 별도 신규 주문으로 등록</label>`:'없음';
 return `<tr><td>${esc(g.label)}<br>${g.sourceRows.join(', ')}행</td><td>${esc(g.order_date)}<br>${esc(g.ship_date)}</td><td>${esc(g.customer_name)}<br>${esc(g.manager_name||'')}</td><td>${esc(g.receive_method)}<br>${esc(g.contact)}<br>${esc(g.address)}${g.note?'<br>요청: '+esc(g.note):''}</td><td>${g.items.map(p=>esc(p.name)+' × '+p.quantity).join('<br>')}</td><td>${warning}</td></tr>`;
 }).join('')}</tbody></table></div><p class="muted">중복 의심 건은 별도 신규 주문이 맞을 때만 체크하세요. 잘못된 행은 엑셀에서 고쳐 다시 선택해 주세요.</p>`;
 const update=()=>{save.disabled=adminImport.saving||[...panel.querySelectorAll('[data-import-confirm]')].some(x=>!x.checked);};
 panel.querySelectorAll('[data-import-confirm]').forEach(x=>x.onchange=update);update();
}
async function readAdminOrderImport(file){
 if(!file||adminImport.saving)return;
 const version=adminImport.version+1;adminImport={version,orders:[],hash:'',duplicates:[],busy:true,saving:false};renderAdminImportPreview();
 try{
  if(!/\.xlsx?$/i.test(file.name)||file.size>8*1024*1024)throw Error('8MB 이하의 .xlsx 또는 .xls 파일을 선택하세요.');
  const bytes=await file.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const wb=XLSX.read(bytes,{type:'array',cellDates:false,sheetRows:502});
  const sheet=wb.Sheets['주문입력']||wb.Sheets[wb.SheetNames[0]];
  if(sheet['!fullref']&&XLSX.utils.decode_range(sheet['!fullref']).e.r>501)throw Error('한 번에 최대 500행입니다. 파일을 나누어 주세요.');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
  matrix.slice(1).forEach(r=>{for(const i of [1,2])if(typeof r[i]==='number'){const d=XLSX.SSF.parse_date_code(r[i]);r[i]=d?d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'):'날짜 오류';}});
  const plan=IrounOrderImport.parse(matrix,state.products,koreaDay());
  if(plan.errors.length)throw Error(plan.errors.slice(0,30).join('\n')+(plan.errors.length>30?'\n외 '+(plan.errors.length-30)+'개 오류':''));
  const {data:result,error}=await db.rpc('import_admin_orders_v1',{p_file_hash:hash,p_orders:IrounOrderImport.payload(plan.orders),p_commit:false,p_confirmed:[]});
  if(error)throw error;if(!result?.ok)throw Error('주문 검증 결과를 확인할 수 없습니다.');
  if(version!==adminImport.version)return;
  adminImport={...adminImport,...plan,hash,duplicates:result.duplicates||[],done:result.already_imported?'이미 등록한 파일입니다. 같은 주문을 다시 만들지 않았습니다.':null};
 }catch(e){if(version===adminImport.version)adminImport.error=e.message||'파일을 읽지 못했습니다.';}
 finally{if(version===adminImport.version){adminImport.busy=false;renderAdminImportPreview();}}
}
async function saveAdminOrderImport(){
 if(adminImport.busy||adminImport.saving||adminImport.done||adminImport.error||!adminImport.orders.length)return;
 const confirmed=[...document.querySelectorAll('[data-import-confirm]:checked')].map(x=>x.dataset.importConfirm);
 if(adminImport.duplicates.some(x=>!confirmed.includes(x.token)))return;
 adminImport.saving=true;adminImport.busy=true;renderAdminImportPreview();if($('admin-import-file'))$('admin-import-file').disabled=true;
 try{
  const {data:result,error}=await db.rpc('import_admin_orders_v1',{p_file_hash:adminImport.hash,p_orders:IrounOrderImport.payload(adminImport.orders),p_commit:true,p_confirmed:confirmed});
  if(error)throw error;
  if(result?.already_imported)adminImport.done='이미 등록한 파일입니다. 같은 주문을 다시 만들지 않았습니다.';
  else if(result?.created){adminImport.done='주문 '+result.created+'건 등록 완료 · 주문현황에서 확인하세요.';toast(adminImport.done);await init();}
  else if(result?.ready){adminImport.duplicates=result.duplicates||[];toast('기존 주문이 변경되었습니다. 중복 의심 건을 다시 확인해 주세요.');}
  else throw Error('저장 결과를 확인하지 못했습니다. 같은 파일로 다시 확인하세요.');
 }catch(e){toast('등록 확인 필요: '+(e.message||e)+' 같은 파일로 다시 시도해도 중복 등록되지 않습니다.');}
 finally{adminImport.saving=false;adminImport.busy=false;if($('admin-import-file'))$('admin-import-file').disabled=false;renderAdminImportPreview();}
}
window.addEventListener('beforeunload',e=>{if(adminImport.saving){e.preventDefault();e.returnValue='';}});
