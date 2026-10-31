(function orderDocumentsModule(){
  "use strict";
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const won = value => Number(value || 0).toLocaleString("ko-KR");
  const supportedTax = ["included","excluded","exempt"];
  function calculateRows(rows){
    let supplyTotal=0,vatTotal=0,total=0;
    const result=rows.map((item,index)=>{
      const qty=Number(item.quantity);
      const unitPrice=item.unitPrice===""||item.unitPrice===null||item.unitPrice===undefined?NaN:Number(item.unitPrice);
      const taxType=item.taxType;
      if(!Number.isSafeInteger(qty)||qty<=0||!Number.isSafeInteger(unitPrice)||unitPrice<0||!supportedTax.includes(taxType)){
        throw new Error((index+1)+"번째 상품의 수량·단가·과세 구분을 확인해주세요.");
      }
      const base=qty*unitPrice;
      if(!Number.isSafeInteger(base))throw new Error("계산 가능한 금액 범위를 초과했습니다.");
      const supply=taxType==="included"?Math.round(base/1.1):base;
      const vat=taxType==="included"?base-supply:taxType==="excluded"?Math.round(base*0.1):0;
      const amount=supply+vat;
      supplyTotal+=supply;vatTotal+=vat;total+=amount;
      return {name:String(item.name||"상품명 없음"),quantity:qty,unitPrice,taxType,supply,vat,amount};
    });
    if(![supplyTotal,vatTotal,total].every(Number.isSafeInteger))throw new Error("합계 금액 범위를 초과했습니다.");
    return {rows:result,supplyTotal,vatTotal,total};
  }
  function renderDocument(doc){
    const isMoney=doc.type==="transaction";
    const title=isMoney?"거래명세표":"납품명세표";
    const seller=doc.seller||{},buyer=doc.buyer||{},rows=doc.rows||[];
    const docRows=rows.map((r,i)=>"<tr><td class='center'>"+(i+1)+"</td><td>"+safe(r.name)+"</td><td class='right'>"+won(r.quantity)+"</td>"+(isMoney?"<td class='right'>"+won(r.unitPrice)+"</td><td class='right'>"+won(r.supply)+"</td><td class='right'>"+won(r.vat)+"</td><td class='right'>"+won(r.amount)+"</td>":"")+"</tr>").join("");
    const spans=isMoney?7:3;
    const totals=isMoney?`<div class="totals"><span>공급가액 ${won(doc.supplyTotal)}원</span><span>부가세 ${won(doc.vatTotal)}원</span><strong>합계 ${won(doc.total)}원</strong></div>`:`<div class="totals"><strong>총 수량 ${won(rows.reduce((n,r)=>n+Number(r.quantity),0))}개</strong></div>`;
    const heads=isMoney?"<th>번호</th><th>품명</th><th>수량</th><th>단가</th><th>공급가액</th><th>부가세</th><th>합계</th>":"<th>번호</th><th>품명</th><th>수량</th>";
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title} ${safe(doc.orderNo)}</title>
<style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans KR",sans-serif;margin:0;color:#222;font-size:12px}h1{text-align:center;font-size:25px;letter-spacing:6px;margin:5px 0 24px}.meta{display:flex;justify-content:space-between;margin-bottom:14px}.blocks{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:12px 0 20px}.block{border:1px solid #999}.block h2{font-size:13px;background:#f1f1f1;margin:0;padding:9px}.details{display:grid;grid-template-columns:65px 1fr;gap:8px 5px;padding:10px}.details b{font-size:11px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #888;padding:8px 5px;overflow-wrap:anywhere}th{background:#f1f1f1}.center{text-align:center}.right{text-align:right}.totals{display:flex;justify-content:flex-end;gap:20px;margin-top:12px;font-size:13px}.totals strong{font-size:17px}.note{border:1px solid #ddd;margin-top:20px;padding:10px;min-height:50px;white-space:pre-wrap;overflow-wrap:anywhere}.foot{font-size:10px;color:#777;margin-top:20px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<h1>${title}</h1><div class="meta"><span>주문번호: ${safe(doc.orderNo||"-")}</span><span>작성일: ${safe(doc.date||"-")}</span></div>
<section class="blocks"><div class="block"><h2>공급자</h2><div class="details"><b>상호</b><span>${safe(seller.name||"-")}</span><b>등록번호</b><span>${safe(seller.number||"-")}</span><b>대표자</b><span>${safe(seller.owner||"-")}</span><b>주소</b><span>${safe(seller.address||"-")}</span><b>연락처</b><span>${safe(seller.contact||"-")}</span></div></div>
<div class="block"><h2>공급받는 자</h2><div class="details"><b>기관/상호</b><span>${safe(buyer.name||"-")}</span><b>담당자</b><span>${safe(buyer.manager||"-")}</span><b>연락처</b><span>${safe(buyer.contact||"-")}</span><b>배송지</b><span>${safe(buyer.address||"-")}</span><b>발송일</b><span>${safe(doc.shipDate||"-")}</span></div></div></section>
<table><thead><tr>${heads}</tr></thead><tbody>${docRows||`<tr><td colspan="${spans}">상품 없음</td></tr>`}</tbody></table>${totals}
<div class="note"><b>비고</b><div>${safe(doc.note||"")}</div></div>
<div class="foot">${isMoney?"거래명세표는 세금계산서가 아닙니다. 단가·세액 및 공급자 정보를 확인한 후 사용하세요.":"상품 및 수량 확인용 문서이며 금액을 표시하지 않습니다."}</div></body></html>`;
  }
  const profileKey="iroun-order-document-supplier-v1";
  function supplierProfile(){
    try{const data=JSON.parse(localStorage.getItem(profileKey)||"{}");return data&&typeof data==="object"?data:{};}catch{return {};}
  }
  function docInput(id,label,value,placeholder=""){
    return `<div class="field"><label for="${id}">${safe(label)}</label><input id="${id}" value="${safe(value)}" placeholder="${safe(placeholder)}"></div>`;
  }
  function currentUnitPrice(item){
    const product=(window.state?.products||[]).find(p=>String(p.id)===String(item.product_id));
    return product && Number.isSafeInteger(Number(product.price)) && Number(product.price)>=0?String(product.price):"";
  }
  function openChooser(orderId){
    const order=(window.state?.orders||[]).find(x=>String(x.id)===String(orderId));
    if(!order){window.toast("주문 정보를 찾을 수 없습니다.");return;}
    const lines=Array.isArray(order.order_items)?order.order_items:[];
    if(!lines.length){window.toast("출력할 주문 상품이 없습니다.");return;}
    const saved=supplierProfile();
    const sellerFields=[["name","상호","이로운과자점"],["number","사업자등록번호",""],["owner","대표자",""],["address","공급자 주소",""],["contact","공급자 연락처",""]];
    const sellerHtml=sellerFields.map(([key,label,def])=>docInput("doc-seller-"+key,label,saved[key]||def)).join("");
    const lineHtml=lines.map((line,i)=>`<tr><td>${safe(line.product_name_snapshot||line.kit_name||"상품명 없음")}</td><td class="right">${won(line.quantity)}개</td>
<td><input id="doc-price-${i}" type="number" min="0" step="1" style="width:105px" value="${safe(currentUnitPrice(line))}" aria-label="${i+1}번째 품목 단가"></td>
<td><select id="doc-tax-${i}" aria-label="${i+1}번째 품목 과세구분"><option value="included">과세(부가세 포함)</option><option value="excluded">과세(부가세 별도)</option><option value="exempt">면세</option></select></td></tr>`).join("");
    window.__orderDocumentDraft={orderId:String(orderId)};
    window.openModal(`<div class="between"><div><h2 style="margin:0">주문 ${safe(order.order_no)} 문서 출력</h2><div class="muted">출력 양식을 선택하세요. 데이터는 인쇄 전용이며 주문에 저장되지 않습니다.</div></div><button type="button" class="btn light" onclick="closeModal()">닫기</button></div>
<div class="panel"><div class="field"><label for="doc-type">양식 선택</label><select id="doc-type" onchange="toggleOrderDocumentType()"><option value="transaction">거래명세표 (금액·부가세 포함)</option><option value="delivery">납품명세표 (상품·수량만)</option></select></div><div class="formgrid" style="margin-top:14px">${sellerHtml}</div>
<label style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12px"><input type="checkbox" id="doc-save-profile">공급자 정보를 이 브라우저에 저장(공용 PC에서는 선택하지 마세요)</label></div>
<div class="panel" id="doc-price-panel"><h3 style="margin:0 0 8px">상품별 실제 거래 단가·과세 확인</h3>
<div class="muted">기본 입력값은 현재 상품관리 판매가격입니다. 주문 당시 가격·할인·과세 여부가 자동 저장된 값이 아닙니다. 실제 거래내용에 맞게 확인·수정하세요.</div>
<div class="tablewrap"><table class="table" style="min-width:520px"><thead><tr><th>상품명</th><th>수량</th><th>단가(원)</th><th>과세 유형</th></tr></thead><tbody>${lineHtml}</tbody></table></div>
<label style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12px"><input type="checkbox" id="doc-prices-confirmed">실제 거래 단가와 과세 구분을 확인했습니다.</label></div>
<div class="toolbar" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn light" onclick="closeModal()">취소</button><button type="button" class="btn primary" onclick="printChosenOrderDocument()">인쇄 / PDF 저장</button></div>`);
  }
  function toggleType(){
    const panel=document.getElementById("doc-price-panel");
    if(panel)panel.hidden=document.getElementById("doc-type")?.value==="delivery";
  }
  function printChosen(){
    const draft=window.__orderDocumentDraft,order=(window.state?.orders||[]).find(x=>String(x.id)===draft?.orderId);
    if(!order){window.toast("주문을 다시 열어주세요.");return;}
    const type=document.getElementById("doc-type")?.value;
    if(!["transaction","delivery"].includes(type)){window.toast("출력 양식을 선택해주세요.");return;}
    const seller={};
    for(const key of ["name","number","owner","address","contact"])seller[key]=document.getElementById("doc-seller-"+key)?.value.trim()||"";
    if(!seller.name){window.toast("공급자 상호를 입력해주세요.");return;}
    const items=Array.isArray(order.order_items)?order.order_items:[];
    let data={rows:items.map(i=>({name:i.product_name_snapshot||i.kit_name||"상품명 없음",quantity:i.quantity}))};
    if(type==="transaction"){
      if(!document.getElementById("doc-prices-confirmed")?.checked){window.toast("거래 단가와 과세 구분을 확인해 주세요.");return;}
      try{
        data=calculateRows(items.map((i,index)=>({...data.rows[index],unitPrice:document.getElementById("doc-price-"+index)?.value??"",taxType:document.getElementById("doc-tax-"+index)?.value})));
      }catch(error){window.toast(error.message);return;}
    }
    if(document.getElementById("doc-save-profile")?.checked){
      try{localStorage.setItem(profileKey,JSON.stringify(seller));}catch{window.toast("공급자 정보 저장에 실패했습니다. 출력은 진행합니다.");}
    }
    const doc={
      ...data,type,seller,
      buyer:{name:order.customer_name,manager:order.manager_name,contact:order.contact,address:order.address},
      orderNo:order.order_no,date:new Date().toLocaleDateString("sv-SE"),shipDate:order.ship_date,note:order.note
    };
    const printWindow=window.open("","_blank","width=960,height=780");
    if(!printWindow){window.toast("팝업이 차단되었습니다. 팝업을 허용한 후 다시 시도해주세요.");return;}
    printWindow.opener=null;
    printWindow.document.open();printWindow.document.write(renderDocument(doc));printWindow.document.close();
    printWindow.addEventListener("load",()=>{printWindow.focus();printWindow.print();},{once:true});
  }
  window.IrounOrderDocuments={calculateRows,renderDocument};
  window.openOrderDocumentChooser=openChooser;
  window.toggleOrderDocumentType=toggleType;
  window.printChosenOrderDocument=printChosen;
})();
