'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/material_inventory_ui.js'),'utf8');
const bindSource=source.slice(source.indexOf('function bindSave('),source.indexOf('const pendingRequests='));
function setup(){let closed=0,rendered=0;const nodes={};for(const id of ['mi-form','mi-submit','mi-close','mi-error','modal'])nodes[id]={disabled:false,textContent:'',addEventListener(){},removeEventListener(){}};const context={q:id=>nodes[id],crypto:{randomUUID:()=> 'request-id'},toast(){},closeModal(){closed++},state:{page:'materials'},window:{async renderMaterialInventory(){rendered++}}};vm.createContext(context);vm.runInContext(bindSource,context);return {nodes,context,counts:()=>({closed,rendered})};}
(async()=>{
 for(const reject of [false,true]){
  const s=setup();let finish;const wait=new Promise((resolve,rejectFn)=>finish=reject?()=>rejectFn(Error('network')):resolve);
  s.context.bindSave(()=>wait);const old=s.nodes['mi-form'];const pending=old.onsubmit({preventDefault(){}});
  for(const id of ['mi-form','mi-submit','mi-close','mi-error'])s.nodes[id]={disabled:false,textContent:'new'};
  finish();await pending;
  assert.equal(s.nodes['mi-error'].textContent,'new');assert.equal(s.nodes['mi-submit'].disabled,false);assert.deepEqual(s.counts(),{closed:0,rendered:0});
 }
 const s=setup();let calls=0,finish;const wait=new Promise(r=>finish=r);s.context.bindSave(()=>{calls++;return wait;});const event={preventDefault(){}};const pending=s.nodes['mi-form'].onsubmit(event);await s.nodes['mi-form'].onsubmit(event);assert.equal(calls,1);finish();await pending;assert.deepEqual(s.counts(),{closed:1,rendered:1});
 console.log('3 modal lifecycle tests passed (new modal success/error isolation, double click)');
})().catch(e=>{console.error(e);process.exit(1)});
