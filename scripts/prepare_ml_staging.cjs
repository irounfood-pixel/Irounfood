const fs=require('node:fs'),vm=require('node:vm');
const {patchMLPortal}=require('./patch_ml_portal.cjs');
const [,,input,output]=process.argv;
if(!input||!output)throw Error('node prepare_ml_staging.cjs owner-export.gs output.gs');
let source=patchMLPortal(fs.readFileSync(input,'utf8'));
source=source.replace(/const ML_SHEET_ID_='[^']+';/,"const ML_SHEET_ID_=PropertiesService.getScriptProperties().getProperty('ML_STAGING_SHEET_ID');");
const marker='const ML_PORTAL_HTML_=',index=source.indexOf(marker);
let html=JSON.parse(source.slice(index+marker.length).trim().replace(/;$/,''));
html=html.replace('운영 연결','테스트 전용 · 실제 배송 금지')
 .replace("async function loadMLExportPhotos(){","async function loadMLExportPhotos(){return [];/*")
 .replace('return result.photos;}','return result.photos;*/}')
 .replaceAll('iqopdxrnkmpdivzndkxq','bgswafqssdmktnmyyqef');
source=source.slice(0,index)+marker+JSON.stringify(html)+';\n';
let sync=fs.readFileSync(require('node:path').join(__dirname,'../apps_script/partner_sheet_sync.gs'),'utf8');
sync=sync.slice(sync.indexOf('const ROW_KEY'));
sync=sync.slice(0,sync.indexOf('function installPartnerSheetTriggers()'))+sync.slice(sync.indexOf('function syncAllPartnerSheets()'));
source+='\n'+sync+`\n
function initializeMLStaging(){
 if(!Session.getActiveUser().getEmail()||Session.getActiveUser().getEmail()!==Session.getEffectiveUser().getEmail())throw Error('관리자 전용 테스트 설치입니다.');
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('ML_STAGING_SHEET_ID'))throw Error('이미 설치되었습니다. 기존 테스트 시트는 보존합니다.');
 const ss=SpreadsheetApp.create('ML 주문상태 테스트 · 실제 배송 금지 20261029'),s=ss.getSheets()[0];
 s.setName('주문입력');ss.setSpreadsheetTimeZone('Asia/Seoul');
 s.getRange(1,1,1,15).setValues([ML_HEADERS_]);s.setFrozenRows(1);
 const products=['과자집','감자샐러드샌드위치','감정컵케이크','경단','글자생과자','도넛','뻥스케이크','식빵카나페','초코스틱','캐릭터생과자','튀밥강정','화과자'];
 s.getRange('C2:C1000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(products,true).setAllowInvalid(false).build());
 s.getRange('A2:B1000').setNumberFormat('@');s.getRange('F2:F1000').setNumberFormat('@');
 s.getRange(2,1,2,8).setValues([['2026-10-29','2026-11-30','초코스틱','2','ML 테스트 주문 · 배송 금지','010-0000-0000','테스트 주소 · 실제 배송 금지','승인 취소 테스트'],['2026-10-29','2026-11-30','과자집','3','ML 테스트 주문 · 배송 금지','010-0000-0000','테스트 주소 · 실제 배송 금지','두 상품 동시 복귀 테스트']]);
 ss.insertSheet('접수현황').getRange(1,1,1,5).setValues([['ID','발송일','수령인','상태','업데이트']]);
 const portal=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''),syncToken=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
 props.setProperties({ML_STAGING_SHEET_ID:ss.getId(),ML_PORTAL_MANAGE_URL:'https://bgswafqssdmktnmyyqef.supabase.co/functions/v1/partner-portal-manage',ML_PORTAL_MANAGE_TOKEN:portal,EDGE_URL:'https://bgswafqssdmktnmyyqef.supabase.co/functions/v1/partner-sheet-ingest',SHEETS_CONFIG:JSON.stringify([{sheet_id:ss.getId(),token:syncToken}])});
 const hash=t=>Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,t,Utilities.Charset.UTF_8).map(x=>(x&255).toString(16).padStart(2,'0')).join('');
 console.log(JSON.stringify({sheet_id:ss.getId(),portal_hash:hash(portal),sync_hash:hash(syncToken)}));
}
`;
new vm.Script(source);
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
inline.forEach(text=>new vm.Script(text));
if(source.includes('iqopdxrnkmpdivzndkxq')||source.includes('1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'))throw Error('Production target remains');
fs.writeFileSync(output,source);console.log('Staging code parsed; production URLs and ML sheet ID excluded.');
