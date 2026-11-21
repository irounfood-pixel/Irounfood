const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const d=new JSDOM('<div id="page"></div><div id="modal"><div id="box"></div></div>',{runScripts:'outside-only',url:'https://test.invalid'}),w=d.window,q=id=>w.document.getElementById(id);
 w.state={page:'materials'};w.esc=s=>String(s).replace(/[&<>"']/g,'');w.openModal=s=>q('box').innerHTML=s;w.closeModal=()=>q('box').innerHTML='';w.toast=()=>{};let confirmed=false;w.confirm=()=>confirmed;
 let calls=0;const item={id:'a',kind:'raw',name:'Test',unit:'kg',version:1,qty:null,reserved:0};
 w.db={from(t){const c={select:()=>c,order:()=>c,eq:()=>c,limit:()=>c,then:f=>Promise.resolve({data:t==='stock2_items'?[item]:[]}).then(f)};return c;},rpc:async(n,a)=>{calls++;assert.equal(n,'stock2_import_stocktake');assert.equal(a.p_rows[0].qty,0);return {data:'ok'}}};
 w.XLSX={read:()=>({})};w.eval(fs.readFileSync('scripts/inventory_planner.js','utf8'));w.eval(fs.readFileSync('scripts/material_inventory_ui.js','utf8'));w.InventoryExcel={read:()=>[{id:'a',unit:'kg',version:1,qty:0,note:'',name:'Test',before:null}]};
 await w.renderMaterialInventory();q('mi-record').click();q('mi-record-method').value='excel';q('mi-record-method').dispatchEvent(new w.Event('change'));assert.ok(q('mi-file-download'));assert.equal(q('mi-submit').disabled,true);
 Object.defineProperty(q('mi-file'),'files',{value:[{name:'test.xlsx',size:100,arrayBuffer:async()=>new ArrayBuffer(1)}]});await q('mi-file').onchange();assert.equal(calls,0);assert.match(q('mi-preview').textContent,/1개 품목/);
 await q('mi-form').onsubmit({preventDefault(){}});assert.equal(calls,0);confirmed=true;await q('mi-form').onsubmit({preventDefault(){}});assert.equal(calls,1);assert.equal(item.qty,null);
 console.log('Excel UI: preview no-write, cancel no-write, confirmed RPC, untouched fixture passed');
})().catch(e=>{console.error(e);process.exit(1)});
