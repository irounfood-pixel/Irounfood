/* Public code contains no catalog data. XLSX contents remain in the administrator's browser. */
(function(root){
'use strict';
const HEADERS=['품목ID','분류','품목명','기준단위','현재재고','실재고','메모','버전'];
const KINDS={raw:'원재료·구매품',semi:'반제품',product:'제품'};
function validate(rows,items){
 if(!Array.isArray(rows)||!rows.length||HEADERS.some((h,n)=>rows[0][n]!==h)||rows[0].length!==8)throw Error('재고입력 시트의 첫 행·8개 열 제목을 변경하지 마세요.');
 if(rows.length>2001)throw Error('한 파일은 최대 2,000개 품목입니다.');
 const known=new Map(items.map(i=>[i.id,i])),seen=new Set(),changes=[];
 rows.slice(1).forEach((r,n)=>{
  if(!r.some(v=>v!==null&&v!==undefined&&String(v).trim()!==''))return;
  const fail=m=>{throw Error(`${n+2}행: ${m}`);};
  const id=String(r[0]??'').trim(),item=known.get(id);
  if(!item||item.active===false)fail('등록된 활성 품목ID가 아닙니다.');
  if(seen.has(id))fail('같은 품목이 중복되었습니다.');seen.add(id);
  if(r[1]!==KINDS[item.kind]||r[2]!==item.name||r[3]!==item.unit)fail('품목 구분·이름·기준단위가 다릅니다. 최신 양식을 받으세요.');
  const v=r[5];if(v===null||v===undefined||String(v).trim()==='')return;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>=1e9||Math.abs(v*1e6-Math.round(v*1e6))>0.00001)fail('실재고는 0 이상 10억 미만 숫자, 소수 6자리 이내로 입력하세요.');
  if(item.unit!=='kg'&&!Number.isInteger(v))fail('개수 단위는 정수로 입력하세요.');
  if(v<item.reserved)fail('실재고가 수동 예약량보다 작습니다. 먼저 예약을 조정하세요.');
  if(!Number.isInteger(r[7])||r[7]!==item.version)fail('다운로드 후 변경된 품목입니다. 최신 양식을 받으세요.');
  const note=String(r[6]??'').trim();if(note.length>500)fail('메모는 500자 이내입니다.');
  changes.push({id,unit:item.unit,version:item.version,qty:v,note,name:item.name,before:item.qty});
 });
 if(!changes.length)throw Error('입력된 실재고가 없습니다. 공란은 변경하지 않습니다.');
 return changes;
}
function read(workbook,items,XLSX){
 const sheet=workbook.Sheets['재고입력'];if(!sheet)throw Error('재고입력 시트가 없습니다.');
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1');if(range.e.r>2000||range.e.c>7)throw Error('양식 크기를 확인하세요. 최대 2,000행·8열입니다.');
 for(const [k,c] of Object.entries(sheet))if(k[0]!=='!'&&(c.f||c.l))throw Error('입력 시트에 수식이나 링크를 사용할 수 없습니다. 값만 붙여넣어 주세요.');
 return validate(XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true}),items);
}
function workbook(items,XLSX){const book=XLSX.utils.book_new(),rows=[HEADERS,...items.filter(i=>i.active!==false).map(i=>[i.id,KINDS[i.kind],i.name,i.unit,i.qty,null,'',i.version])];const s=XLSX.utils.aoa_to_sheet(rows);s['!cols']=[{wch:38},{wch:18},{wch:40},{wch:10},{wch:14},{wch:14},{wch:40},{wch:10}];XLSX.utils.book_append_sheet(book,s,'재고입력');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['재고 실사 안내'],['실재고·메모만 입력하세요. 공란은 미변경, 0은 재고 0으로 저장됩니다.'],['kg는 소수 6자리, 다른 단위는 정수입니다. 15g = 0.015kg.'],['입고 추가가 아닌 현재 보유 총수량으로 대체합니다.'],['메모는 변경 이력에만 저장합니다. 최신 파일을 다운로드하세요.'],['웹페이지에서 미리보기 후 저장을 확정해야 적용됩니다.']]),'사용안내');return book;}
const api={HEADERS,validate,read,workbook};if(typeof module!=='undefined')module.exports=api;root.InventoryExcel=api;
})(typeof window==='undefined'?globalThis:window);
