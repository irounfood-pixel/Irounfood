// Shared order grouping and date selection for the list and exports.
const mlBoxNames=['아이스 소','아이스 중','아이스 대','종이 중','종이 대'];
let mlRange={from:today(),to:today()},mlGroups=[],mlPhotoCache=new Map();
function dateISO(v){return String(v||'').trim().replace(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/,(_,y,m,d)=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0'));}
function shiftDate(day,n){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
function groupMLOrders(d){
 const groups=new Map();
 d.rows.forEach((r,i)=>{const state=d.orderStates?.[i],source=Number(d.sourceRows[i]);
  const orderId=state?.status==='승인'?state.approved_order_id:null;
  const key=orderId?'order:'+orderId:'row:'+source;
  if(!groups.has(key))groups.set(key,{key,orderId,orderNo:String(state?.order_no||''),date:dateISO(r[1]),recipient:r[4],contact:r[5],address:r[6],state,entries:[],photos:[],boxes:r.slice(9,14).map(v=>Number(v)||0),photoCount:Number(r[14])||0});
  const g=groups.get(key);g.entries.push({row:r,source,state});g.photoCount=Math.max(g.photoCount,Number(r[14])||0);
 });
 return [...groups.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.orderNo.localeCompare(b.orderNo,undefined,{numeric:true})||a.entries[0].source-b.entries[0].source);
}
function groupTracking(g){return [...new Set(g.entries.map(e=>String(e.row[8]||'').trim()).filter(Boolean))].join(', ');}
function groupProducts(g){return g.entries.map(e=>e.row[2]+' × '+e.row[3]).join('\n');}
function groupBoxes(g){return mlBoxNames.map((n,i)=>g.boxes[i]?n+' '+g.boxes[i]+'개':'').filter(Boolean).join(' / ')||'미입력';}
function groupStatus(g){const s=g.state;return !s?'동기화 대기':s.order_status==='출고완료'?'출고완료':s.order_status==='취소'?'취소':s.status==='승인'?'발송 예정':s.status==='반려'?'반려':'승인 대기';}
function inMLRange(g,range){return (!range.from||g.date>=range.from)&&(!range.to||g.date<=range.to);}
function matchesMLSearch(g,query){return !query||[g.orderNo,g.recipient,g.contact,g.address,groupProducts(g),groupTracking(g)].join(' ').toLowerCase().includes(query.toLowerCase());}
function mlText(parent,tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.appendChild(el);return el;}
function render(){
 mlGroups=groupMLOrders(data);
 const query=$('search').value.trim(),allSearch=Boolean(query);
 const groups=mlGroups.filter(g=>(allSearch||inMLRange(g,mlRange))&&matchesMLSearch(g,query));
 $('count').textContent='('+groups.length+'건)';
 $('rangeCaption').textContent=allSearch?'전체 기간 검색 결과':mlRange.from===mlRange.to?mlRange.from+' 발송 대상':mlRange.from+' ~ '+mlRange.to+' 발송 대상';
 for(const [id,from,to] of [['quickToday',today(),today()],['quickYesterday',shiftDate(today(),-1),shiftDate(today(),-1)],['quickWeek',shiftDate(today(),-6),today()]]){
  const title={quickToday:'오늘',quickYesterday:'어제',quickWeek:'최근 7일'}[id];
  $(id).textContent=title+' · '+mlGroups.filter(g=>inMLRange(g,{from,to})).length+'건';
  $(id).classList.toggle('primary',!allSearch&&mlRange.from===from&&mlRange.to===to);
 }
 $('cards').replaceChildren();
 if(!groups.length)mlText($('cards'),'p',allSearch?'검색 결과가 없습니다.':'이 기간에 발송일이 지정된 주문이 없습니다. 다른 날짜를 선택해주세요.','muted');
 groups.slice(0,shown).forEach(g=>{
  const card=mlText($('cards'),'article','','card');
  mlText(card,'strong',g.recipient+(g.orderNo?' · 주문 '+g.orderNo:''));
  mlText(card,'p','발송일 '+g.date+' · '+groupStatus(g),'meta');
  mlText(card,'p',groupProducts(g),'product-lines');
  mlText(card,'p','송장 '+(groupTracking(g)||'미입력')+' · 사진 '+g.photoCount+'장','meta');
  const detail=document.createElement('details');card.appendChild(detail);
  mlText(detail,'summary','주문 상세 · 박스 · 사진 보기');
  mlText(detail,'p','박스: '+groupBoxes(g));mlText(detail,'p',g.address+' / '+g.contact);
  for(const entry of g.entries){if(entry.row[7])mlText(detail,'p',entry.row[2]+' 요청: '+entry.row[7]);}
  const pictures=mlText(detail,'div',g.photoCount?'상세를 열면 사진을 불러옵니다.':'첨부사진 없음','ml-pictures');
  detail.addEventListener('toggle',()=>{if(detail.open&&g.photoCount&&!pictures.dataset.started){pictures.dataset.started='1';void showMLGroupPhotos(g,pictures);}});
  const actions=document.createElement('details');detail.appendChild(actions);mlText(actions,'summary','입력 내용 수정·삭제');
  for(const entry of g.entries){const line=mlText(actions,'div','','ml-edit-line');mlText(line,'b',entry.row[2]+' × '+entry.row[3]);appendMLOrderControls(line,entry.source,entry.row);}
 });
 $('more').hidden=groups.length<=shown;updateMLExportSummary();
}
function chooseMLRange(from,to){
 if(!from||!to||from>to){show('notice','시작일과 종료일을 확인해주세요.',true);return;}
 mlRange={from,to};$('search').value='';shown=25;
 $('rangeFrom').value=from;$('rangeTo').value=to;$('exportFrom').value=from;$('exportTo').value=to;render();
}
function updateMLExportSummary(){
 const from=$('exportFrom').value,to=$('exportTo').value;
 const groups=groupMLOrders(data).filter(g=>inMLRange(g,{from,to})&&(groupTracking(g)||g.photoCount>0));
 $('exportSummary').textContent=!from||!to?'발송일 기준 다운로드 기간을 선택해주세요.':from>to?'시작일은 종료일보다 늦을 수 없습니다.':from+' ~ '+to+' · 다운로드 대상 '+groups.length+'건 · 사진 '+groups.reduce((n,g)=>n+g.photoCount,0)+'장';
}
function setupMLWorkflow(){
 $('quickToday').onclick=()=>chooseMLRange(today(),today());
 $('quickYesterday').onclick=()=>chooseMLRange(shiftDate(today(),-1),shiftDate(today(),-1));
 $('quickWeek').onclick=()=>chooseMLRange(shiftDate(today(),-6),today());
 $('quickDates').onclick=()=>{$('rangePicker').hidden=!$('rangePicker').hidden;};
 $('applyRange').onclick=()=>chooseMLRange($('rangeFrom').value,$('rangeTo').value);
 $('rangeDay').onchange=()=>{if($('rangeDay').value)chooseMLRange($('rangeDay').value,$('rangeDay').value);};
 $('listDownload').onclick=()=>{
  if($('search').value.trim()){$('exportFrom').value='';$('exportTo').value='';}
  else{$('exportFrom').value=mlRange.from;$('exportTo').value=mlRange.to;}
  updateMLExportSummary();setView('download');
 };
 for(const id of ['exportFrom','exportTo'])$(id).onchange=updateMLExportSummary;
 chooseMLRange(today(),today());
}
function mlPhotoKey(p){const m=String(p.original_name||'').match(/^orderphoto_(\d{13})_(\d{3})_/);return m?m[1]+'_'+m[2]:String(Date.parse(p.created_at)||0).padStart(13,'0')+'_000';}
function sortMLPhotos(photos){return photos.slice().sort((a,b)=>mlPhotoKey(a).localeCompare(mlPhotoKey(b))||String(a.id).localeCompare(String(b.id)));}
function matchingGroupPhotos(g,photos){
 const sources=new Set(g.entries.map(e=>e.source));
 return sortMLPhotos(photos.filter(p=>g.orderId?p.order_id===g.orderId:p.source_rows?.some(n=>sources.has(Number(n)))));
}
async function showMLGroupPhotos(g,panel){
 panel.textContent='사진 정보를 불러오는 중…';
 try{
  if(!g.orderId)throw Error('주문 연동 후 사진을 확인할 수 있습니다. 새로고침해주세요.');
  const photos=matchingGroupPhotos(g,await loadMLExportPhotos({order_id:g.orderId}));
  panel.replaceChildren();if(!photos.length){panel.textContent='첨부사진 없음';return;}
  let cursor=0;
  async function more(){
   button.disabled=true;
   const batch=photos.slice(cursor,cursor+4);cursor+=batch.length;
   for(let start=0;start<batch.length;start+=2){
    await Promise.all(batch.slice(start,start+2).map(async(p,j)=>{
     const index=photos.indexOf(p)+1,box=document.createElement('div');grid.appendChild(box);
     mlText(box,'span',index+'번 사진','hint');
     async function load(){try{
      let image=mlPhotoCache.get(p.id);if(!image){image=await compactMLImage(await downloadMLExportImage(p));if(mlPhotoCache.size>=40)mlPhotoCache.delete(mlPhotoCache.keys().next().value);mlPhotoCache.set(p.id,image);}
      const img=document.createElement('img');img.src=image.base64;img.alt='주문 '+(g.orderNo||g.recipient)+' 사진 '+index;img.loading='lazy';
      const open=document.createElement('button');open.className='photo-open';open.type='button';open.setAttribute('aria-label',index+'번 사진 크게 보기');open.appendChild(img);open.onclick=()=>openMLPhoto(p,g,image);
      box.replaceChildren(open);mlText(box,'span',index+'번 사진','hint');
     }catch(e){box.textContent='사진 불러오기 실패';const retry=mlText(box,'button','다시 보기');retry.type='button';retry.onclick=load;}}
     await load();
    }));
   }
   button.disabled=false;button.hidden=cursor>=photos.length;button.textContent='사진 더 보기 ('+cursor+'/'+photos.length+')';
  }
  const grid=mlText(panel,'div','','ml-photo-grid'),button=mlText(panel,'button','사진 더 보기');button.type='button';button.onclick=more;await more();
 }catch(e){panel.textContent=e.message;const retry=mlText(panel,'button','다시 보기');retry.type='button';retry.onclick=()=>showMLGroupPhotos(g,panel);}
}
async function openMLPhoto(photo,g,preview){
 const dialog=$('photoDialog');$('photoLarge').src=preview.base64;$('photoTitle').textContent='주문 '+(g.orderNo||g.recipient)+' · 사진';dialog.showModal();
 const selected=photo.id;dialog.dataset.photo=selected;$('photoLoadStatus').textContent='큰 사진을 불러오는 중…';
 try{const full=await downloadMLExportImage(photo);if(dialog.open&&dialog.dataset.photo===selected){$('photoLarge').src=full.base64;$('photoLoadStatus').textContent='';}}
 catch(e){if(dialog.open&&dialog.dataset.photo===selected)$('photoLoadStatus').textContent='미리보기 표시 중 · 큰 사진은 다시 열어주세요.';}
}
function validateMLPeriod(from,to){if(!from||!to)throw Error('발송일 기준 다운로드 기간을 선택해주세요.');if(from>to)throw Error('시작일은 종료일보다 늦을 수 없습니다.');}
function selectedMLExport(d,photos,from,to){
 validateMLPeriod(from,to);
 return groupMLOrders(d).filter(g=>inMLRange(g,{from,to})).map(g=>({...g,photos:matchingGroupPhotos(g,photos)})).filter(g=>groupTracking(g)||g.photoCount>0||g.photos.length>0);
}
let mlExportBusy=false;
async function runMLExport(mode){
 if(mlExportBusy)return;
 try{
  const from=$('exportFrom').value,to=$('exportTo').value;validateMLPeriod(from,to);
  mlExportBusy=true;mlExportButtons.forEach(id=>$(id).disabled=true);show('notice','선택 기간의 주문을 확인하는 중입니다.');
  const d=await call('getMLPortalData');data=d;
  const photos=mode==='fast'?[]:await loadMLExportPhotos({from,to});
  const groups=selectedMLExport(d,photos,from,to);if(!groups.length)throw Error('선택 기간에 송장번호 또는 사진이 있는 주문이 없습니다.');
  if(mode==='fast'){
   const rows=[['주문번호','발송일','수령인/기관','상품·수량','송장번호','아이스 소','아이스 중','아이스 대','종이 중','종이 대','사진 수','연락처','배송지','출고상태'],...groups.map(g=>[g.orderNo,g.date,g.recipient,groupProducts(g),groupTracking(g),...g.boxes,g.photoCount,g.contact,g.address,groupStatus(g)])];
   const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[16,16,24,45,35,12,12,12,12,12,10,20,55,16].map(wch=>({wch}));XLSX.utils.book_append_sheet(wb,ws,'주문내역');downloadMLBytes(XLSX.write(wb,{bookType:'xlsx',type:'array'}),'ML_사진없이_'+from+'_'+to+'.xlsx');
  }else{
   const ExcelJS=await loadMLExcelEngine();
   const wb=await buildMLPhotoWorkbook(ExcelJS,d,photos,p=>compactMLImageFromSaved(p),from,to);
   downloadMLBytes(await wb.xlsx.writeBuffer(),'ML_사진포함_'+from+'_'+to+'.xlsx');
  }
  show('notice',from+' ~ '+to+' · 주문 '+groups.length+'건 다운로드 완료');render();
 }catch(e){show('notice',e.message,true);}finally{mlExportBusy=false;mlExportButtons.forEach(id=>$(id).disabled=false);}
}
async function compactMLImageFromSaved(p){let image=mlPhotoCache.get(p.id);if(!image){image=await compactMLImage(await downloadMLExportImage(p));if(mlPhotoCache.size>=40)mlPhotoCache.delete(mlPhotoCache.keys().next().value);mlPhotoCache.set(p.id,image);}return image;}
async function buildMLPhotoWorkbook(ExcelJS,d,photos,getImage,from,to){
 const groups=selectedMLExport(d,photos,from,to),wb=new ExcelJS.Workbook();wb.creator='이로운과자점';
 const ws=wb.addWorksheet('주문사진');ws.columns=[{width:42},{width:42},{width:24},{width:38}];
 ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};
 function textRow(values,height=30){const row=ws.addRow(values);row.height=height;row.font={name:'맑은 고딕',size:11};row.alignment={wrapText:true,vertical:'middle'};return row;}
 const title=textRow(['발송일 '+from+' ~ '+to,'','주문 '+groups.length+'건',''],30);ws.mergeCells(title.number,1,title.number,2);
 for(const g of groups){
  const head=textRow(['주문 '+(g.orderNo||'승인 전')+' · '+g.recipient,'',g.date,groupStatus(g)],32);ws.mergeCells(head.number,1,head.number,2);head.font={name:'맑은 고딕',bold:true,color:{argb:'FFFFFFFF'}};head.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF285944'}};
  const tr=groupTracking(g)||'미입력',tracking=textRow(['송장번호: '+tr,'','박스 수량',groupBoxes(g)],Math.min(120,Math.max(38,Math.ceil(tr.length/65)*18)));ws.mergeCells(tracking.number,1,tracking.number,2);
  const info=textRow(['연락처: '+g.contact,'','배송지',g.address],Math.max(48,Math.ceil(g.address.length/22)*16));ws.mergeCells(info.number,1,info.number,2);
  // Dedicated fixed-height rows keep photo anchors apart, even with many images.
  const detailLines=g.entries.map(e=>e.row[2]+' × '+e.row[3]);
  const pairCount=Math.max(1,Math.ceil(g.photos.length/2),Math.ceil(detailLines.length/10));
  for(let pair=0;pair<pairCount;pair++){
   const labels=textRow([g.photos[pair*2]?'사진 '+(pair*2+1):'',g.photos[pair*2+1]?'사진 '+(pair*2+2):'',pair===0?'상품·수량':'상품·수량 (계속)',''],22);
   const imageRow=textRow(['','','',detailLines.slice(pair*10,(pair+1)*10).join('\n')],210);
   if(!g.photos.length&&pair===0)imageRow.getCell(1).value='첨부사진 없음';
   const batch=g.photos.slice(pair*2,pair*2+2);show('notice','주문 '+(g.orderNo||g.recipient)+' 사진 '+Math.min(pair*2+2,g.photos.length)+'/'+g.photos.length+'장 처리 중');
   const images=await Promise.all(batch.map(getImage));
   images.forEach((image,col)=>{const scale=Math.min(1,278/image.width,264/image.height),id=wb.addImage({base64:image.base64,extension:image.extension});ws.addImage(id,{tl:{col:col+0.02,row:imageRow.number-1+0.02},ext:{width:image.width*scale,height:image.height*scale},editAs:'oneCell'});});
  }
  textRow([],14);
 }
 ws.views=[{state:'frozen',ySplit:1}];return wb;
}

function downloadMLBytes(bytes,name){
 const previous=$('lastDownload');if(previous){URL.revokeObjectURL(previous.href);previous.remove();}
 const a=document.createElement('a');a.id='lastDownload';a.href=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.download=name;a.target='_self';a.textContent='생성한 파일 다시 받기 · '+name;a.style.display='block';a.style.marginTop='16px';$('download').appendChild(a);a.click();
}
