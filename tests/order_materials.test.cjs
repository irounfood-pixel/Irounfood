const fs=require('fs'),vm=require('vm'),assert=require('assert');
const m=require('../scripts/order_materials.js');
const r=m.calculate({name:'식빵카나페',quantity:30});
assert.equal(r.ingredients.find(x=>x.name==='토마토').quantity,60);
assert.equal(r.supplies.at(-1).quantity,8);
assert.equal(r.ingredients.find(x=>x.name==='훈제계란').quantity,30);
for(const [q,n] of [[1,1],[4,1],[5,2],[31,8],[32,8],[33,9]]) assert.equal(m.calculate({name:'식빵카나페',quantity:q}).supplies.at(-1).quantity,n);
assert.equal(m.calculate({name:'미등록상품',quantity:30}).registered,false);
assert.equal(m.calculate({name:'식빵카나페',quantity:-1}).registered,false);
assert.equal(m.calculate({name:'식빵카나페',quantity:1.5}).registered,false);
const context={window:{},IrounOrderMaterials:m,console};vm.createContext(context);vm.runInContext(fs.readFileSync('scripts/order_documents.js','utf8'),context);
const docs=context.window.IrounOrderDocuments;
let priced=docs.calculateRows([{name:'식빵카나페',quantity:30,unitPrice:4700,taxType:'included',materialsHtml:m.render({name:'식빵카나페',quantity:30})}]);
assert.equal(priced.total,141000);assert(priced.rows[0].materialsHtml.includes('토마토 60개'));
fs.mkdirSync('qa',{recursive:true});
for(const type of ['transaction','delivery']) fs.writeFileSync('qa/'+type+'.html',docs.renderDocument({...priced,type,orderNo:'TEST',seller:{name:'테스트'},buyer:{name:'검증'},note:'테스트 출력'}));
const html=require('./read-admin.cjs')();
const part=html.slice(html.indexOf('function calendarStatementsHtml('),html.indexOf('function printCalendarStatements('));
Object.assign(context,{esc:v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;'),fmt:v=>Number(v).toLocaleString('ko-KR')});
vm.runInContext(part,context);
const make=(n,items)=>({order_no:n,customer_name:'검증 기관',manager_name:'수령인',address:'주소 확인 테스트',contact:'테스트 연락처',note:'요청사항 확인',order_items:items});
const item={product_name_snapshot:'식빵카나페',quantity:30};
fs.writeFileSync('qa/calendar.html',context.calendarStatementsHtml('2026-11-16',[make('A',[item]),make('B',[item]),make('C',Array.from({length:12},()=>item)),make('D',[{product_name_snapshot:'과자집',quantity:25}])]));
console.log('Pure calculations, invalid/missing composition, both document paths and unchanged money totals passed.');
// Structural print regression checks (not a substitute for browser print preview).
for(const [type,span] of [['transaction',7],['delivery',3]]){
 const output=docs.renderDocument({...priced,type});
 assert(output.includes('class="packing-section"'));
 assert(output.includes("<tr class='material-row'><td colspan='"+span+"'>"));
 assert(output.indexOf('class="packing-section"')>output.indexOf('class="foot"'));
 assert(!output.includes('식빵카나페<div class="material-details">'));
 assert(output.includes('.item-row{break-after:avoid;page-break-after:avoid}'));
 const many=docs.renderDocument({...priced,type,rows:Array.from({length:40},()=>priced.rows[0])});
 assert.equal((many.match(/class="packing-table"/g)||[]).length,40);
 assert.equal((many.match(/토마토 <b>60개/g)||[]).length,40);
}
const calendar=fs.readFileSync('qa/calendar.html','utf8');
assert.equal((calendar.match(/class="packing-table"/g)||[]).length,15);
assert(calendar.includes('class="packing-cut"'));
assert.equal((calendar.match(/class="material-row"/g)||[]).length,15);
assert.equal((calendar.match(/class="print-page"/g)||[]).length,4);
assert(calendar.includes('break-after:page;page-break-after:always'));
assert(calendar.includes('min-height:0;height:auto;break-inside:auto'));
assert(!calendar.includes('fitStatements'));
assert(!calendar.includes('138mm'));
assert(!calendar.includes('scale('));
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const match of calendar.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
console.log('Detachable packing sections, all 40 product lists preserved, one-order-per-page wrappers, no scaling, natural pagination and inline syntax passed.');
const names=['뻥스케이크','화과자','튀밥강정','초코스틱','경단','글자생과자','캐릭터생과자','도넛','감정컵케이크','식빵카나페','과자집','감자샐러드샌드위치'];
for(const name of names){
 const c=m.calculate({name,quantity:30});
 assert(c.registered,name);
 for(const common of ['장갑','접시'])assert.equal(c.supplies.filter(x=>x.name===common).length,1);
 assert.equal(c.supplies.find(x=>x.name==='장갑').quantity,30);
 assert.equal(c.supplies.find(x=>x.name==='접시').quantity,30);
 assert.equal(c.supplies.find(x=>x.name==='식탁보(4인)').quantity,8);
 assert.equal(c.confirmed,name==='식빵카나페');
}
assert.equal(m.calculate({name:'과자집',quantity:30}).ingredients.find(x=>x.name==='웨하스(8개)').quantity,30);
assert.equal(m.calculate({name:'도넛',quantity:30}).ingredients.find(x=>x.name==='미니도넛').quantity,120);
assert.equal(m.calculate({name:'화과자',quantity:30}).ingredients.filter(x=>x.name.startsWith('생과자')).length,5);
assert.equal(m.calculate({name:'감정컵케이크',quantity:30}).ingredients.filter(x=>x.name.startsWith('생과자')).length,3);
assert.equal(m.calculate({name:'과자집',quantity:Number.MAX_SAFE_INTEGER}).reason,'수량 범위 초과');
assert.equal(m.calculate({name:'__proto__',quantity:30}).registered,false);
assert.equal(m.calculate({name:'constructor',quantity:30}).registered,false);
assert(m.render({name:'과자집',quantity:30}).includes('최신 구성 확인 필요'));
assert(m.render({name:'식빵카나페',quantity:30}).includes('사용자 확인 구성'));
assert(m.render({name:'식빵카나페',quantity:30}).includes('키트 종류별 별도 계산'));
fs.writeFileSync('qa/all-products.html',docs.renderDocument({type:'delivery',rows:names.map(name=>({name,quantity:30,materialsHtml:m.render({name,quantity:30})}))}));
console.log('All 12 products, source status, shared supplies, portion labels, overflow and hostile names passed.');
for(const [name,grams] of [['뻥스케이크',40],['감정컵케이크',40],['과자집',15]]){
 const jams=m.calculate({name,quantity:30}).ingredients.filter(x=>x.name.includes('잼'));
 assert.equal(jams.length,1);assert(jams[0].name.includes('('+grams+'g)'));assert.equal(jams[0].quantity,30);
}
assert.equal(m.calculate({name:'크리스마스과자집',quantity:30}).registered,false);
console.log('40g/15g jam variants separated; unverified seasonal variant not inferred.');
const separateTypes=['식빵카나페','도넛'].map(name=>m.calculate({name,quantity:5}));
assert.equal(separateTypes.reduce((n,r)=>n+r.supplies.find(s=>s.name==='식탁보(4인)').quantity,0),4);
assert.notEqual(separateTypes.reduce((n,r)=>n+r.supplies.find(s=>s.name==='식탁보(4인)').quantity,0),Math.ceil(10/4));
assert(!m.render({name:'도넛',quantity:5}).includes('중복 확인'));
console.log('Separate kit-type rounding verified: 5+5 kits => 2+2 tablecloths, not pooled 3.');

const oneOrder=context.calendarStatementsHtml('2026-11-16',[make('SINGLE',[item])]);
assert.equal((oneOrder.match(/class="print-page"/g)||[]).length,1);
assert(!oneOrder.includes('fitStatements'));
for(const type of ['transaction','delivery']){const output=docs.renderDocument({...priced,type});assert(output.includes('@page{size:A4 portrait'));assert(!output.includes('scale('));assert(!output.includes('overflow:hidden'));}
console.log('Single and batch calendar + both full A4 document modes verified structurally.');

const packing=m.renderPacking([{name:'식빵카나페',quantity:30}],{orderNo:'PACK-001',customer:'검증기관',shipDate:'검증일'});
assert.equal((packing.match(/class="packing-box"/g)||[]).length,12);
assert(packing.includes('주문 PACK-001 · 검증기관 · 발송 검증일'));
assert(packing.includes('다음 장으로 이어지면'));
assert(m.packingCss.includes('font-size:16px'));
assert(m.packingCss.includes('thead{display:table-header-group}'));
console.log('Detachable cut line, 12 checkboxes, larger type, repeated identity header and continuation note passed.');

console.log("Both compact customer details and detachable large packing sections retained across all paths.");

const donut=m.calculate({name:'도넛',quantity:30});
assert.equal(donut.ingredients.find(r=>r.name==='초코펜 (랜덤 1종)').quantity,30);
assert.equal(donut.supplies.filter(r=>r.name==='종이컵').length,1);
assert.equal(donut.supplies.find(r=>r.name==='종이컵').quantity,30);
const puff=m.calculate({name:'뻥스케이크',quantity:30});
assert.equal(puff.supplies.find(r=>r.name==='교안(토퍼·꼬깔 + 이쑤시개 4개) OPP').quantity,30);
assert(!puff.supplies.some(r=>r.name==='이쑤시개'));
const dumpling=m.calculate({name:'경단',quantity:30});
assert.equal(dumpling.supplies.find(r=>r.name==='계량컵 (30mL)').quantity,30);
assert(!dumpling.supplies.some(r=>r.name==='계량물통'));
for(const [name,label] of [['도넛','초코펜 (랜덤 1종)'],['뻥스케이크','이쑤시개'],['경단','계량컵 (30mL)']]){
 assert(m.render({name,quantity:30}).includes(label));
 assert(m.renderPacking([{name,quantity:30}],{}).includes(label));
}
console.log('Latest three product corrections verified in both compact and packing sections; donut cups not duplicated.');

const house60=m.calculate({name:'과자집',quantity:60});
assert.equal(house60.ingredients.find(x=>x.name==='웨하스(8개)').quantity,60);
assert(m.render({name:'과자집',quantity:60}).includes('웨하스(8개) 60개'));
assert(m.renderPacking([{name:'과자집',quantity:60}],{}).includes('웨하스(8개) <b>60개</b>'));
assert(!house60.ingredients.some(x=>x.name==='웨하스'));
console.log('Wafer bundle verified: 60 house kits => 웨하스(8개) 60개, not loose-piece count.');

const puff60=m.calculate({name:'뻥스케이크',quantity:60});
assert.equal(puff60.supplies.find(r=>r.name==='교안(토퍼·꼬깔 + 이쑤시개 4개) OPP').quantity,60);
assert(!puff60.supplies.some(r=>r.name==='이쑤시개'));
assert(m.render({name:'뻥스케이크',quantity:60}).includes('교안(토퍼·꼬깔 + 이쑤시개 4개) OPP 60개'));
assert(m.renderPacking([{name:'뻥스케이크',quantity:60}],{}).includes('교안(토퍼·꼬깔 + 이쑤시개 4개) OPP <b>60개</b>'));
console.log('Topper/cone/toothpick OPP bundle: 60 kits => 60 packs; no duplicate toothpick item.');

for(const name of names){
 const compact=m.render({name,quantity:60});
 const pack=m.renderPacking([{name,quantity:60}],{});
 assert(!compact.includes('45g'));assert(!pack.includes('45g'));
}
assert(m.render({name:'뻥스케이크',quantity:60}).includes('마시멜로우 잼 (40g) 60봉'));
assert(m.render({name:'과자집',quantity:60}).includes('마시멜로우 잼 (15g) 60봉'));
console.log('All registered products: no 45g jam in either output; 40g replacements and 15g unchanged verified.');

const sandwich=m.calculate({name:'감자샐러드샌드위치',quantity:30});
assert.equal(sandwich.supplies.find(r=>r.name==='계량컵 (30mL)').quantity,30);
assert(!sandwich.supplies.some(r=>r.name==='계량물통'));
for(const out of [m.render({name:'감자샐러드샌드위치',quantity:30}),m.renderPacking([{name:'감자샐러드샌드위치',quantity:30}],{})]){
 assert(out.includes('계량컵 (30mL)'));assert(!out.includes('계량물통'));
}
assert(m.calculate({name:'도넛',quantity:30}).supplies.some(r=>r.name==='계량물통'));
console.log('Sandwich measuring cup corrected to30mL one per kit in both sections; unrelated donut container unchanged.');

for(const name of ['과일모찌','디자인쿠키'])assert.equal(m.calculate({name,quantity:30}).registered,false);
const dup=[{name:'식빵카나페',quantity:1},{name:'식빵카나페',quantity:3}];
assert(m.render(dup[0],dup).includes('식탁보 합산 확인 필요'));
assert(!m.render(dup[0],dup).includes('식탁보(4인)'));
const dupPacking=m.renderPacking(dup,{orderNo:'DUP'});
assert(dupPacking.includes('자동 수량 미표시'));
assert(!dupPacking.includes('식탁보(4인)'));
assert(m.render({name:'도넛',quantity:5},[{name:'도넛',quantity:5},{name:'과자집',quantity:5}]).includes('식탁보(4인) 2개'));
console.log('Duplicate same-type lines: tablecloth automatic count suppressed with explicit warning; other types unaffected.');


for(const name of ['감정컵케이크','표정컵케이크']){
 for(const quantity of [1,30]){
  const dough=m.calculate({name,quantity}).ingredients.filter(x=>x.name.startsWith('생과자'));
  assert.deepStrictEqual(dough,['흰색','빨강','갈색'].map(color=>({name:'생과자 '+color+' (15g)',quantity,unit:'봉'})));
  for(const output of [m.render({name,quantity}),m.renderPacking([{name,quantity}],{})]){
   for(const color of ['흰색','빨강','갈색'])assert(output.includes('생과자 '+color+' (15g)'));
   for(const color of ['노색','검색','초색'])assert(!output.includes('생과자 '+color));
  }
 }
}
console.log('Cupcake and alias: three 15g dough portions, white/red/brown, one per kit; compact and packing outputs passed.');
