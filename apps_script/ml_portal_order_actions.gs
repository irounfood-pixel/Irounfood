/** Append to the existing private ML webapp, never to a shared bound script.
 * ML_PORTAL_MANAGE_URL and ML_PORTAL_MANAGE_TOKEN are server Script Properties.
 * This is a separate, sheet-scoped status/cancel/delete credential, not the sync token.
 * Existing UID metadata must first be made DOCUMENT-visible by the sync project.
 */
const ML_UID_KEY_='IROUN_PARTNER_SOURCE_UID_V2';
function mlPortalApi_(action,uid,expected,updated,input){
 const props=PropertiesService.getScriptProperties(),url=props.getProperty('ML_PORTAL_MANAGE_URL'),token=props.getProperty('ML_PORTAL_MANAGE_TOKEN');
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/partner-portal-manage$/.test(url||'')||!token)
  throw Error('주문 관리 서버 설정이 필요합니다. 관리자에게 문의해 주세요.');
 const res=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',
  headers:{Authorization:'Bearer '+token},muteHttpExceptions:true,
  payload:JSON.stringify({sheet_id:ML_SHEET_ID_,action,source_uid:uid||null,
   expected:expected||null,expected_updated_at:updated||null,input:input||null})});
 let out;try{out=JSON.parse(res.getContentText());}catch(e){throw Error('주문 관리 서버에 연결하지 못했습니다.');}
 if(res.getResponseCode()!==200||!out.ok)throw Error(out.error||'주문 처리에 실패했습니다. 새로고침해 주세요.');
 return out;
}
function mlUid_(s,row){
 const ids=s.getRange(row+':'+row).getDeveloperMetadata().filter(m=>m.getKey()===ML_UID_KEY_).map(m=>String(m.getValue()));
 return ids.length===1&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ids[0])?ids[0]:null;
}
function mlUnlockRegistered_(s,states){
 const restored=new Set(states.filter(x=>['등록','승인대기'].includes(x.status)&&!x.approved_order_id).map(x=>String(x.source_uid)));
 for(const p of s.getProtections(SpreadsheetApp.ProtectionType.RANGE)){
  const name=p.getDescription()||'',prefix='IROUN_APPROVED_V2:';
  if(!name.startsWith(prefix)||!restored.has(name.slice(prefix.length)))continue;
  const r=p.getRange();
  if(r.getSheet().getSheetId()===s.getSheetId()&&mlUid_(s,r.getRow())===name.slice(prefix.length)){
   s.getRange(r.getRow(),9,r.getNumRows(),7).clearContent();p.remove();
  }
 }
}
function getMLPortalData(){
 const s=mlSheet_(),state=mlPortalApi_('status');mlUnlockRegistered_(s,state.rows);
 mlApplyCanonical_(s,state.rows);
 const data=getMLPortalDataLegacy_(),deleted=new Set(state.deleted_uids||[]),byUid=new Map(state.rows.map(x=>[String(x.source_uid),x]));
 const entries=data.rows.map((row,i)=>{const uid=mlUid_(s,data.sourceRows[i]),item=byUid.get(uid);
  return {row,sourceRow:data.sourceRows[i],uid,state:item&&mlKey_(item.fields)===mlKey_(row)?item:null};
 }).filter(e=>!deleted.has(e.uid));
 const editable=new Set(entries.filter(e=>e.state?.status==='승인'&&['주문접수','준비중'].includes(e.state.order_status)).map(e=>e.sourceRow));
 return {...data,lockedSourceRows:(data.lockedSourceRows||[]).filter(n=>!editable.has(n)),rows:entries.map(e=>e.row),sourceRows:entries.map(e=>e.sourceRow),
  orderStates:entries.map(e=>e.state?{source_uid:e.uid,status:e.state.status,order_status:e.state.order_status,
   updated_at:e.state.updated_at}:null)};
}
function mlApplyCanonical_(s,states){
 for(const item of states.filter(x=>x.status==='승인'&&x.approved_order_id&&Array.isArray(x.fields))){
  let target=0;
  for(let n=2;n<=s.getLastRow();n++)if(mlUid_(s,n)===item.source_uid){target=n;break;}
  if(!target){target=s.getLastRow()+1;mlWrite_(s,target,[item.fields]);s.getRange(target+':'+target).addDeveloperMetadata(ML_UID_KEY_,item.source_uid,SpreadsheetApp.DeveloperMetadataVisibility.DOCUMENT);}
  else if(mlKey_(s.getRange(target,1,1,8).getDisplayValues()[0])!==mlKey_(item.fields))mlWrite_(s,target,[item.fields]);
 }
}
function updateMLPortalOrder(sourceRow,expected,input){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const s=mlSheet_(),uid=Number.isInteger(sourceRow)&&sourceRow>=2&&sourceRow<=s.getLastRow()?mlUid_(s,sourceRow):null;
  const state=mlPortalApi_('status');
  if((state.deleted_uids||[]).includes(uid))throw Error('이미 삭제한 주문입니다. 새로고침해 주세요.');
  const row=state.rows.find(x=>x.source_uid===uid);
  if(row?.status==='승인'){
   if(!['주문접수','준비중'].includes(row.order_status))throw Error('출고완료·취소 주문은 수정할 수 없습니다.');
   if(!Array.isArray(expected)||expected.length!==8||mlKey_(row.fields)!==mlKey_(expected)||mlKey_(s.getRange(sourceRow,1,1,8).getDisplayValues()[0])!==mlKey_(expected))throw Error('주문이 변경됐습니다. 새로고침해 주세요.');
   const v=mlValidate_([input],mlProducts_(s));if(v.errors.length)return {ok:false,errors:v.errors};
   const normalized=expected.map((v,i)=>i<2?mlDate_(v):String(v??'').trim());
   const result=mlPortalApi_('update',uid,normalized,row.updated_at,v.rows[0]);
   mlApplyCanonical_(s,result.rows);return {ok:true,row:sourceRow};
  }
  if(row&&!['등록','승인대기'].includes(row.status))throw Error('수정할 수 없는 주문입니다.');
 }finally{lock.releaseLock();}
 // Legacy function acquires the same script lock itself.
 const s=mlSheet_();mlUnlockRegistered_(s,mlPortalApi_('status').rows);
 return updateMLPortalOrderLegacy_(sourceRow,expected,input);
}
function manageMLPortalOrder(uid,updated,expected,action){
 if(!['cancel','delete'].includes(action)||!Array.isArray(expected)||expected.length!==8||typeof updated!=='string')throw Error('주문 정보를 새로고침해 주세요.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const s=mlSheet_();let found=false;
  for(let row=2;row<=s.getLastRow();row++)if(mlUid_(s,row)===uid){
   if(mlKey_(s.getRange(row,1,1,8).getDisplayValues()[0])!==mlKey_(expected))throw Error('시트 내용이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
   found=true;break;
  }
  if(!found)throw Error('주문 위치가 변경되었습니다. 새로고침해 주세요.');
  const normalized=expected.map((v,i)=>i<2?mlDate_(v):String(v??'').trim());
  const result=mlPortalApi_(action,uid,normalized,updated);mlUnlockRegistered_(s,result.rows);
  return {ok:true,action};
 }finally{lock.releaseLock();}
}
