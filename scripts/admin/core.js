const SUPABASE_URL='https://iqopdxrnkmpdivzndkxq.supabase.co';
const SUPABASE_KEY='sb_publishable_8jMegFjVcyhp1SIRZHosAQ_fVoxo8Nr';
const {createClient}=supabase; const db=createClient(SUPABASE_URL,SUPABASE_KEY);
let state={page:'dashboard',orders:[],products:[],items:[],requests:[],movements:[],loading:false,errors:[]};
const menus=[['requests','1 · 주문승인'],['calendar','2 · 발송캘린더'],['orders','3 · 주문현황'],['parcel','송장·포장박스'],['mlparcel','ML 송장·포장박스'],['prep','월별 준비량'],['shipped','출고완료'],['inventory','기존 재고관리'],['materials','원재료·반제품·제품'],['products','상품관리'],['settings','설정']];
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');clearTimeout(window.__t);window.__t=setTimeout(()=>$('toast').classList.add('hidden'),2600)}
async function login(){
 const email=$('email').value.trim();
 const password=$('pw').value;
 if(!email||!password)return toast('이메일과 비밀번호를 입력해주세요.');
 const {error}=await db.auth.signInWithPassword({email,password});
 if(error)return toast('로그인 실패: '+(error.message||error));
 await showApp();
}
async function logout(){await db.auth.signOut();$('app').classList.add('hidden');$('login').classList.remove('hidden');$('pw').value='';}
async function showApp(){const {data}=await db.auth.getSession();if(!data.session){$('app').classList.add('hidden');$('login').classList.remove('hidden');return;}$('login').classList.add('hidden');$('app').classList.remove('hidden');renderNav();await init();}
$('pw').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('email').addEventListener('keydown',e=>{if(e.key==='Enter')$('pw').focus()});
// Make wide tables scroll horizontally from both the top and the bottom.
// Works after asynchronous table rendering without changing order or stock data.
const horizontalTableScrolls=new Map();
let horizontalTableFrame=0;
const horizontalTableResize=typeof ResizeObserver==='function'
 ?new ResizeObserver(()=>horizontalTableScrolls.forEach((entry,wrap)=>updateHorizontalTableScroll(wrap,entry)))
 :null;
function updateHorizontalTableScroll(wrap,entry){
 if(!wrap.isConnected)return;
 const max=wrap.scrollWidth-wrap.clientWidth;
 entry.bar.hidden=max<=2;
 if(entry.bar.hidden)return;
 entry.track.style.width=Math.ceil(wrap.scrollWidth)+'px';
 if(Math.abs(entry.bar.scrollLeft-wrap.scrollLeft)>1)entry.bar.scrollLeft=wrap.scrollLeft;
}
function setupHorizontalTableScrolls(){
 const page=$('page');
 if(!page)return;
 const wraps=new Set(page.querySelectorAll('.tablewrap'));
 for(const [wrap,entry] of horizontalTableScrolls){
  if(wraps.has(wrap))continue;
  horizontalTableResize?.unobserve(wrap);
  if(entry.table)horizontalTableResize?.unobserve(entry.table);
  horizontalTableScrolls.delete(wrap);
 }
 for(const wrap of wraps){
  if(horizontalTableScrolls.has(wrap)){
   updateHorizontalTableScroll(wrap,horizontalTableScrolls.get(wrap));continue;
  }
  const bar=document.createElement('div'),track=document.createElement('div');
  bar.className='table-scroll-top';
  bar.setAttribute('role','region');
  bar.setAttribute('aria-label','표 가로 스크롤');
  bar.tabIndex=0;
  bar.title='좌우로 움직여 표의 숨겨진 열을 확인하세요';
  track.className='table-scroll-track';
  track.style.height='1px';
  bar.appendChild(track);
  wrap.parentNode.insertBefore(bar,wrap);
  const entry={bar,track,table:wrap.querySelector('table')};
  horizontalTableScrolls.set(wrap,entry);
  bar.addEventListener('scroll',()=>{
   if(Math.abs(wrap.scrollLeft-bar.scrollLeft)>1)wrap.scrollLeft=bar.scrollLeft;
  },{passive:true});
  wrap.addEventListener('scroll',()=>{
   if(Math.abs(bar.scrollLeft-wrap.scrollLeft)>1)bar.scrollLeft=wrap.scrollLeft;
  },{passive:true});
  horizontalTableResize?.observe(wrap);
  if(entry.table)horizontalTableResize?.observe(entry.table);
  updateHorizontalTableScroll(wrap,entry);
 }
}
function scheduleHorizontalTableScrolls(){
 if(horizontalTableFrame)return;
 horizontalTableFrame=requestAnimationFrame(()=>{
  horizontalTableFrame=0;
  setupHorizontalTableScrolls();
 });
}
new MutationObserver(scheduleHorizontalTableScrolls).observe($('page'),{childList:true,subtree:true});
window.addEventListener('resize',scheduleHorizontalTableScrolls,{passive:true});

