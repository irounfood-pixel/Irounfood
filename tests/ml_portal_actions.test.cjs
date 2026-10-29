const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const server=fs.readFileSync(require('node:path').join(__dirname,'../apps_script/ml_portal_order_actions.gs'),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const fields=['2026-10-29','2026-11-30','초코스틱','2','테스트','010-0000-0000','배송금지 주소',''];
function fixture(){
 const s={getLastRow:()=>3,getProtections:()=>[],getRange:r=>({getDeveloperMetadata:()=>[{getKey:()=> 'IROUN_PARTNER_SOURCE_UID_V2',getValue:()=>r==='2:2'?a:b}],getDisplayValues:()=>[fields]})};
 const context=vm.createContext({mlSheet_:()=>s,getMLPortalDataLegacy_:()=>({headers:[],products:[],rows:[fields,fields],sourceRows:[2,3],lockedSourceRows:[]}),
  SpreadsheetApp:{ProtectionType:{RANGE:'RANGE'}},mlKey_:r=>r.slice(0,8).join('|'),mlDate_:v=>v,
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
 vm.runInContext(server,context);
 return {context,s};
}
test('portal filters a deleted UID while retaining another identical order',()=>{
 const {context:c}=fixture();c.mlPortalApi_=()=>({ok:true,rows:[{source_uid:b,status:'등록',updated_at:'v1',fields}],deleted_uids:[a]});
 const result=c.getMLPortalData();assert.equal(result.rows.length,1);assert.equal(result.sourceRows[0],3);assert.equal(result.orderStates[0].source_uid,b);
});
test('sheet content mismatch does not attach actions to a moved or changed row',()=>{
 const {context:c}=fixture();c.mlPortalApi_=()=>({rows:[{source_uid:a,status:'승인',fields:[...fields.slice(0,3),'99',...fields.slice(4)]}],deleted_uids:[]});
 assert.equal(c.getMLPortalData().orderStates[0],null);
});
test('foreign UID is rejected before any server mutation',()=>{
 const {context:c}=fixture();let calls=0;c.mlPortalApi_=()=>{calls++;return {rows:[]};};
 assert.throws(()=>c.manageMLPortalOrder('00000000-0000-4000-8000-000000000099','v1',fields,'delete'),/위치/);assert.equal(calls,0);
});
test('editing checks the server approval status before legacy sheet update',()=>{
 const {context:c}=fixture();c.mlPortalApi_=()=>({rows:[{source_uid:a,status:'승인'}],deleted_uids:[]});
 c.updateMLPortalOrderLegacy_=()=>{throw Error('must not write');};
 assert.throws(()=>c.updateMLPortalOrder(2,fields,fields),/승인 취소/);
});
