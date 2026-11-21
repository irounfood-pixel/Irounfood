const ORDER_PHOTO_BUCKET='iroun-order-photos';
const photoBusy=new Set();
async function loadOrderPhotos(orderId){
 const panel=$('orderPhotos');
 if(!panel)return;
 panel.textContent='첨부파일 목록을 불러오는 중입니다.';
 const {data,error}=await db.from('order_photos')
  .select('id,order_id,original_name,created_at').eq('order_id',orderId).order('created_at',{ascending:false});
 if(!panel.isConnected||panel!==$('orderPhotos'))return;
 if(error){panel.textContent='사진 조회 실패: '+error.message;return;}
 if(!data?.length){panel.innerHTML='<div class="muted">첨부사진 0장</div>';return;}
 panel.innerHTML='<div class="muted" style="margin-bottom:4px">첨부사진 '+data.length+'장</div>'
  +data.slice().sort(IrounPhotoDrive.comparePhotos).map(photo=>'<div class="order-photo-file">'
   +'<span class="mini photo-name" title="'+esc(IrounPhotoDrive.displayName(photo.original_name))+'">'+esc(IrounPhotoDrive.displayName(photo.original_name))+'</span>'
   +'<button type="button" class="btn light" data-photo-id="'+photo.id+'" data-order-id="'+orderId+'" onclick="removeOrderPhoto(this.dataset.photoId,this.dataset.orderId)">삭제</button>'
   +'</div>').join('');
}

