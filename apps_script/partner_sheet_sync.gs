/**
 * 이로운과자점 거래처 Google Sheets 자동 동기화 (관리자 소유 "독립형" Apps Script 전용).
 *
 * 이 파일을 거래처에 공유되는 시트에 바인딩하지 마세요.
 * Script Properties:
 *  EDGE_URL = https://<project>.supabase.co/functions/v1/partner-sheet-ingest
 *  SHEETS_CONFIG = [{"sheet_id":"<Google Sheet ID>","token":"<서버에 해시 등록한 비밀 토큰>"}]
 *
 * 초기 설치: installPartnerSheetTriggers() 를 관리자 계정에서 한 번 실행.
 * 모든 거래처 파일에 대해 onEdit + 5분 주기 보조 검사. 관리자 DB → 시트 I:O 일방향 갱신.
 * 운영 전환 전에는 테스트 프로젝트로만 연결하며, 기존 Apps Script 프로젝트를 유지해야 UID가 보존됩니다.
 * Apps Script 메뉴/엑셀 업로드 UI는 이 독립형 스크립트에 포함되지 않습니다.
 */
const ROW_KEY = 'IROUN_PARTNER_SOURCE_UID_V2';
function getPartnerConfigs_() {
 const raw=PropertiesService.getScriptProperties().getProperty('SHEETS_CONFIG');
 const arr=JSON.parse(raw||'[]');
 if(!Array.isArray(arr)||arr.some(c=>!c.sheet_id||!c.token||c.token.length<40)) {
   throw new Error('SHEETS_CONFIG 설정을 확인하세요.');
 }
 return arr;
}
function installPartnerSheetTriggers() {
 const configs=getPartnerConfigs_();
 const existing=ScriptApp.getProjectTriggers();
 existing.forEach(t=>{
  if(['onPartnerSheetEdit','syncAllPartnerSheets'].includes(t.getHandlerFunction()))
   ScriptApp.deleteTrigger(t);
 });
 configs.forEach(c=>ScriptApp.newTrigger('onPartnerSheetEdit')
   .forSpreadsheet(c.sheet_id).onEdit().create());
 ScriptApp.newTrigger('syncAllPartnerSheets').timeBased().everyMinutes(5).create();
 syncAllPartnerSheets();
}
function onPartnerSheetEdit(e) {
 if(!e||!e.source||!e.range||e.range.getSheet().getName()!=='주문입력'||e.range.getColumn()>8)return;
 const id=e.source.getId(), cfg=getPartnerConfigs_().find(c=>c.sheet_id===id);
 if(cfg)syncOnePartnerSheet_(cfg);
}
function syncAllPartnerSheets() {
 for(const c of getPartnerConfigs_()) {
  try {syncOnePartnerSheet_(c)} catch(e){console.error(c.sheet_id+': '+e);}
 }
}
function dateString_(value,ss) {
 if(value instanceof Date && !isNaN(value.getTime()))
  return Utilities.formatDate(value,ss.getSpreadsheetTimeZone()||'Asia/Seoul','yyyy-MM-dd');
 // Recognize text entered in Korean Google Sheets, including 2026. 11. 4.
 const m=String(value??'').trim().match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);
 if(!m)return '';
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 const check=new Date(Date.UTC(y,mo-1,d));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==mo||check.getUTCDate()!==d)return '';
 return [y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function numberString_(value) {return String(value===''?0:value).replace(/,/g,'').trim();}
function sourceUid_(sheet,row,used) {
 // Metadata requires a true whole-row range, not a rectangle with the same width.
 const target=sheet.getRange(row+':'+row);
 const found=target.getDeveloperMetadata().filter(m=>m.getKey()===ROW_KEY);
 let uid=found.length?String(found[0].getValue()):'';
 if(!/^[0-9a-f-]{36}$/i.test(uid)||used.has(uid)){
  found.forEach(m=>m.remove());
  uid=Utilities.getUuid();
  target.addDeveloperMetadata(ROW_KEY,uid,SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
 }
 used.add(uid);
 // Share only the non-secret UID with the separate ML portal project.
 // Existing IDs must survive migration; changing visibility never creates a new order.
 const current=target.getDeveloperMetadata().find(m=>m.getKey()===ROW_KEY&&m.getValue()===uid);
 if(current&&current.getVisibility()!==SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT)
  current.setVisibility(SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);
 return uid;
}
function syncOnePartnerSheet_(cfg) {
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(10000))return;
 try {
  const ss=SpreadsheetApp.openById(cfg.sheet_id);
  const sheet=ss.getSheetByName('주문입력');
  if(!sheet)throw new Error('주문입력 탭을 찾을 수 없습니다.');
  const last=sheet.getLastRow(), endpoint=PropertiesService.getScriptProperties().getProperty('EDGE_URL');
  if(!endpoint || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\//.test(endpoint))throw new Error('EDGE_URL을 확인하세요.');
  if(last<2)return;
  if(last>20000)throw new Error('주문 시트 행 수 초과');
  const values=sheet.getRange(2,1,last-1,8).getValues();
  const display=sheet.getRange(2,1,last-1,8).getDisplayValues();
  const used=new Set(),rows=[];
  for(let i=0;i<values.length;i++){
   const raw=values[i],text=display[i],rowNo=i+2;
   const orderDate=dateString_(raw[0],ss),shipDate=dateString_(raw[1],ss);
   const product=String(text[2]||'').trim(),qty=numberString_(text[3]);
   const recipient=String(text[4]||'').trim(),contact=String(text[5]||'').trim();
   const address=String(text[6]||'').trim();
   // 필수 필드가 모두 들어온 경우에만 승인 대기 등록
   const complete=/^\d{4}-\d{2}-\d{2}$/.test(orderDate)&&
      /^\d{4}-\d{2}-\d{2}$/.test(shipDate)&&product&&
      /^[0-9]{1,4}$/.test(qty)&&Number(qty)>0&&recipient&&contact&&address;
   // 관리자 전용 I:O는 절대 서버에 업로드하지 않습니다.
   if(!complete)continue;
   const uid=sourceUid_(sheet,rowNo,used);
   const obj={source_row:rowNo,source_uid:uid,order_date:orderDate,ship_date:shipDate,
    product_name:product,quantity:qty,recipient,contact,address,note:String(text[7]||'').trim()};
   rows.push(obj);
  }
  let result={status_rows:[]};
  // Edge Function limit: 500행/호출. 마지막 상태 응답은 모든 DB 행을 포함합니다.
  for(let i=0;i<rows.length;i+=400)result=postPartnerRows_(endpoint,cfg,rows.slice(i,i+400));
  if(!rows.length)result=postPartnerRows_(endpoint,cfg,[]);
  if(result.status_rows){
   // Remove only rows that were explicitly deleted via authenticated DB action.
   if(Array.isArray(result.deleted_uids))removeDeletedPartnerRows_(sheet,result.deleted_uids);
   writePartnerStatus_(ss,result.status_rows);
   writePartnerShipping_(ss,result.status_rows);
   protectPartnerSheet_(ss,result.status_rows);
  }
 }finally {lock.releaseLock();}
}
function postPartnerRows_(endpoint,cfg,rows) {
 const res=UrlFetchApp.fetch(endpoint,{
  method:'post',contentType:'application/json',
  headers:{Authorization:'Bearer '+cfg.token},
  payload:JSON.stringify({sheet_id:cfg.sheet_id,rows}),
  muteHttpExceptions:true
 });
 const body=JSON.parse(res.getContentText()||'{}');
 if(res.getResponseCode()!==200||!body.ok)throw new Error('연동 실패: HTTP '+res.getResponseCode()+' '+(body.error||''));
 return body;
}
function removeDeletedPartnerRows_(sheet,sourceUids) {
 const deleted=new Set(sourceUids.map(String));
 if(!deleted.size)return;
 for(let row=sheet.getLastRow();row>=2;row--){
  const meta=sheet.getRange(row+':'+row).getDeveloperMetadata();
  if(meta.some(m=>m.getKey()===ROW_KEY&&deleted.has(String(m.getValue())))){
   sheet.deleteRow(row);
  }
 }
}
function writePartnerStatus_(ss,states) {
 const sheet=ss.getSheetByName('접수현황');if(!sheet)return;
 const max=sheet.getMaxRows();
 if(max>1)sheet.getRange(2,1,max-1,5).clearContent();
 const out=states.slice(0,Math.max(max-1,0)).map(s=>[
  String(s.id||''),String(s.ship_date||''),String(s.recipient||''),
  String(s.status||''),String(s.updated_at||'')
 ]);
 if(out.length)sheet.getRange(2,1,out.length,5).setValues(out);
}


function writePartnerShipping_(ss,states) {
 const sheet=ss.getSheetByName('주문입력');
 if(!sheet)return;
 if(sheet.getMaxColumns()<15)sheet.insertColumnsAfter(sheet.getMaxColumns(),15-sheet.getMaxColumns());
 if(sheet.getRange('O1').getDisplayValue()!=='첨부사진 수')sheet.getRange('O1').setValue('첨부사진 수');
 for(const item of states){
  const row=Number(item.source_row);
  if(!Number.isInteger(row)||row<2||row>sheet.getMaxRows())continue;
  // Prevent wrong-row updates after sorting or moving rows. Existing UID must match.
  const meta=sheet.getRange(row+':'+row).getDeveloperMetadata();
  if(!meta.some(m=>m.getKey()===ROW_KEY&&m.getValue()===item.source_uid)){
   console.warn('Source UID mismatch, skipping shipping mirror for row '+row);
   continue;
  }
  // Once approval is canceled, remove old shipping mirror values so registered
  // orders do not display the canceled order's tracking or box quantities.
  if(item.status!=='승인'||!item.approved_order_id){
   const cells=sheet.getRange(row,9,1,7);
   if(cells.getDisplayValues()[0].some(String))cells.clearContent();
   continue;
  }
  const toBox=key=>{
   const n=Number(item[key]??0);
   if(!Number.isInteger(n)||n<0||n>1000)throw new Error('박스 수량 오류: '+key+' row '+row);
   return n;
  };
  const count=Number(item.photo_count??0);
  if(!Number.isInteger(count)||count<0||count>10000)throw new Error('사진 개수 오류: row '+row);
  const wanted=[
   String(item.tracking_numbers||''),toBox('ice_small'),toBox('ice_medium'),
   toBox('ice_large'),toBox('paper_medium'),toBox('paper_large'),count
  ];
  const target=sheet.getRange(row,9,1,7),existing=target.getDisplayValues()[0];
  const unchanged=wanted.every((v,i)=>String(v)===String(existing[i]??''));
  if(unchanged)continue;
  // Preserve tracking numbers as text to retain leading zeroes.
  sheet.getRange(row,9).setNumberFormat('@');
  target.setValues([wanted]);
 }
}

function restrictPartnerProtection_(protection,email) {
 protection.setWarningOnly(false);
 protection.addEditor(email);
 const others=protection.getEditors().filter(u=>u.getEmail()!==email);
 if(others.length)protection.removeEditors(others);
 if(protection.canDomainEdit())protection.setDomainEdit(false);
}
function protectPartnerSheet_(ss,states) {
 const sheet=ss.getSheetByName('주문입력'), status=ss.getSheetByName('접수현황');
 const email=ss.getOwner().getEmail();
 const protections=sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
 const rangeProtection=(range,description,legacyDescription)=>{
  let p=protections.find(x=>x.getDescription()===description||legacyDescription&&x.getDescription()===legacyDescription);
  if(p)p.setRange(range);else {p=range.protect().setDescription(description);protections.push(p);}
  restrictPartnerProtection_(p,email);
 };
 rangeProtection(sheet.getRange('I:O'),'IROUN_ADMIN_COLUMNS_V2','관리자 전용: 송장번호와 포장박스');
 rangeProtection(sheet.getRange('A1:O1'),'IROUN_ORDER_HEADERS_V2');
 if(status){
  let p=status.getProtections(SpreadsheetApp.ProtectionType.SHEET).find(x=>x.getDescription()==='IROUN_STATUS_V2');
  if(!p)p=status.protect().setDescription('IROUN_STATUS_V2');
  restrictPartnerProtection_(p,email);
 }
 // Release locks on rows returned to registration after approval cancellation.
 const approved=new Set(states.filter(s=>s.status==='승인').map(s=>'IROUN_APPROVED_V2:'+s.source_uid));
 for(const p of protections){
  if(p.getDescription().startsWith('IROUN_APPROVED_V2:')&&!approved.has(p.getDescription()))p.remove();
 }
 for(const state of states.filter(s=>s.status==='승인')){
  const row=Number(state.source_row);
  if(!Number.isInteger(row)||row<2||row>sheet.getMaxRows())continue;
  const matched=sheet.getRange(row+':'+row).getDeveloperMetadata().some(m=>m.getKey()===ROW_KEY&&m.getValue()===state.source_uid);
  if(matched)rangeProtection(sheet.getRange(row,1,1,8),'IROUN_APPROVED_V2:'+state.source_uid);
 }
}
