// 거래처용 시트에만 설치하는 컨테이너 바인딩 Apps Script.
// 관리자 DB 인증정보/시트 동기화 토큰은 절대로 여기에 넣지 않습니다.
const ORDER_HEADERS=['주문일','발송일','상품명','수량','수령인','연락처','배송지','요청사항',
 '송장번호','아이스박스 소','아이스박스 중','아이스박스 대','종이박스 중','종이박스 대'];
function onOpen(){
 SpreadsheetApp.getUi().createMenu('이로운과자점')
 .addItem('엑셀 업로드 / 다운로드','openPartnerExcelDialog').addToUi();
}
function openPartnerExcelDialog(){
 const html=HtmlService.createHtmlOutputFromFile('partner_sheet_excel')
  .setWidth(650).setHeight(610);
 SpreadsheetApp.getUi().showModalDialog(html,'주문 양식 및 엑셀 업로드');
}
function getPartnerRowsForExport(){
 const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('주문입력');
 if(!sheet)throw new Error('주문입력 탭 없음');
 const end=sheet.getLastRow();
 const values=end<2?[]:sheet.getRange(2,1,end-1,14).getDisplayValues();
 return {headers:ORDER_HEADERS,rows:values.filter(r=>r.some(x=>String(x).trim()))};
}
function appendPartnerExcelRows(input){
 if(!Array.isArray(input)||!input.length||input.length>500)throw new Error('한 번에 1~500행을 업로드하세요.');
 const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('주문입력');
 if(!sheet)throw new Error('주문입력 탭 없음');
 const currentEnd=sheet.getLastRow();
 const existing=currentEnd<2?[]:sheet.getRange(2,1,currentEnd-1,8).getDisplayValues();
 // Normalize locally formatted dates so that exported files can be uploaded again safely.
 const normalizeDate=v=>{
  const m=String(v??'').trim().match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);
  if(!m)return '';
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const date=new Date(Date.UTC(y,mo-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==mo||date.getUTCDate()!==d)return '';
  return [y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
 };
 const keyOf=r=>r.slice(0,8).map((v,i)=>i<2?normalizeDate(v):String(v??'').trim()).join('\u001f');
 const seen=new Set(existing.map(keyOf));
 const safe=v=>{
  const x=String(v??'').trim();
  return /^[=+@]/.test(x)?"'"+x:x;
 };
 const errors=[],added=[];let skipped=0;
 input.forEach((row,i)=>{
  if(!Array.isArray(row)||row.length<8){errors.push(i+2+'행: 열 개수 부족');return;}
  const r=row.slice(0,8).map(safe);
  r[0]=normalizeDate(r[0]);r[1]=normalizeDate(r[1]);
  if(!r[0]||!r[1]||!r[2]||
    !/^\d+$/.test(r[3])||Number(r[3])<1||Number(r[3])>1000||
    !r[4]||!r[5]||!r[6]){errors.push(i+2+'행: 필수값/날짜/수량 오류');return;}
  if(seen.has(keyOf(r))){skipped++;return;}
  seen.add(keyOf(r));added.push(r);
 });
 if(errors.length)return {ok:false,errors:errors.slice(0,30),added:0,skipped};
 if(added.length){
  if(sheet.getMaxRows()<currentEnd+added.length)sheet.insertRowsAfter(sheet.getMaxRows(),currentEnd+added.length-sheet.getMaxRows());
  // Only A:H are customer-editable. NEVER write into protected administrator I:N columns.
  // Apply the text format before writing so that leading zeroes in contact numbers survive.
  sheet.getRange(currentEnd+1,6,added.length,1).setNumberFormat('@');
  sheet.getRange(currentEnd+1,1,added.length,8).setValues(added);
 }
 return {ok:true,added:added.length,skipped,errors:[]};
}
