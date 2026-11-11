const assert=require('node:assert/strict'),I=require('../scripts/admin_order_import_core.js');
const p=[{id:'a',name:'화과자',active:true,inventory_item_id:'i',deduction_qty:1},{id:'b',name:'과자집',active:true,inventory_item_id:'i',deduction_qty:1}];
const row=(group='',name='화과자',qty=10)=>[group,'','2026-11-05','시험기관','수령인','01000000000','방문장소','',name,qty,'','해당없음'];
let x=I.parse([I.headers,row('1'),row('1','과자집'),row('', '과자집')],p,'2026-11-03');assert.equal(x.errors.length,0);assert.equal(x.orders.length,2);assert.equal(x.orders[0].items.length,2);assert.equal(x.orders[0].receive_method,'방문수령');assert.equal(x.orders[0].order_date,'2026-11-03');
let r=row('1');r[6]='다른 장소';assert.ok(I.parse([I.headers,row('1'),r],p,'2026-11-03').errors.some(s=>s.includes('다릅니다')));
x=I.parse([I.headers,row(),row()],p,'2026-11-03');assert.equal(x.orders.length,2,'blank group rows separate');
x=I.parse([I.headers,row('1'),row('1')],p,'2026-11-03');assert.equal(x.orders[0].items[0].quantity,20);
for(const [col,value] of [[2,'2026-02-30'],[7,'배달'],[8,'화과쟈'],[9,1.5],[9,0],[5,1000000000]]){const a=row();a[col]=value;assert.ok(I.parse([I.headers,a],p,'2026-11-03').errors.length,String(value));}
assert.ok(I.parse([I.headers,...Array.from({length:501},()=>row())],p,'2026-11-03').errors.length);
assert.ok(I.parse([I.headers,row('1','화과자',600),row('1','화과자',600)],p,'2026-11-03').errors.length);
assert.ok(!('label' in I.payload(x.orders)[0]));assert.ok(!('name' in I.payload(x.orders)[0].items[0]));
console.log('PASS: group identity, blank separation, conflicting headers, pickup/date defaults, exact product, quantity/date/contact errors, row limits, clean payload');


let ml=row();ml[11]='ML';x=I.parse([I.headers,ml],p,'2026-11-03');assert.equal(x.errors.length,0);assert.equal(I.payload(x.orders)[0].partner_type,'ML');
let missing=row();missing[11]='';assert.ok(I.parse([I.headers,missing],p,'2026-11-03').errors.length);
x=I.parse([I.headers.slice(0,11),row().slice(0,11)],p,'2026-11-03');assert.equal(x.errors.length,0);assert.equal(x.orders[0].partner_type,'해당없음');
ml[0]='1';assert.ok(I.parse([I.headers,row('1'),ml],p,'2026-11-03').errors.some(s=>s.includes('다릅니다')));
console.log('PASS: explicit ML import, required new column, legacy template compatibility, mixed classification rejected');
