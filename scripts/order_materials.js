(function(root){
  'use strict';
  // Printing only. Never use these quantities to deduct stock or alter orders.
  const source = '12차시 재료 픽스 26 10 14 업데이트.pdf';
  const dough5 = ['흰','노','빨','검','초'].map(color=>['생과자 '+color+'색 (15g)',1,'봉']);
  const dough4 = dough5.slice(0,4);
  const topping = ['3종 토핑 (각 5g)',1,'세트'];
  const recipes = Object.freeze({
    '뻥스케이크': {ingredients:[['쌀과자',2],topping,['마시멜로우 잼 (40g)',1,'봉']],supplies:[['교안(토퍼·꼬깔 + 이쑤시개 3개) OPP',1]]},
    '화과자': {ingredients:[['미니양갱',2],...dough5,['참기름',1]],supplies:[['우드스틱',1]]},
    '튀밥강정': {ingredients:[['튀밥 (14g)',1,'봉'],['조청 (30g)',1,'봉'],['견과류 믹스 (20g)',1,'봉'],['참기름',1]],supplies:[['소주컵',1],['수저',1],['종이용기',1]]},
    '초코스틱': {ingredients:[['막대과자 (25g)',1,'봉'],['화이트컴파운드초콜릿 (40g)',1,'봉'],topping,['초코펜',1]],supplies:[['수저',1],['종이컵',1],['A4유산지',1,'장']]},
    '경단': {ingredients:[['경단믹스 (30g)',1,'봉'],['미니양갱',2],['참기름',1],['콩가루 (15g)',1,'봉']],supplies:[['계량컵 (30mL)',1],['수저',1],['종이용기',1]]},
    '글자생과자': {ingredients:[...dough5,['크래커',1,'봉'],['참기름',1]],supplies:[['우드스틱',1]]},
    '캐릭터생과자': {ingredients:[...dough5,['크래커',1,'봉'],['참기름',1]],supplies:[['우드스틱',1]]},
    '도넛': {ingredients:[['미니도넛',4],topping,['슈가파우더 (20g)',1,'봉'],['초코펜 (랜덤 1종)',1]],supplies:[['계량물통',1],['수저',1],['종이컵',1],['A4유산지',1,'장']]},
    '감정컵케이크': {ingredients:[['머핀',1],...dough4,['마시멜로우 잼 (40g)',1,'봉'],['참기름',1]],supplies:[['칼',1],['9온즈컵',1],['수저',1]]},
    // Latest user-confirmed list overrides the historical PDF for this product.
    '식빵카나페': {confirmed:true,ingredients:[['식빵',1],['토마토',2],['치즈',1],['소세지',1],['피클',1],['마요네즈',1],['훈제계란',1]],supplies:[['수저',1],['칼',1]]},
    '과자집': {ingredients:[['웨하스(8개)',1],['집모양쿠키',2],['마시멜로우 잼 (15g)',1,'봉'],['3종 토핑·마시멜로우·곰돌이쿠키 묶음',1,'세트']],supplies:[]},
    '감자샐러드샌드위치': {ingredients:[['모닝빵',2],['감자샐러드가루 (10g)',1,'봉'],['마요네즈 (12g)',1],['훈제계란',1],['소세지',1],['피클 (30g)',1]],supplies:[['계량컵 (30mL)',1],['칼',1],['수저',1],['종이용기',1]]}
  });
  const aliases = Object.freeze({'감자샐러드':'감자샐러드샌드위치','표정컵케이크':'감정컵케이크','글자/캐릭터생과자':'글자생과자'});
  const commonSupplies = [['장갑',1],['접시',1]];
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function calculate(item){
    const name=String(item.product_name_snapshot||item.kit_name||item.name||'상품명 미상');
    const quantity=Number(item.quantity);
    const key=name.replace(/\s/g,'');
    const canonical=Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:key;
    const recipe=Object.prototype.hasOwnProperty.call(recipes,canonical)?recipes[canonical]:null;
    if(!Number.isSafeInteger(quantity)||quantity<=0)
      return {name,quantity,registered:false,reason:'수량 확인 필요'};
    if(!recipe)return {name,quantity,registered:false,reason:'세부 구성 미등록'};
    if(![...recipe.ingredients,...recipe.supplies].every(row=>Number.isSafeInteger(row[1]*quantity)))
      return {name,quantity,registered:false,reason:'수량 범위 초과'};
    const expand=rows=>rows.map(([name,perKit,unit='개'])=>({name,quantity:perKit*quantity,unit}));
    return {name,quantity,registered:true,confirmed:!!recipe.confirmed,source,ingredients:expand(recipe.ingredients),
      supplies:[...expand(recipe.supplies),...expand(commonSupplies),{name:'식탁보(4인)',quantity:Math.ceil(quantity/4),unit:'개'}]};
  }
  function productKey(item){const key=String(item.product_name_snapshot||item.kit_name||item.name||'').replace(/\s/g,'');return Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:key;}
  function duplicated(item,items){return (items||[]).filter(other=>productKey(other)===productKey(item)).length>1;}
  const duplicateWarning='동일 종류 중복 행: 식탁보 합산 확인 필요 (자동 수량 미표시)';
  function render(item,items){
    const result=calculate(item);
    if(!result.registered)return '<div class="material-missing">'+safe(result.reason)+'</div>';
    const duplicate=duplicated(item,items);
    const supplies=duplicate?result.supplies.filter(r=>r.name!=='식탁보(4인)'):result.supplies;
    const line=rows=>rows.map(r=>safe(r.name)+' '+r.quantity.toLocaleString('ko-KR')+r.unit).join(' · ');
    const note=(result.confirmed?'사용자 확인 구성':'2026-10-14 자료 기준 · 최신 구성 확인 필요')+' / 공통 일회용품: 키트 종류별 별도 계산';
    return '<div class="material-details"><div><b>재료:</b> '+line(result.ingredients)+'</div><div><b>일회용품:</b> '+line(supplies)+(duplicate?' · <b>'+duplicateWarning+'</b>':'')+'</div><div class="material-source">'+safe(note)+'</div></div>';
  }
  const packingCss = '.packing-section{margin-top:22px;font-size:16px;line-height:1.5;color:#000}.packing-cut{border-top:2px dashed #222;padding-top:7px;font-size:14px;break-after:avoid}.packing-title{font-size:22px;margin:10px 0 4px;letter-spacing:0;text-align:left}.packing-note{font-size:13px;margin:4px 0 10px}.packing-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0 18px}.packing-table thead{display:table-header-group}.packing-table th,.packing-table td{padding:7px 9px;border:1px solid #555;font-size:16px;line-height:1.5;text-align:left;font-weight:400;overflow-wrap:anywhere}.packing-table th{font-weight:700;background:#f5f5f5}.packing-table .packing-id{font-size:14px}.packing-table tr{break-inside:avoid;page-break-inside:avoid}.packing-table .packing-box{display:inline-block;width:13px;height:13px;border:1.5px solid #000;margin-right:7px;vertical-align:middle}.packing-source{font-size:12px;font-weight:400}.packing-table .packing-category{font-size:16px}.packing-section{break-inside:auto;page-break-inside:auto}';
  function renderPacking(items,order){
    order=order||{};
    const identity='주문 '+String(order.orderNo||'-')+' · '+String(order.customer||'-')+' · 발송 '+String(order.shipDate||'-');
    const cell=r=>r?'<span class="packing-box" aria-hidden="true"></span>'+safe(r.name)+' <b>'+r.quantity.toLocaleString('ko-KR')+safe(r.unit)+'</b>':'';
    const tables=(items||[]).map(item=>{
      const r=calculate(item);
      const duplicate=duplicated(item,items);
      if(r.registered&&duplicate)r.supplies=r.supplies.filter(r=>r.name!=='식탁보(4인)');
      const heading='<thead><tr><th colspan="2" class="packing-id">포장 확인용 · '+safe(identity)+'</th></tr><tr><th colspan="2">'+safe(r.name)+' '+safe(r.quantity)+'개'+(r.registered&&!r.confirmed?'<div class="packing-source">2026-10-14 자료 기준 · 최신 구성 확인 필요</div>':'')+'</th></tr><tr><th class="packing-category">재료 확인</th><th class="packing-category">일회용품 확인</th></tr></thead>';
      let rows='';
      if(!r.registered)rows='<tr><td colspan="2">'+safe(r.reason)+'</td></tr>';
      else for(let i=0;i<Math.max(r.ingredients.length,r.supplies.length);i++)rows+='<tr><td>'+cell(r.ingredients[i])+'</td><td>'+cell(r.supplies[i])+'</td></tr>';
      if(r.registered&&duplicate)rows+='<tr><td colspan="2"><b>'+duplicateWarning+'</b></td></tr>';
      return '<table class="packing-table">'+heading+'<tbody>'+rows+'</tbody></table>';
    }).join('');
    return '<section class="packing-section"><div class="packing-cut">절취선 · 아래는 포장 확인용으로 분리하여 보관</div><h2 class="packing-title">포장 확인 체크리스트</h2><p class="packing-note">'+safe(identity)+'<br>공통 일회용품은 키트 종류별 별도 계산합니다. 다음 장으로 이어지면 해당 주문의 포장 확인용 페이지를 함께 보관하세요.</p>'+tables+'</section>';
  }
  const api={calculate,render,renderPacking,packingCss};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.IrounOrderMaterials=api;
})(typeof window!=='undefined'?window:globalThis);
