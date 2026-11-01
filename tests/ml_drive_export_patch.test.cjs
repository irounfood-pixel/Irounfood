const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const patch=require('../scripts/patch_ml_drive_export.cjs');
const html="const ML_PHOTO_ENDPOINT='https://iqopdxrnkmpdivzndkxq.supabase.co/functions/v1/partner-photo-export';\nasync function downloadMLExportImage(photo){const url=new URL(photo.url);const response=await fetch(url);const blob=await response.blob();if(!blob.size)throw Error('empty');const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());return blob;}\nfunction untouchedOrderEdit(){return 'keep';}";
const original="const SERVER_ONLY='preserve';\nconst ML_PORTAL_HTML_="+JSON.stringify(html)+";\n";
test('ML server and unrelated order editing source is preserved',()=>{const result=patch(original);assert.equal(result.prefix,"const SERVER_ONLY='preserve';\n");assert.ok(result.html.includes("function untouchedOrderEdit(){return 'keep';}"));new vm.Script(result.source);new vm.Script(result.html);});
test('ML adapter sends photo and order IDs, never caller-supplied file paths',()=>{const result=patch(original);assert.ok(result.html.includes("action:'mlRead',order_id:photo.order_id,photo_id:photo.id"));assert.equal(result.html.includes('file_id:photo'),false);assert.ok(result.html.includes("credentials:'omit'"));});
test('patch fails rather than overwriting an unknown or already patched portal',()=>{assert.throws(()=>patch(''),/missing/);assert.throws(()=>patch(patch(original).source),/already/);});
test('WEBP keeps native dimensions when encoded as lossless PNG for Excel',async()=>{
 const canvas={width:0,height:0,getContext:()=>({drawImage:()=>{}}),toDataURL:type=>{assert.equal(type,'image/png');return 'data:image/png;base64,AA==';}};
 const context=vm.createContext({URL,Blob,Uint8Array,fetch:async()=>({ok:true,blob:async()=>new Blob(['webp-bytes'],{type:'image/webp'})}),createImageBitmap:async()=>({width:1280,height:720,close:()=>{}}),document:{createElement:tag=>{assert.equal(tag,'canvas');return canvas;}}});
 vm.runInContext(patch(original).html,context);
 const result=await vm.runInContext("downloadMLExportImage({url:'https://iqopdxrnkmpdivzndkxq.supabase.co/storage/v1/object/sign/iroun-order-photos/test.webp'})",context);
 assert.equal(result.width,1280);assert.equal(result.height,720);assert.equal(canvas.width,1280);assert.equal(canvas.height,720);assert.equal(result.extension,'png');
});
