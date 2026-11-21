/* Receipt spreadsheet: separate from stocktake. No catalog is embedded. */
(function(root){
'use strict';
const HEADERS=['품목ID','분류','품목명','입력단위','입고 개수','입고 무게(kg)','환산 안내','현재재고','메모','버전'];
const KINDS={raw:'원재료·구매품',semi:'반제품',product:'제품'};
const filled=x=>x!==null&&x!==undefined&&String(x).trim()!=='';
function spec(item){
 const factor=Number(item.purchase_factor);
 return item.unit!=='kg'&&item.estimated===false&&item.purchase_unit&&item.purchase_unit!==item.unit&&Number.isInteger(factor)&&factor>1
  ?{unit:item.purchase_unit,factor}:{unit:item.unit,factor:1};
}
function workbook(items,XLSX){
 const b=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([HEADERS,...items.filter(i=>i.active!==false).map(i=>{
 const a=spec(i);return [i.id,KINDS[i.kind],i.name,a.unit,null,null,a.factor===1?'':`1${a.unit} = ${a.factor}${i.unit}`,i.qty,'',i.version];})]);
 s['!cols']=[{hidden:true},{wch:18},{wch:35},{wch:14},{wch:14},{wch:20},{wch:26},{wch:14},{wch:30},{hidden:true}];
 s['!autofilter']={ref:s['!ref']};
 XLSX.utils.book_append_sheet(b,s,'입고입력');
 XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['입고 엑셀 안내'],['입력단위가 kg이면 입고 무게(kg), 나머지는 입고 개수 칸에 숫자만 입력합니다.'],['봉·박스 단위인 품목은 포장 수를 입력하면 화면에서 저장 단위로 환산합니다.'],['뜯은 봉지처럼 포장 단위로 적기 어려운 입고는 화면의 개별 입고에서 기본단위로 기록하세요.'],['입고 없는 품목은 공란. 재고가 미입력인 품목은 먼저 실사 수량을 입력하세요.'],['입고는 기존 재고에 더합니다. 전체 재고를 맞추려면 실사 엑셀을 사용하세요.'],['직접 만든 제품·반제품은 별도 생산 완료로 기록해야 사용 재료도 차감됩니다.'],['업로드 후 환산 및 변경 후 수량을 확인하고 저장하세요. 품목을 바꿨다면 최신 양식을 받으세요.']]),'사용안내');
 return b;
}
function validate(rows,items){
 if(!Array.isArray(rows)||rows.length>1001||rows[0]?.length!==HEADERS.length||HEADERS.some((h,j)=>rows[0][j]!==h))throw Error('최신 입고 양식의 입고입력 시트와 열 제목을 유지하세요.');
 const byId=new Map(items.map(i=>[i.id,i])),seen=new Set(),result=[];
 rows.slice(1).forEach((r,n)=>{
  if(!filled(r[4])&&!filled(r[5]))return;
  const fail=m=>{throw Error(`${n+2}행 (${String(r[2]??'품목 미확인')}): ${m}`);};
  const i=byId.get(r[0]);if(!i||i.active===false||seen.has(i.id))fail('등록된 품목이 아니거나 중복 행입니다.');seen.add(i.id);
  const a=spec(i);
  if(r[1]!==KINDS[i.kind]||r[2]!==i.name||r[3]!==a.unit||r[9]!==i.version)fail('품목 정보 또는 현재 재고가 변경됐습니다. 최신 양식으로 다시 입력하세요.');
  if(i.qty==null)fail('먼저 실사 수량을 입력하세요.');
  const kg=a.unit==='kg',v=r[kg?5:4];
  if(filled(r[kg?4:5])||typeof v!=='number'||!Number.isFinite(v)||v<=0||v>=1e9)fail('입력단위에 맞는 한 칸에 0보다 큰 숫자를 입력하세요.');
  if(kg?Math.abs(v*1e6-Math.round(v*1e6))>0.00001:!Number.isInteger(v))fail('kg은 소수 6자리 이내, 개수는 정수로 입력하세요.');
  const qty=v*a.factor,after=Number(i.qty)+qty,note=String(r[8]??'').trim();
  if(after>=1e9||note.length>500)fail('수량 또는 메모 길이를 확인하세요.');
  result.push({id:i.id,unit:i.unit,version:i.version,entry_unit:a.unit,entry_qty:v,qty,before:i.qty,after,note,name:i.name});
 });
 if(!result.length)throw Error('파일에 입력된 입고 수량이 없습니다.');
 return result;
}
function read(b,items,XLSX){
 const s=b.Sheets['입고입력'];if(!s)throw Error('입고입력 시트가 없습니다. 실사 양식과 구분해 주세요.');
 const r=XLSX.utils.decode_range(s['!ref']||'A1');if(r.e.r>1000||r.e.c>9)throw Error('입고 양식의 행·열 범위를 확인하세요.');
 for(const [k,c] of Object.entries(s))if(k[0]!=='!'&&(c.f||c.l))throw Error('입고입력 시트에는 수식이나 링크를 사용할 수 없습니다.');
 return validate(XLSX.utils.sheet_to_json(s,{header:1,defval:null,raw:true}),items);
}
const api={HEADERS,spec,workbook,validate,read};if(typeof module!=='undefined')module.exports=api;root.InventoryReceiveExcel=api;
})(typeof window==='undefined'?globalThis:window);