const orderPhotoQueues=new Map();
let activePhotoOrder=null;
window.addEventListener('beforeunload',e=>{if(photoBusy.size){e.preventDefault();e.returnValue='';}});
function queueOrderPhotos(orderId){
 if(photoBusy.has(orderId))return;
 const input=$('orderPhotoInput'),files=Array.from(input.files||[]);
 if(!files.length)return;
 if(files.length>30){input.value='';return toast('한 번에 최대 30장까지 선택해주세요.');}
 if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||!f.size)){input.value='';return toast('JPG·PNG·WEBP 사진을 선택해주세요.');}
 const old=orderPhotoQueues.get(orderId);
 if(old?.items.some(x=>x.status!=='saved')){input.value='';return toast('선택된 사진을 먼저 저장하거나 선택 취소해주세요.');}
 old?.items.forEach(x=>URL.revokeObjectURL(x.url));
 files.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
 orderPhotoQueues.set(orderId,{stamp:Date.now(),started:false,items:files.map(file=>({file,id:crypto.randomUUID(),url:URL.createObjectURL(file),status:'pending',error:''}))});
 input.value='';renderPhotoQueue(orderId);
}
function moveQueuedPhoto(orderId,index,step){
 const q=orderPhotoQueues.get(orderId);if(!q||q.started||photoBusy.has(orderId))return;
 const next=index+step;if(next<0||next>=q.items.length)return;
 [q.items[index],q.items[next]]=[q.items[next],q.items[index]];renderPhotoQueue(orderId);
}
function clearPhotoQueue(orderId){
 if(photoBusy.has(orderId))return;
 orderPhotoQueues.get(orderId)?.items.forEach(x=>URL.revokeObjectURL(x.url));
 orderPhotoQueues.delete(orderId);renderPhotoQueue(orderId);
}
function renderPhotoQueue(orderId){
 if(activePhotoOrder!==orderId||!$('photoQueue'))return;
 const q=orderPhotoQueues.get(orderId),busy=photoBusy.has(orderId),items=q?.items||[],saved=items.filter(x=>x.status==='saved').length;
 $('orderPhotoInput').disabled=busy||items.some(x=>x.status!=='saved');
 const b=$('orderPhotoUpload');b.disabled=busy||!items.length||saved===items.length;
 b.textContent=busy?'저장 중 '+saved+'/'+items.length:items.some(x=>x.status==='error')?'실패한 사진 다시 저장':'사진 올리기';
 $('photoProgress').textContent=items.length?(busy?'사진 '+saved+'/'+items.length+'장 저장 중 · 창을 닫아도 업로드는 계속됩니다. 페이지를 나가지는 마세요.':saved===items.length?'사진 '+saved+'장 저장 완료':'선택 '+items.length+'장 · 파일명 순서입니다. 송장 → 내부·외부 순서인지 확인해주세요.'):'사진을 여러 장 선택하면 자동으로 용량을 줄여 저장합니다.';
 $('photoQueue').innerHTML=items.map((x,i)=>'<div class="order-photo-item"><img src="'+x.url+'" alt="선택 사진 '+(i+1)+'"><div class="mini">'+(i+1)+'. '+esc(IrounPhotoDrive.displayName(x.file.name))+'</div><div class="mini">'+esc(({pending:'대기',processing:'용량 조정·저장 중',saved:'저장 완료',error:'실패: '+x.error})[x.status])+'</div>'+(!q.started?'<button type="button" onclick="moveQueuedPhoto(\''+orderId+'\','+i+',-1)" '+(i===0?'disabled':'')+' aria-label="사진 '+(i+1)+' 앞으로">←</button> <button type="button" onclick="moveQueuedPhoto(\''+orderId+'\','+i+',1)" '+(i===items.length-1?'disabled':'')+' aria-label="사진 '+(i+1)+' 뒤로">→</button>':'')+'</div>').join('');
 $('photoClear').disabled=busy||!items.length;
}
async function uploadOrderPhotos(orderId){
 const order=state.orders.find(x=>x.id===orderId),q=orderPhotoQueues.get(orderId);
 if(!order||!q||photoBusy.has(orderId))return;
 q.started=true;photoBusy.add(orderId);renderPhotoQueue(orderId);
 const todo=q.items.map((item,index)=>({item,index})).filter(x=>x.item.status!=='saved');let cursor=0;
 async function worker(){
  while(cursor<todo.length){const {item,index}=todo[cursor++];item.status='processing';renderPhotoQueue(orderId);
   try{
    if(!item.prepared){const small=await IrounPhotoDrive.preparePhoto(item.file);const name='orderphoto_'+q.stamp+'_'+String(index).padStart(3,'0')+'_'+small.name;
     item.prepared=new File([small],name.slice(0,250),{type:small.type,lastModified:item.file.lastModified});}
    await IrounPhotoDrive.upload(db,orderId,item.prepared,item.id);item.status='saved';item.prepared=null;
   }catch(e){item.status='error';item.error=e.message||String(e);}
   renderPhotoQueue(orderId);
  }
 }
 try{await Promise.all([worker(),worker()]);}
 finally{
  photoBusy.delete(orderId);renderPhotoQueue(orderId);
  const saved=q.items.filter(x=>x.status==='saved').length;
  toast('주문 '+order.order_no+' 사진 '+saved+'/'+q.items.length+'장 저장'+(saved===q.items.length?' 완료':' · 실패한 사진만 다시 저장해주세요.'));
  if(activePhotoOrder===orderId)await loadOrderPhotos(orderId);
  if(['parcel','mlparcel'].includes(state.page))void refreshParcelPhotoCounts();
 }
}

async function removeOrderPhoto(photoId,orderId){
 if(!confirm('선택한 주문 사진을 삭제할까요?'))return;
 const {data:photo,error:readError}=await db.from('order_photos').select('id,order_id,storage_path').eq('id',photoId).eq('order_id',orderId).single();
 if(readError)return toast('사진 확인 실패: '+readError.message);
 if(IrounPhotoDrive.isDrive(photo)){
  try{await IrounPhotoDrive.trash(db,orderId,photoId);}catch(e){return toast('사진 삭제 실패: '+e.message);}
 }else{
 const {error:storageError}=await db.storage.from(ORDER_PHOTO_BUCKET).remove([photo.storage_path]);
 if(storageError)return toast('사진 파일 삭제 실패: '+storageError.message);
 const {error:deleteError}=await db.from('order_photos').delete().eq('id',photoId).eq('order_id',orderId);
 if(deleteError)return toast('사진 정보 삭제 실패: '+deleteError.message);
 }
 toast('사진을 삭제했습니다.');
 loadOrderPhotos(orderId);
 if(['parcel','mlparcel'].includes(state.page))void refreshParcelPhotoCounts();
}
