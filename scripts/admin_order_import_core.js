(function(root){
 const headers=['주문묶음번호','주문일','발송일','고객/기관명','담당자/수령인','연락처','배송지','수령방법','상품명','수량','요청사항'];
 const str=v=>String(v??'').trim();
 function date(v){
  const m=str(v).match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);if(!m)return null;
  const s=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'),d=new Date(s+'T00:00:00Z');
  return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s?s:null;
 }
 function parse(matrix,products,today){
  const errors=[],groups=new Map(),names=new Map();
  for(const p of products.filter(p=>p.active!==false)){const k=str(p.name);if(!names.has(k))names.set(k,[]);names.get(k).push(p);}
  if(!Array.isArray(matrix)||headers.some((h,i)=>str(matrix[0]?.[i])!==h))return {errors:['열 제목이 다릅니다. 관리자용 빈 양식을 받아 작성해 주세요.'],orders:[]};
  const rows=matrix.slice(1).map((r,i)=>({r,num:i+2})).filter(({r})=>r.some(v=>str(v)));
  if(!rows.length||rows.length>500)return {errors:['상품이 입력된 행을 1~500행 선택해 주세요.'],orders:[]};
  for(const {r,num} of rows){
   const a=Array.from({length:11},(_,i)=>str(r[i]));
   const fail=msg=>errors.push(num+'행: '+msg);
   if(r.slice(11).some(v=>str(v))){fail('양식 밖의 열에 내용이 있습니다.');continue;}
   const od=date(a[1]||today),sd=date(a[2]),method=a[7]||'방문수령';
   if(!od||!sd)fail('주문일·발송일을 YYYY-MM-DD 형식의 실제 날짜로 입력하세요.');
   if(!a[3]||!a[6])fail('고객/기관명과 배송지는 필수입니다.');
   if(!['택배','방문수령'].includes(method))fail('수령방법은 택배 또는 방문수령입니다.');
   if(typeof r[5]==='number')fail('연락처를 문자 형식으로 입력하세요. 앞자리 0이 사라졌는지 확인해 주세요.');
   if(a[3].length>100||a[4].length>100||a[5].length>100||a[6].length>1000||a[10].length>2000)fail('입력 내용이 너무 깁니다.');
   const matches=names.get(a[8])||[],p=matches.length===1?matches[0]:null;
   if(!p)fail(matches.length>1?'같은 이름의 상품이 여러 개입니다. 상품명을 구분해 주세요.':'상품명 “'+a[8]+'”을 상품목록과 똑같이 입력하세요.');
   const qty=Number(a[9]);if(!/^\d+$/.test(a[9])||qty<1||qty>1000)fail('수량은 1~1000의 정수입니다.');
   if(p&&(!p.inventory_item_id||!(Number(p.deduction_qty)>0)))fail('상품의 재고 연결 설정을 확인해 주세요.');
   const key=a[0]?'group:'+a[0]:'row:'+num;
   const base={order_date:od,ship_date:sd,customer_name:a[3],manager_name:a[4],contact:a[5],address:a[6],receive_method:method,note:a[10]};
   if(!groups.has(key))groups.set(key,{...base,items:[],label:a[0]||num+'행',sourceRows:[]});
   const g=groups.get(key);g.sourceRows.push(num);
   if(Object.keys(base).some(k=>g[k]!==base[k]))fail('같은 주문묶음번호의 날짜·고객·배송정보·요청사항이 다릅니다.');
   if(p&&Number.isInteger(qty)&&qty>=1&&qty<=1000){const item=g.items.find(x=>x.product_id===p.id);if(item)item.quantity+=qty;else g.items.push({product_id:p.id,quantity:qty,name:p.name});}
  }
  const orders=[...groups.values()];
  for(const g of orders){if(g.items.length>100)errors.push('주문 '+g.label+': 한 주문은 최대 100종 상품입니다.');if(g.items.some(i=>i.quantity>1000))errors.push('주문 '+g.label+': 같은 상품의 합계는 1000개 이하여야 합니다.');}
  return {errors,orders,rowCount:rows.length};
 }
 function payload(orders){return orders.map(({label,sourceRows,items,...g})=>({...g,items:items.map(({product_id,quantity})=>({product_id,quantity}))}));}
 root.IrounOrderImport={headers,date,parse,payload};
 if(typeof module==='object')module.exports=root.IrounOrderImport;
})(typeof window==='object'?window:globalThis);
