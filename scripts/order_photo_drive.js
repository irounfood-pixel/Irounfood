(function(root){
 'use strict';
 function isDrive(photo){return typeof photo?.storage_path==='string' && photo.storage_path.startsWith(photo.order_id+'/drive/');}
 async function request(client,input){
  const {data,error}=await client.functions.invoke('order-photo-drive',{body:input});
  if(error){let message=error.message;try{const value=await error.context?.json();if(value?.error)message=value.error;}catch{}throw Error(message||'구글 드라이브 연결 실패');}
  if(!data?.ok)throw Error(data?.error||'사진 처리 결과를 확인하지 못했습니다.');return data;
 }
 function encode(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('사진 파일을 읽지 못했습니다.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});}
 async function upload(client,orderId,file,photoId){return request(client,{action:'upload',order_id:orderId,photo_id:photoId,original_name:file.name.slice(0,255),content_type:file.type,size_bytes:file.size,base64:await encode(file)});}
 async function read(client,photo){const value=await request(client,{action:'read',order_id:photo.order_id,photo_id:photo.id});if(!['image/jpeg','image/png','image/webp'].includes(value.content_type))throw Error('사진 형식을 확인해주세요.');const bytes=Uint8Array.from(atob(value.base64),c=>c.charCodeAt(0));return new Blob([bytes],{type:value.content_type});}
 async function trash(client,orderId,photoId){return request(client,{action:'trash',order_id:orderId,photo_id:photoId});}
 async function preparePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size)throw Error('JPG·PNG·WEBP 사진을 선택해주세요.');
  const url=URL.createObjectURL(file),img=new Image();let canvas;
  try{
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('사진을 읽지 못했습니다. JPG 형식으로 저장한 뒤 다시 선택해주세요.'));img.src=url;});
   const longest=Math.max(img.naturalWidth,img.naturalHeight);
   if(!longest)throw Error('사진 크기를 확인하지 못했습니다.');
   if(file.type==='image/jpeg'&&file.size<=200*1024&&longest<=1600)return file;
   const scale=Math.min(1,1600/longest);canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('사진 변환을 지원하지 않는 브라우저입니다.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const jpeg=q=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('사진 변환에 실패했습니다.')),'image/jpeg',q));
   let blob=await jpeg(.7);if(blob.size>400*1024)blob=await jpeg(.6);
   if(blob.size>5242880)throw Error('사진 용량을 줄이지 못했습니다. 다른 사진으로 다시 시도해주세요.');
   return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
  }finally{URL.revokeObjectURL(url);if(canvas){canvas.width=1;canvas.height=1;}img.src='';}
 }
 function photoKey(p){const m=String(p.original_name||'').match(/^orderphoto_(\d{13})_(\d{3})_/);return m?m[1]+'_'+m[2]:String(Date.parse(p.created_at)||0).padStart(13,'0')+'_000';}
 function comparePhotos(a,b){return photoKey(a).localeCompare(photoKey(b))||String(a.id||'').localeCompare(String(b.id||''));}
 function displayName(name){return String(name||'').replace(/^orderphoto_\d{13}_\d{3}_/,'');}
 const api={isDrive,upload,read,trash,request,preparePhoto,comparePhotos,displayName};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.IrounPhotoDrive=api;
})(typeof globalThis!=='undefined'?globalThis:this);