function renderNav(){$('nav').innerHTML=menus.map(([k,n])=>`<button class="${state.page===k?'active':''}" onclick="route('${k}')">${n}</button>`).join('')}
const workFilters={orders:{},parcel:{},mlparcel:{}};
const pagePositions={};let routeVersion=0;
async function route(p,reset=false){
 p=({partner:'requests',orderprocess:'orders'})[p]||p;
 pagePositions[state.page]=window.scrollY;const version=++routeVersion;
 if(reset)pagePositions[p]=0;state.page=p;renderNav();
 await ({dashboard:renderDashboard,order:renderOrderForm,orderupload:renderOrderUpload,orders:renderOrders,shipped:renderShippedOrders,requests:renderRequests,parcel:renderParcelEditor,mlparcel:renderParcelEditor,calendar:renderCalendar,prep:renderMonthlyPrep,products:renderProducts,inventory:renderInventory,materials:renderMaterialInventory,settings:renderSettings}[p]||renderDashboard)();
 if(version===routeVersion)window.scrollTo(0,pagePositions[p]||0);
}
function koreaDay(offset=0,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=k=>Number(parts.find(p=>p.type===k).value);
 return new Date(Date.UTC(value('year'),value('month')-1,value('day')+offset)).toISOString().slice(0,10);
}
function isOpenOrder(o){return ['주문접수','준비중'].includes(o.order_status||'주문접수');}
const SHIPPING_ENTRY_START='2026-11-02';
function isParcelEligible(o){return o.order_status!=='취소'&&String(o.receive_method||'').trim()==='택배'&&String(o.ship_date||'')>=SHIPPING_ENTRY_START;}
function matchesWork(o,f={},details=window.__parcelDetails||{}){
 return (!f.date||o.ship_date===f.date)&&(!f.overdue||(o.ship_date&&o.ship_date<koreaDay()&&isOpenOrder(o)))&&(!f.open||isOpenOrder(o))&&(!f.missing||!String(details[o.id]?.tracking_numbers||'').trim())&&(!f.id||o.id===f.id);
}
function goApprovals(){window.__approvalSource='all';window.__approvalHistory=false;return route('requests',true);}
function goWork(page,filter={}){workFilters[page]={...filter};if(page==='orders'){window.__orderq='';window.__orderStatus='전체';}pagePositions[page]=0;return route(page,true);}
function workFilterBar(page){const f=workFilters[page]||{};return `<div class="toolbar work-filter"><label>발송일 <input aria-label="발송일 필터" type="date" value="${esc(f.date||'')}" onchange="goWork('${page}',{...workFilters['${page}'],date:this.value,overdue:false})"></label>${f.overdue?'<span class="badge danger">발송일 지난 미출고</span>':''}${f.missing?'<span class="badge warn">송장 미입력</span>':''}${f.open?'<span class="badge">미출고</span>':''}${f.id?'<span class="badge">선택 주문</span>':''}<button class="btn light" onclick="goWork('${page}')">전체 보기</button></div>`;}
async function openCalendarDay(day){const [y,m]=day.split('-').map(Number);window.__cal=new Date(y,m-1,1);await route('calendar');showCalendarDate(day);}
async function readPaged(factory){let rows=[];for(let from=0;;from+=500){const {data,error}=await factory().range(from,from+499);if(error)return {data:null,error};rows.push(...(data||[]));if(!data||data.length<500)return {data:rows,error:null};}}
async function loadShippingSummary(){try{const {data,error}=await readPaged(()=>db.from('order_shipping_details').select('*').order('order_id'));if(error)throw error;window.__parcelDetails=Object.fromEntries(data.map(x=>[x.order_id,x]));window.__shippingError=null;return true;}catch(e){window.__shippingError=e.message||String(e);return false;}}

async function readTable(label,queryFactory){
 try{const {data,error}=await queryFactory();if(error){const message=label+': '+(error.message||'조회 오류');state.errors.push(message);console.error(message,error);return null;}return data||[];}
 catch(e){const message=label+': '+(e.message||e);state.errors.push(message);console.error(message,e);return null;}
}
async function loadAll(){state.loading=true;state.errors=[];try{
 const [os,pis,ii,cr,mv,mlLinks]=await Promise.all([
  readTable('주문',()=>readPaged(()=>db.from('orders').select('*,order_items(*)').is('deleted_at',null).order('ship_date',{ascending:true}).order('order_no',{ascending:true}).order('id'))),
  readTable('상품',()=>db.from('products').select('*').order('name')),
  readTable('재고품목',()=>db.from('inventory_items').select('*').order('name')),
  readTable('고객주문신청',()=>readPaged(()=>db.from('customer_order_requests').select('*,customer_order_request_items(*)').order('created_at',{ascending:false}).order('id'))),
  readTable('재고이력',()=>db.from('inventory_transactions').select('*').order('created_at',{ascending:false}).limit(200)),
  readTable('ML 승인 연결',()=>readPaged(()=>db.from('partner_order_rows').select('id,status,sheet_id,approved_order_id,partner_sheet_sources(enabled)').eq('status','승인').eq('sheet_id','1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM').order('id')))
 ]);
 state.mlApprovedOrderIds=new Set((mlLinks||[]).filter(r=>r.status==='승인'&&r.approved_order_id&&r.sheet_id==='1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'&&r.partner_sheet_sources?.enabled===true).map(r=>String(r.approved_order_id)));
 state.orders=os||[];state.products=pis||[];state.items=ii||[];state.requests=cr||[];state.movements=mv||[];
 if(state.errors.length)toast('일부 데이터 조회 실패: '+state.errors[0]);
 }catch(e){state.errors.push('초기화: '+(e.message||e));console.error(e);toast('데이터 조회 실패: '+(e.message||e));}finally{state.loading=false}}
let initPromise=null;async function init(){if(initPromise)return initPromise;initPromise=(async()=>{await loadAll();await route(state.page)})();try{return await initPromise}finally{initPromise=null}}
function stat(label,num){return `<div class="stat"><div class="label">${label}</div><div class="num">${num}</div></div>`}
function activeProducts(){return state.products.filter(x=>x.active!==false)}
function fmt(n){return Number(n||0).toLocaleString('ko-KR')}
function dateStr(d){return d?new Date(d).toLocaleDateString('ko-KR'):''}
function orderRows(){return state.orders.flatMap(o=>(o.order_items||[]).map(i=>({...i,order:o})))}
