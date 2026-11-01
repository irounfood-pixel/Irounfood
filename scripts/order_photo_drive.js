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
 const api={isDrive,upload,read,trash,request};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.IrounPhotoDrive=api;
})(typeof globalThis!=='undefined'?globalThis:this);
