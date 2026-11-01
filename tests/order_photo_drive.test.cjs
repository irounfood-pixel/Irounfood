const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(__dirname+'/../apps_script/order_photo_drive.gs','utf8');
const order='11111111-1111-4111-8111-111111111111';
const photo='22222222-2222-4222-8222-222222222222';
const root='1M6b1sGO3weEmbefnsg4bo5RNKd1QiCCd';
const bytes=Buffer.from([255,216,255,0,1]);
function env(dbResult=()=>[{id:order}]){
 const calls=[]; let touched=false,trashed=false;
 const iterator=(a)=>({hasNext:()=>a.length>0,next:()=>a.shift()});
 const folder={getName:()=>order,getId:()=>'order-folder',getParents:()=>iterator([{getId:()=>root}]),isTrashed:()=>false,getSharingAccess:()=>'PRIVATE',getFilesByName:()=>iterator([]),createFile:()=>file};
 const file={getId:()=>'file_1234567890',getSize:()=>bytes.length,getBlob:()=>({getBytes:()=>Array.from(bytes)}),getParents:()=>iterator([folder]),getSharingAccess:()=>'PRIVATE',isTrashed:()=>trashed,setTrashed:v=>{trashed=v;}};
 const ctx=vm.createContext({console,ContentService:{MimeType:{JSON:'json'},createTextOutput:JSON.stringify},
  Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64Encode:b=>Buffer.from(b).toString('base64'),newBlob:()=>({})},
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const result=dbResult(url,options,calls.length);return {getResponseCode:()=>result.status||200,getContentText:()=>JSON.stringify(result.data??result)};}},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>{touched=true;return {isTrashed:()=>false,getSharingAccess:()=>'PRIVATE',getFoldersByName:()=>iterator([folder])};},getFileById:()=>{touched=true;return file;}}
 }); vm.runInContext(source,ctx);
 return {ctx,calls,file,folder,get touched(){return touched},get trashed(){return trashed}};
}
const request=(extra={})=>({action:'upload',order_id:order,photo_id:photo,access_token:'verified.token.value',original_name:'사진.jpg',content_type:'image/jpeg',size_bytes:bytes.length,base64:bytes.toString('base64'),...extra});
test('reject missing authentication before Drive access',()=>{const e=env();assert.throws(()=>e.ctx.photoHandle_(request({access_token:''})),/로그인/);assert.equal(e.touched,false);assert.equal(e.calls.length,0)});
test('reject invalid JWT using server response before Drive access',()=>{const e=env(()=>({status:401,data:{}}));assert.throws(()=>e.ctx.photoHandle_(request()),/권한/);assert.equal(e.touched,false)});
test('orders RLS empty response denies non-admin before Drive access',()=>{const e=env(()=>[]);assert.throws(()=>e.ctx.photoHandle_(request()),/접근/);assert.equal(e.touched,false)});
test('reject wrong file signature before Drive access',()=>{const e=env();assert.throws(()=>e.ctx.photoHandle_(request({base64:'YWJj',size_bytes:3})),/원본/);assert.equal(e.touched,false)});
test('reject oversize file before decoding/Drive access',()=>{const e=env();assert.throws(()=>e.ctx.photoHandle_(request({base64:'a'.repeat(6990510)})),/5MB/);assert.equal(e.touched,false)});
test('upload writes private Drive reference with original byte count',()=>{const e=env((url,options)=>options.method==='post'?[JSON.parse(options.payload)]:url.includes('order_photos')?[]:[{id:order}]);const r=e.ctx.photoHandle_(request());assert.equal(r.ok,true);assert.equal(r.photo.storage_path,order+'/drive/file_1234567890');assert.equal(r.photo.size_bytes,bytes.length);assert.equal(e.trashed,false)});
test('duplicate request id returns existing metadata without another Drive file',()=>{const e=env(url=>url.includes('order_photos')?[{id:photo,order_id:order,storage_path:order+'/drive/file_1234567890'}]:[{id:order}]);assert.equal(e.ctx.photoHandle_(request()).already_uploaded,true);assert.equal(e.touched,false)});
test('DB insert failure trashes newly created orphan',()=>{const e=env((url,options)=>options.method==='post'?{status:403,data:{}}:url.includes('order_photos')?[]:[{id:order}]);assert.throws(()=>e.ctx.photoHandle_(request()),/권한/);assert.equal(e.trashed,true)});
test('uncertain DB commit retains file if readback is unavailable',()=>{let n=0;const e=env((url,options)=>url.includes('order_photos')?(++n===1?[]:{status:500,data:{}}):[{id:order}]);assert.throws(()=>e.ctx.photoHandle_(request()),/결과 확인/);assert.equal(e.trashed,false)});
test('read returns original bytes after order and photo checks',()=>{const e=env(url=>url.includes('order_photos')?[{id:photo,order_id:order,storage_path:order+'/drive/file_1234567890',content_type:'image/jpeg'}]:[{id:order}]);assert.equal(e.ctx.photoHandle_(request({action:'read'})).base64,bytes.toString('base64'))});
test('photo from another order cannot be requested',()=>{const e=env(url=>url.includes('order_photos')?[]:[{id:order}]);assert.throws(()=>e.ctx.photoHandle_(request({action:'read'})),/접근/);assert.equal(e.touched,false)});
test('root folder traversal is denied',()=>{const e=env(url=>url.includes('order_photos')?[{id:photo,order_id:order,storage_path:order+'/drive/file_1234567890'}]:[{id:order}]);e.folder.getName=()=>'different-order';assert.throws(()=>e.ctx.photoHandle_(request({action:'read'})),/전용 폴더/)});
test('trash rollback restores Drive file if metadata deletion fails',()=>{const e=env((url,options)=>options.method==='delete'?{status:403,data:{}}:url.includes('order_photos')?[{id:photo,order_id:order,storage_path:order+'/drive/file_1234567890'}]:[{id:order}]);assert.throws(()=>e.ctx.photoHandle_(request({action:'trash'})),/권한/);assert.equal(e.trashed,false)});
test('legacy Supabase files are rejected by Drive endpoint',()=>{const e=env(url=>url.includes('order_photos')?[{storage_path:order+'/legacy.jpg'}]:[{id:order}]);assert.throws(()=>e.ctx.photoHandle_(request({action:'read'})),/드라이브 사진/);assert.equal(e.touched,false)});
const mlToken='AKfycby0_WPs43-J21OUS0d3SaByS7yK9X-r2HL1JbLvDZvZj0NV8xPNQ0JB8BPk2H-fhqfq';
function mlEnv(manifest){const e=env(()=>manifest);e.ctx.Utilities.DigestAlgorithm={SHA_256:'SHA256'};e.ctx.Utilities.Charset={UTF_8:'utf8'};e.ctx.Utilities.computeDigest=(_algo,value)=>Array.from(crypto.createHash('sha256').update(value).digest());return e;}
test('ML read rejects an unrelated capability before network and Drive access',()=>{const e=mlEnv({ok:true,photos:[]});assert.throws(()=>e.ctx.photoHandle_(request({action:'mlRead',access_token:'A'.repeat(60)})),/접근 권한/);assert.equal(e.calls.length,0);assert.equal(e.touched,false)});
test('ML read cannot use a caller file ID absent from current approved manifest',()=>{const e=mlEnv({ok:true,photos:[]});assert.throws(()=>e.ctx.photoHandle_(request({action:'mlRead',access_token:mlToken,file_id:'file_1234567890'})),/연결된 사진/);assert.equal(e.touched,false)});
test('ML read returns unchanged bytes only for current manifest photo and folder',()=>{const e=mlEnv({ok:true,photos:[{id:photo,order_id:order,url:'drive:file_1234567890',content_type:'image/jpeg'}]});const result=e.ctx.photoHandle_(request({action:'mlRead',access_token:mlToken}));assert.equal(result.base64,bytes.toString('base64'));assert.equal(e.calls.length,1);assert.ok(e.calls[0].url.endsWith('/functions/v1/partner-photo-export'));});
