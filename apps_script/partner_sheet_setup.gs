/**
 * 이로운과자점 관리자 소유의 독립형 Apps Script 프로젝트에서만 사용합니다.
 * 파트너에게 공유되는 Google Sheets의 Apps Script에는 복사하지 마세요.
 *
 * 1) 프로젝트 설정 > 스크립트 속성에 PARTNER_TEST_SHEET_ID 와 EDGE_URL 입력
 * 2) preparePartnerTestConfig() 한 번 실행 후 권한 승인
 * 3) 실행 로그에서 SHA256 해시만 관리자가 확인 후 테스트 DB에 등록
 * 4) DB에서 소스/토큰이 enabled=true로 등록된 뒤에만
 *    installPartnerSheetTriggers() 실행
 *
 * 원본 비밀 토큰은 콘솔에 표시하지 않고 ScriptProperties에만 저장합니다.
 */
function preparePartnerTestConfig(){
 const props=PropertiesService.getScriptProperties();
 const sheetId=String(props.getProperty('PARTNER_TEST_SHEET_ID')||'').trim();
 const edgeUrl=String(props.getProperty('EDGE_URL')||'').trim();
 if(!/^[a-zA-Z0-9_-]{25,150}$/.test(sheetId))
   throw new Error('프로젝트 설정에 PARTNER_TEST_SHEET_ID를 먼저 등록하세요.');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/partner-sheet-ingest$/.test(edgeUrl))
   throw new Error('프로젝트 설정의 EDGE_URL을 확인하세요.');
 const configs=JSON.parse(props.getProperty('SHEETS_CONFIG')||'[]');
 if(!Array.isArray(configs)||configs.some(c=>!c.sheet_id||!c.token))
   throw new Error('기존 SHEETS_CONFIG의 구조를 확인하세요.');
 if(configs.some(c=>c.sheet_id===sheetId))
   throw new Error('해당 시트 설정이 이미 있습니다. 기존 토큰을 덮어쓰지 않습니다.');
 // Combine independent random UUIDs to create a long opaque token.
 const token=Array.from({length:4},()=>Utilities.getUuid().replace(/-/g,'')).join('');
 const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token,Utilities.Charset.UTF_8)
  .map(b=>(b&255).toString(16).padStart(2,'0')).join('');
 props.setProperty('SHEETS_CONFIG',JSON.stringify([...configs,{sheet_id:sheetId,token}]));
 console.log('테스트 시트 ID: '+sheetId);
 console.log('테스트 DB에 등록할 SHA-256 토큰 해시 (원본 토큰 아님): '+hash);
 console.log('SHEETS_CONFIG 원본 내용은 로그/채팅/공유 시트에 공개하지 마세요.');
 return {sheet_id:sheetId,token_hash_sha256:hash};
}
