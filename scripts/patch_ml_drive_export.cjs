const fs=require('node:fs');
function patch(source){
 const marker='const ML_PORTAL_HTML_=';
 const start=source.indexOf(marker);if(start<0)throw Error('ML HTML declaration missing');
 const rest=source.slice(start+marker.length);
 const match=rest.match(/^"(?:\\.|[^"\\])*"/);if(!match)throw Error('ML JSON string missing');
 let html=JSON.parse(match[0]);
 if(html.includes('const ML_DRIVE_ENDPOINT='))throw Error('Drive adapter already installed');
 const anchor="const ML_PHOTO_ENDPOINT='https://iqopdxrnkmpdivzndkxq.supabase.co/functions/v1/partner-photo-export';";
 if(!html.includes(anchor))throw Error('ML photo endpoint missing');
 html=html.replace(anchor,anchor+"\nconst ML_DRIVE_ENDPOINT='https://iqopdxrnkmpdivzndkxq.supabase.co/functions/v1/order-photo-drive';");
 const fstart=html.indexOf('async function downloadMLExportImage(photo){');
 const fend=html.indexOf('if(!blob.size',fstart);
 if(fstart<0||fend<0)throw Error('ML original download function missing');
 const intro=`async function downloadMLExportImage(photo){
 let blob;
 if(String(photo.url||'').startsWith('drive:')){
  const response=await fetch(ML_DRIVE_ENDPOINT,{method:'POST',credentials:'omit',headers:{Authorization:'Bearer '+ML_PHOTO_LINK_ID,'Content-Type':'application/json'},body:JSON.stringify({action:'mlRead',order_id:photo.order_id,photo_id:photo.id}),cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.ok||!['image/jpeg','image/png','image/webp'].includes(data.content_type))throw Error(data.error||'구글 드라이브 사진을 받지 못했습니다.');
  blob=new Blob([Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0))],{type:data.content_type});
 }else{
  const url=new URL(photo.url);if(url.origin!=='https://iqopdxrnkmpdivzndkxq.supabase.co'||!url.pathname.startsWith('/storage/v1/object/sign/iroun-order-photos/'))throw Error('사진 다운로드 주소를 확인할 수 없습니다.');
  const response=await fetch(url.href,{credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('첨부사진을 가져오지 못했습니다.');blob=await response.blob();
 }
 `;
 html=html.slice(0,fstart)+intro+html.slice(fend);
 const signature="const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());";
 if(!html.includes(signature))throw Error('ML image signature validation missing');
 // Excel cannot embed WEBP. Keep every decoded pixel at native dimensions in lossless PNG.
 html=html.replace(signature,"if(blob.type==='image/webp'){const image=await createImageBitmap(blob);try{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return {base64:canvas.toDataURL('image/png'),extension:'png',width:image.width,height:image.height};}finally{image.close?.();}}"+signature);
 const result=source.slice(0,start+marker.length)+JSON.stringify(html)+rest.slice(match[0].length);
 return {source:result,html,prefix:source.slice(0,start)};
}
module.exports=patch;
if(require.main===module){const result=patch(fs.readFileSync(process.argv[2],'utf8'));fs.writeFileSync(process.argv[3],result.source);console.log(JSON.stringify({bytes:Buffer.byteLength(result.source),serverPrefixUnchanged:true}));}
