// A new gateway is constructed per HTTP request. Only validated filters reach SQL.
export function createManifestGateway({sheetId,db}) {
 let request;
 const manifest=(input={})=>request||(request=db.rpc('ml_portal_photo_manifest_scoped',{
  p_from:input.from??null,p_to:input.to??null,p_order_id:input.order_id??null
 }).then(({data,error})=>{if(error||!data)throw Error('manifest error');return data;}));
 return {
  enabled:async(id,input)=>id===sheetId&&(await manifest(input)).enabled===true,
  approvedRows:async(id,input)=>{
   if(id!==sheetId)throw Error('scope');
   const rows=(await manifest(input)).rows;
   if(!Array.isArray(rows)||rows.length>20000)throw Error('source limit');
   return rows;
  },
  photos:async ids=>{
   const photos=(await manifest()).photos;
   if(!Array.isArray(photos))throw Error('invalid photos');
   const allowed=new Set(ids);
   // SQL already applied the exact filters. Never hide an unexpected scope row.
   if(photos.some(p=>!allowed.has(p.order_id)))throw Error('invalid photo scope');
   return photos;
  },
  sign:async(path,seconds)=>{
   const drive=path.match(/^[0-9a-f-]{36}\/drive\/([A-Za-z0-9_-]{10,200})$/i);
   if(drive)return 'drive:'+drive[1];
   const {data,error}=await db.storage.from('iroun-order-photos').createSignedUrl(path,seconds);
   if(error||!data?.signedUrl)throw Error('signing error');
   return data.signedUrl;
  }
 };
}
