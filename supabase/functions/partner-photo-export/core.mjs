// A portal share-link capability grants read-only access to one fixed partner.
// It is unrelated to the private administrator ingest token or Supabase key.
export function createPhotoExportHandler({accessHash, sheetId, gateway, digest}) {
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({ok:false,error:'POST only'},405);
  const token=(req.headers.get('Authorization')||'').match(/^Bearer ([A-Za-z0-9_-]{40,180})$/)?.[1];
  if(!token||await digest(token)!==accessHash)return reply({ok:false,error:'접근 권한을 확인해 주세요.'},401);
  try {
   const input=await req.json();
   if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['from','to','order_id'].includes(k)))return reply({ok:false,error:'잘못된 조회 조건입니다.'},400);
   const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
   if((input.from!==undefined||input.to!==undefined)&&(!validDate(input.from)||!validDate(input.to)||input.from>input.to))return reply({ok:false,error:'발송 시작일과 종료일을 확인해주세요.'},400);
   if(input.order_id!==undefined&&(typeof input.order_id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.order_id)))return reply({ok:false,error:'주문을 확인해주세요.'},400);
   if(!await gateway.enabled(sheetId,input))return reply({ok:false,error:'거래처 연결이 비활성 상태입니다.'},403);
   const rows=await gateway.approvedRows(sheetId,input);
   const orders=new Map();
   for(const r of rows){
    if(r.sheet_id!==sheetId||r.status!=='승인'||!r.approved_order_id)throw Error('invalid source scope');
    if(input.from&&(!r.ship_date||r.ship_date<input.from||r.ship_date>input.to))continue;
    if(input.order_id&&r.approved_order_id!==input.order_id)continue;
    if(!orders.has(r.approved_order_id))orders.set(r.approved_order_id,{order_id:r.approved_order_id,source_rows:[],recipient:r.recipient,contact:r.contact,address:r.address,ship_date:r.ship_date});
    orders.get(r.approved_order_id).source_rows.push(Number(r.source_row));
   }
   if(!orders.size)return reply({ok:true,photos:[]});
   const photos=await gateway.photos([...orders.keys()]);
   if(photos.length>200)return reply({ok:false,error:'선택한 기간의 사진이 200장을 초과합니다. 기간을 줄여주세요.'},413);
   const seen=new Set(),result=[];
   for(const p of photos){
    const order=orders.get(p.order_id);
    if(!order||seen.has(p.id)||!String(p.storage_path).startsWith(p.order_id+'/')||String(p.storage_path).includes('..')||!['image/jpeg','image/png','image/webp'].includes(p.content_type))throw Error('invalid photo scope');
    seen.add(p.id);
    result.push({...order,id:p.id,original_name:String(p.original_name||''),content_type:p.content_type,size_bytes:Number(p.size_bytes||0),created_at:p.created_at,order_no:String(p.order_no||''),url:await gateway.sign(p.storage_path,300)});
   }
   return reply({ok:true,photos:result});
  }catch(_){return reply({ok:false,error:'첨부사진을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'},502);}
 };
}

