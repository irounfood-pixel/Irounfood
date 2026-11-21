function mlPartnerFields(r){return [r.order_date,r.ship_date,r.product_name,String(r.quantity),r.recipient,r.contact,r.address,r.note||''];}
function editMLPartnerRow(id){
 const r=(window.__partnerRows||[]).find(r=>r.id===id);if(!r)return;
 const names=['주문일','발송일','상품명','수량','수령인','연락처','배송지','요청사항'];
 window.__mlEdit={id,updated:r.updated_at,expected:mlPartnerFields(r)};
 openModal('<h2>ML 주문 수정</h2><p>승인 상태와 기존 주문번호를 유지합니다. 같은 주문의 배송정보는 함께 변경됩니다.</p><div class="formgrid">'+mlPartnerFields(r).map((v,i)=>'<div class="field"><label>'+names[i]+'</label><input id="ml-edit-'+i+'" value="'+esc(v)+'" type="'+(i<2?'date':i===3?'number':'text')+'"></div>').join('')+'</div><button class="btn primary" id="ml-save" onclick="saveMLPartnerRow()">수정 저장</button>');
}
async function saveMLPartnerRow(){
 const d=window.__mlEdit,b=$('ml-save');if(!d||b.disabled)return;b.disabled=true;
 try{const {error}=await db.rpc('admin_update_ml_row',{p_row_id:d.id,p_expected:d.expected,p_expected_updated_at:d.updated,p_input:Array.from({length:8},(_,i)=>$('ml-edit-'+i).value)});if(error)throw error;closeModal();await loadAll();await renderPartnerOrders(state.page==='requests');toast('ML 주문 수정 완료');}catch(e){toast(e.message);}finally{if(b.isConnected)b.disabled=false;}
}
