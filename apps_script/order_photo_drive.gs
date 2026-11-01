/** Private Drive photo bridge. No service-role key or shared secret.
 * Every operation must pass Supabase orders SELECT RLS using the current admin JWT.
 * Existing Supabase photos remain unchanged. New files are private and recoverably trashed.
 */
const PHOTO_DRIVE_ROOT_ = '1M6b1sGO3weEmbefnsg4bo5RNKd1QiCCd';
const PHOTO_DB_URL_ = 'https://iqopdxrnkmpdivzndkxq.supabase.co';
const PHOTO_DB_KEY_ = 'sb_publishable_8jMegFjVcyhp1SIRZHosAQ_fVoxo8Nr';
const PHOTO_MAX_BYTES_ = 5242880;
const PHOTO_UUID_ = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function doGet() {
  return photoJson_({ok:true,service:'iroun-private-order-photos',version:1});
}
function doPost(e) {
  try {
    if (!e || !e.postData || e.postData.contents.length > 7200000) throw Error('요청 크기를 확인해주세요.');
    return photoJson_(photoHandle_(JSON.parse(e.postData.contents)));
  } catch (err) {
    // Never log tokens, request bodies, database responses, or photo bytes.
    return photoJson_({ok:false,error:String(err.message || '사진 처리 실패').slice(0,200)});
  }
}
function photoJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function photoDb_(token, path, method, body) {
  const options = {method:method || 'get',muteHttpExceptions:true,
    headers:{apikey:PHOTO_DB_KEY_,Authorization:'Bearer '+token,Prefer:'return=representation'}};
  if (body !== undefined) {options.contentType='application/json';options.payload=JSON.stringify(body);}
  const response=UrlFetchApp.fetch(PHOTO_DB_URL_+'/rest/v1/'+path,options);
  const code=response.getResponseCode();
  if (code<200 || code>=300) throw Error('주문관리 로그인 또는 사진 처리 권한을 확인해주세요.');
  const text=response.getContentText();
  return text ? JSON.parse(text) : null;
}
function photoHandle_(p) {
  if (!p || !['upload','read','trash'].includes(p.action) || !PHOTO_UUID_.test(p.order_id || '')) throw Error('올바르지 않은 사진 요청입니다.');
  if (typeof p.access_token!=='string' || p.access_token.length>8192 || !/^[A-Za-z0-9_.-]+$/.test(p.access_token)) throw Error('주문관리 로그인이 필요합니다.');
  // RLS is orders_admin_select/private.is_admin(), not a client-provided role.
  const orders=photoDb_(p.access_token,'orders?select=id,order_no&id=eq.'+p.order_id);
  if (!Array.isArray(orders) || orders.length!==1) throw Error('접근할 수 없는 주문입니다.');
  if (p.action==='upload') return photoUpload_(p);
  if (!PHOTO_UUID_.test(p.photo_id || '')) throw Error('사진 번호를 확인해주세요.');
  const rows=photoDb_(p.access_token,'order_photos?select=id,order_id,storage_path,content_type,original_name&id=eq.'+p.photo_id+'&order_id=eq.'+p.order_id);
  if (!Array.isArray(rows) || rows.length!==1) throw Error('접근할 수 없는 사진입니다.');
  const row=rows[0], prefix=p.order_id+'/drive/';
  if (!row.storage_path.startsWith(prefix)) throw Error('구글 드라이브 사진이 아닙니다.');
  const fileId=row.storage_path.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw Error('사진 저장 정보를 확인해주세요.');
  const file=DriveApp.getFileById(fileId);
  photoCheckParents_(file,p.order_id);
  if (p.action==='read') {
    if (file.isTrashed() || file.getSize()>PHOTO_MAX_BYTES_) throw Error('사진 파일을 확인해주세요.');
    return {ok:true,content_type:row.content_type,base64:Utilities.base64Encode(file.getBlob().getBytes())};
  }
  const wasTrashed=file.isTrashed();
  file.setTrashed(true);
  try {
    const deleted=photoDb_(p.access_token,'order_photos?id=eq.'+p.photo_id+'&order_id=eq.'+p.order_id,'delete');
    if (!Array.isArray(deleted) || deleted.length!==1) throw Error('사진 삭제 권한을 확인해주세요.');
  } catch (err) { if (!wasTrashed) file.setTrashed(false); throw err; }
  return {ok:true};
}
function photoCheckParents_(file,orderId) {
  const parents=file.getParents();let valid=false;
  while(parents.hasNext()) {
    const folder=parents.next();
    if (folder.getName()!==orderId) continue;
    const roots=folder.getParents();
    while(roots.hasNext()) if(roots.next().getId()===PHOTO_DRIVE_ROOT_) valid=true;
  }
  if (!valid) throw Error('주문사진 전용 폴더의 파일만 처리할 수 있습니다.');
}
function photoUpload_(p) {
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if (!PHOTO_UUID_.test(p.photo_id || '') || !extensions[p.content_type] || typeof p.original_name!=='string' || !p.original_name.length || p.original_name.length>255) throw Error('사진 정보를 확인해주세요.');
  if (typeof p.base64!=='string' || p.base64.length>6990508 || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64)) throw Error('파일당 5MB 이하 사진만 올릴 수 있습니다.');
  const bytes=Utilities.base64Decode(p.base64);
  if (!bytes.length || bytes.length>PHOTO_MAX_BYTES_ || bytes.length!==p.size_bytes || !photoSignature_(bytes,p.content_type)) throw Error('JPG·PNG·WEBP 원본 파일을 확인해주세요.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const existing=photoDb_(p.access_token,'order_photos?select=id,order_id,storage_path&id=eq.'+p.photo_id);
    if (existing.length) {
      if(existing[0].order_id!==p.order_id || !existing[0].storage_path.startsWith(p.order_id+'/drive/')) throw Error('사진 번호가 중복됐습니다.');
      return {ok:true,photo:existing[0],already_uploaded:true};
    }
    const root=DriveApp.getFolderById(PHOTO_DRIVE_ROOT_);
    if (root.isTrashed() || root.getSharingAccess()!==DriveApp.Access.PRIVATE) throw Error('비공개 주문사진 폴더를 확인해주세요.');
    const folders=root.getFoldersByName(p.order_id);
    const folder=folders.hasNext()?folders.next():root.createFolder(p.order_id);
    if(folder.isTrashed() || folder.getSharingAccess()!==DriveApp.Access.PRIVATE) throw Error('비공개 주문 폴더를 확인해주세요.');
    const name=p.photo_id+'.'+extensions[p.content_type];
    // Reuse an orphan created by a previous timed-out request with the same ID.
    const candidates=folder.getFilesByName(name);
    let file=null;
    while(candidates.hasNext()) {const f=candidates.next();if(!f.isTrashed()){file=f;break;}}
    if(file && (file.getSize()!==bytes.length || Utilities.base64Encode(file.getBlob().getBytes())!==p.base64)) throw Error('동일한 사진 번호에 다른 파일이 존재합니다.');
    if(!file) file=folder.createFile(Utilities.newBlob(bytes,p.content_type,name));
    if(file.getSharingAccess()!==DriveApp.Access.PRIVATE) {file.setTrashed(true);throw Error('사진은 비공개로만 저장할 수 있습니다.');}
    const photo={id:p.photo_id,order_id:p.order_id,storage_path:p.order_id+'/drive/'+file.getId(),original_name:p.original_name,content_type:p.content_type,size_bytes:bytes.length};
    try {
      const saved=photoDb_(p.access_token,'order_photos','post',photo);
      if(!Array.isArray(saved) || saved.length!==1) throw Error('사진 등록을 확인하지 못했습니다.');
      return {ok:true,photo:saved[0]};
    } catch(err) {
      // A network timeout may have committed the metadata. Never trash a referenced file.
      let committed;
      try {committed=photoDb_(p.access_token,'order_photos?select=id,storage_path&id=eq.'+p.photo_id);}
      catch(checkError) {throw Error('등록 결과 확인이 필요합니다. 같은 사진 번호로 다시 시도해주세요.');}
      if(committed.length===1 && committed[0].storage_path===photo.storage_path) return {ok:true,photo:committed[0]};
      file.setTrashed(true);throw err;
    }
  } finally {lock.releaseLock();}
}
function photoSignature_(b,type) {
  const u=b.map(x=>(x+256)%256);
  if(type==='image/jpeg')return u.length>=3 && u[0]===255 && u[1]===216 && u[2]===255;
  if(type==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>u[i]===v);
  return u.length>=12 && [82,73,70,70].every((v,i)=>u[i]===v) && [87,69,66,80].every((v,i)=>u[i+8]===v);
}
/** Run only after the owner has approved the displayed Google scopes. Read-only check. */
function checkPhotoDriveConnection() {
  const folder=DriveApp.getFolderById(PHOTO_DRIVE_ROOT_);
  if(folder.isTrashed() || folder.getSharingAccess()!==DriveApp.Access.PRIVATE) throw Error('전용 폴더가 비공개인지 확인해주세요.');
  const response=UrlFetchApp.fetch(PHOTO_DB_URL_+'/rest/v1/orders?select=id&limit=0',{headers:{apikey:PHOTO_DB_KEY_},muteHttpExceptions:true});
  const status=response.getResponseCode();
  if(status<200 || status>=500) throw Error('주문 서버 연결을 확인해주세요.');
  console.log('개인 구글 드라이브 비공개 주문사진 폴더 연결 준비 완료');
  return {ok:true};
}
