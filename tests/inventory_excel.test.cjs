const assert=require('node:assert/strict'),api=require('../scripts/inventory_excel');
const items=[{id:'a',name:'Raw',kind:'raw',unit:'kg',qty:null,reserved:0,version:1},{id:'b',name:'Pack',kind:'semi',unit:'봉',qty:5,reserved:2,version:2}];
const row=(i,q)=>[i.id,{raw:'원재료·구매품',semi:'반제품'}[i.kind],i.name,i.unit,i.qty,q,'',i.version];
const run=rows=>api.validate([api.HEADERS,...rows],items);
assert.equal(run([row(items[0],0),row(items[1],null)])[0].qty,0);
assert.equal(run([row(items[0],.015)])[0].qty,.015);
for(const q of [-1,NaN,Infinity,1e9,'1',true,.0000001])assert.throws(()=>run([row(items[0],q)]));
assert.throws(()=>run([row(items[1],1)]));assert.throws(()=>run([row(items[1],2.5)]));
assert.throws(()=>run([row(items[0],1),row(items[0],2)]));
for(const [index,value] of [[0,'unknown'],[1,'wrong'],[2,'wrong'],[3,'g'],[7,0]]){const r=row(items[0],1);r[index]=value;assert.throws(()=>run([r]));}
assert.throws(()=>run([row(items[0],null)]));
console.log('Excel parser validations passed');
