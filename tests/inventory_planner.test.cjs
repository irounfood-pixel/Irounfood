'use strict';
const assert=require('node:assert/strict');
const p=require('../scripts/inventory_planner.js');
const item=(id,kind,stock,unit='개',extra={})=>({id,kind,stock,unit,...extra});
const recipe=(parentId,lines,yieldQty=1,status='confirmed')=>({parentId,lines:Object.entries(lines).map(([itemId,qty])=>({itemId,qty})),yieldQty,status});
const tests=[];function test(name,fn){tests.push([name,fn]);}
test('immediate capacity includes raw, semi and shared disposables',()=>{
 const items=[item('p','product',0),item('s','semi',20),item('spoon','raw',15)];
 assert.equal(p.capacity(items,[recipe('p',{s:2,spoon:1})],'p').qty,10);
});
test('reserve stock reduces capacity',()=>{
 const items=[item('p','product',0),item('s','semi',20,'개',{reserved:6})];
 assert.equal(p.capacity(items,[recipe('p',{s:2})],'p').qty,7);
});
test('unknown is not zero and capacity ignores finished stock',()=>{
 const items=[item('p','product',null),item('s','semi',null)];
 assert.equal(p.capacity(items,[recipe('p',{s:2})],'p').qty,null);
 items[1].stock=4;
 assert.equal(p.capacity(items,[recipe('p',{s:2})],'p').qty,2);
 assert.equal(p.plan(items,[recipe('p',{s:2})],[{itemId:'p',qty:1}]).feasible,null);
});
test('shared raw across semi branches is not counted twice',()=>{
 const items=[item('p','product',0),item('a','semi',0),item('b','semi',0),item('raw','raw',1,'kg')];
 const recipes=[recipe('p',{a:1,b:1}),recipe('a',{raw:.3}),recipe('b',{raw:.3})];
 assert.equal(p.capacity(items,recipes,'p',{mode:'immediate'}).qty,0);
 assert.equal(p.capacity(items,recipes,'p',{mode:'recursive'}).qty,1);
 const r=p.plan(items,recipes,[{itemId:'p',qty:2}],{mode:'recursive'});
 assert.equal(r.feasible,false);assert.equal(r.shortages[0].qty,.2);
});
test('mixed demand consumes shared stock once',()=>{
 const items=[item('p','product',0),item('q','product',0),item('r','raw',10)];
 const recipes=[recipe('p',{r:2}),recipe('q',{r:3})];
 const r=p.plan(items,recipes,[{itemId:'p',qty:3},{itemId:'q',qty:2}]);
 assert.equal(r.feasible,false);assert.equal(r.required[0].qty,12);assert.equal(r.shortages[0].qty,2);
});
test('duplicate recipe lines aggregate, not min independent',()=>{
 const items=[item('p','product',0),item('r','raw',6)];
 const recipes=[{parentId:'p',yieldQty:1,status:'confirmed',lines:[{itemId:'r',qty:2},{itemId:'r',qty:2}]}];
 assert.equal(p.capacity(items,recipes,'p').qty,1);
});
test('full batch output and leftovers reused',()=>{
 const items=[item('p','product',0),item('q','product',0),item('s','semi',0),item('r','raw',1,'kg')];
 const recipes=[recipe('p',{s:1}),recipe('q',{s:1}),recipe('s',{r:1},10)];
 const r=p.plan(items,recipes,[{itemId:'p',qty:4},{itemId:'q',qty:6}],{mode:'recursive'});
 assert.equal(r.feasible,true);assert.equal(r.used.find(x=>x.itemId==='r').qty,1);
 assert.equal(r.produced.find(x=>x.itemId==='s').qty,10);
});
test('finished stock counts in demand not new-production capacity',()=>{
 const items=[item('p','product',5),item('r','raw',2)];const recipes=[recipe('p',{r:1})];
 assert.equal(p.plan(items,recipes,[{itemId:'p',qty:7}]).feasible,true);
 assert.equal(p.capacity(items,recipes,'p').qty,2);
});
test('draft and missing recipes cannot produce',()=>{
 const items=[item('p','product',0),item('r','raw',20)];
 assert.equal(p.capacity(items,[],'p').status,'unknown');
 assert.equal(p.capacity(items,[recipe('p',{r:null},null,'draft')],'p').status,'unknown');
});
test('estimated counts surfaced',()=>{
 const items=[item('p','product',0),item('r','raw',40,'개',{estimate:true})];
 assert.equal(p.capacity(items,[recipe('p',{r:1})],'p').status,'estimated');
});
test('invalid quantities, reservation and counts rejected',()=>{
 assert.ok(p.validate([item('r','raw',-1)],[]).length);
 assert.ok(p.validate([item('r','raw',1.5)],[]).length);
 assert.ok(p.validate([item('r','raw',1,'kg',{reserved:2})],[]).length);
 assert.ok(p.validate([item('p','product',0),item('r','raw',1)],[recipe('p',{r:.5})]).length);
});
test('cycles and wrong component kinds rejected',()=>{
 const items=[item('p','product',0),item('s','semi',0)];
 assert.ok(p.validate(items,[recipe('p',{s:1}),recipe('s',{p:1})]).some(x=>x.code==='RECIPE_CYCLE'));
});
test('unknown extra unrelated stock does not block feasible target',()=>{
 const items=[item('p','product',0),item('r','raw',3),item('u','raw',null)];
 assert.equal(p.capacity(items,[recipe('p',{r:1})],'p').qty,3);
});
test('kg float arithmetic and large cap',()=>{
 const items=[item('p','product',0),item('r','raw',.3,'kg')];
 assert.equal(p.capacity(items,[recipe('p',{r:.1})],'p').qty,3);
 assert.equal(p.capacity(items,[recipe('p',{r:.1})],'p',{maxBatches:2}).capped,true);
});
test('inputs never mutated and demand duplicates summed',()=>{
 const items=[item('p','product',1),item('r','raw',4)];const recipes=[recipe('p',{r:1})];
 const before=JSON.stringify({items,recipes});
 assert.equal(p.plan(items,recipes,[{itemId:'p',qty:2},{itemId:'p',qty:3}]).feasible,true);
 assert.equal(JSON.stringify({items,recipes}),before);
});
test('shared tablecloth rounds after aggregation per product',()=>{
 const items=[item('p','product',0),item('cloth','raw',2)];
 const recipes=[{parentId:'p',yieldQty:1,status:'confirmed',lines:[{itemId:'cloth',qty:.25,rounding:'ceil'}]}];
 assert.equal(p.capacity(items,recipes,'p').qty,8);
 assert.equal(p.plan(items,recipes,[{itemId:'p',qty:5}]).required[0].qty,2);
});
test('unknown recursive recipe beyond existing stock gives lower bound',()=>{
 const items=[item('p','product',0),item('s','semi',3)];
 const r=p.capacity(items,[recipe('p',{s:1})],'p',{mode:'recursive'});
 assert.equal(r.status,'lower_bound');assert.equal(r.qty,3);
 assert.equal(r.nextIssues[0].code,'MISSING_RECIPE');
});
test('bulk semi to portion semi with shared raw ledger',()=>{
 const items=[item('p','product',0),item('portion','semi',0),item('bulk','semi',0,'kg'),item('r','raw',.1,'kg')];
 const recipes=[recipe('p',{portion:1}),recipe('portion',{bulk:.015}),recipe('bulk',{r:1},1)];
 // Full 1kg bulk batch cannot be made from 100g; nothing invented by scaling.
 assert.equal(p.capacity(items,recipes,'p',{mode:'recursive'}).qty,0);
 items[3].stock=1;
 assert.equal(p.capacity(items,recipes,'p',{mode:'recursive'}).qty,66);
});
test('semifinished cycles rejected',()=>{
 const items=[item('a','semi',0),item('b','semi',0)];
 assert.ok(p.validate(items,[recipe('a',{b:1}),recipe('b',{a:1})]).some(x=>x.code==='RECIPE_CYCLE'));
});
let failed=0;for(const[name,fn]of tests){try{fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
assert.equal(failed,0);console.log(`${tests.length} tests passed`);
