/**
 * 이로운과자점 거래처 Google Sheets 자동 동기화 (관리자 소유 "독립형" Apps Script 전용).
 *
 * 이 파일을 거래처에 공유되는 시트에 바인딩하지 마세요.
 * Script Properties:
 *  EDGE_URL = https://<project>.supabase.co/functions/v1/partner-sheet-ingest
 *  SHEETS_CONFIG = [{"sheet_id":"<Google Sheet ID>","token":"<서버에 해시 등록한 비밀 토큰>"}]
 *
 * 초기 설치: installPartnerSheetTriggers() 를 관리자 계정에서 한 번 실행.
 * 모든 거래처 파일에 대해 onEdit + 5분 주기 보조 검사.
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
 if(!e||!e.source||!e.range||e.range.getSheet().getName()!=='주문입력')return;
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
 return String(value||'').trim().replace(/[./]\s*/g,'-').replace(/\s+/g,'').replace(/-$/,'');
}
function numberString_(value) {return String(value===''?0:value).replace(/,/g,'').trim();}
function sourceUid_(sheet,row,used) {
 const target=sheet.getRange(row,1,1,sheet.getMaxColumns());
 const found=target.getDeveloperMetadata().filter(m=>m.getKey()===ROW_KEY);
 let uid=found.length?String(found[0].getValue()):'';
 if(!/^[0-9a-f-]{36}$/i.test(uid)||used.has(uid)){
  found.forEach(m=>m.remove());
  uid=Utilities.getUuid();
  target.addDeveloperMetadata(ROW_KEY,uid,SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
 }
 used.add(uid);
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
  const values=sheet.getRange(2,1,last-1,14).getValues();
  const display=sheet.getRange(2,1,last-1,14).getDisplayValues();
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
   // 승인된 행의 송장/포장 데이터도 안정적 UID로 갱신
   if(!complete)continue;
   const uid=sourceUid_(sheet,rowNo,used);
   const obj={source_row:rowNo,source_uid:uid,order_date:orderDate,ship_date:shipDate,
    product_name:product,quantity:qty,recipient,contact,address,note:String(text[7]||'').trim(),
    tracking_numbers:String(text[8]||'').trim(),
    ice_small:numberString_(text[9]),ice_medium:numberString_(text[10]),
    ice_large:numberString_(text[11]),paper_medium:numberString_(text[12]),
    paper_large:numberString_(text[13])};
   rows.push(obj);
  }
  let result={status_rows:[]};
  // Edge Function limit: 500행/호출
  for(let i=0;i<rows.length;i+=400)result=postPartnerRows_(endpoint,cfg,rows.slice(i,i+400));
  // 빈 행만 있는 파일은 상태 조회가 없어 접수현황을 건드리지 않습니다.
  if(rows.length&&result.status_rows)writePartnerStatus_(ss,result.status_rows);
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
