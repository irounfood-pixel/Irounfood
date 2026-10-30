function appendMLOrderControls(card,sourceRow,r){
 const i=(data.sourceRows||[]).indexOf(sourceRow),state=data.orderStates?.[i];
 const label=document.createElement('p');label.className='muted';
 label.textContent=!state?'동기화 대기':state.order_status==='출고완료'?'출고완료':state.status==='승인'?'승인 · '+(state.order_status||'주문접수'):['등록','승인대기'].includes(state.status)?'등록':state.status;
 card.appendChild(label);
 const registered=state&&['등록','승인대기'].includes(state.status);
 const locked=(data.lockedSourceRows||[]).includes(sourceRow);
 if(registered||!state&&!locked){
  const edit=document.createElement('button');edit.type='button';edit.textContent='입력 내용 수정';edit.onclick=()=>beginEdit(sourceRow);card.appendChild(edit);
 }
 if(!state)return;
 if(state.status==='승인'&&!['주문접수','준비중'].includes(state.order_status))return;
 if(!registered&&state.status!=='승인')return;
 const action=registered?'delete':'cancel',button=document.createElement('button');button.type='button';
 button.textContent=registered?'완전 삭제':'승인 취소 → 등록';button.style.marginLeft='8px';
 button.onclick=async()=>{
  const question=action==='delete'?'이 등록 주문을 완전히 삭제할까요? 삭제한 주문은 다시 나타나지 않습니다.':
   '이 주문의 승인을 취소하고 등록 상태로 되돌릴까요? 같은 정식 주문에 포함된 모든 상품이 함께 돌아갑니다.';
  if(!window.confirm(question))return;
  if(saving||valid()&&JSON.stringify(inputRow())!==savedSignature)return show('notice','입력 중인 내용을 먼저 저장해 주세요.',true);
  button.disabled=true;
  try{
   await call('manageMLPortalOrder',state.source_uid,state.updated_at,r.slice(0,8),action);
   clearTimeout(timer);editingSourceRow=null;editingExpected=null;savedSignature='';form.reset();
   form.elements.order_date.value=today();draftId=newDraftId();$('entryTitle').textContent='직접 입력';$('nextOrder').disabled=true;
   await refresh();show('notice',action==='delete'?'등록 주문을 삭제했습니다. 시트 정리는 다음 자동 동기화 때 반영됩니다.':'승인을 취소했습니다. 등록 상태에서 수정하거나 완전 삭제할 수 있습니다.');
  }catch(e){show('notice',e.message,true);}finally{button.disabled=false;}
 };
 card.appendChild(button);
}
