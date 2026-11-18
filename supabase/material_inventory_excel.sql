-- Atomic stocktake import, isolated from legacy orders and inventory.
create or replace function private.stock2_import_stocktake(p_request uuid,p_rows jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r jsonb; i public.stock2_items%rowtype; e public.stock2_events%rowtype;
 seen uuid[]='{}'; item_id uuid; amount numeric; changes jsonb='[]'; first_id uuid;
begin
 if private.is_admin() is not true then raise exception '관리자 권한이 필요합니다'; end if;
 if p_request is null then raise exception '요청 식별자가 필요합니다'; end if;
 perform pg_advisory_xact_lock(20261118,2);
 select * into e from public.stock2_events where request_id=p_request;
 if found then
  if e.mode<>'stocktake_import' or e.payload is distinct from p_rows then raise exception '같은 요청 ID에 다른 내용입니다'; end if;
  return p_request;
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception '행 형식 오류'; end if;
 if jsonb_array_length(p_rows) not between 1 and 2000 then raise exception '1~2000개 품목만 가능합니다'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  item_id:=(r->>'id')::uuid;
  if item_id is null or item_id=any(seen) then raise exception '누락 또는 중복 품목'; end if;
  seen:=array_append(seen,item_id);first_id:=coalesce(first_id,item_id);
  select * into i from public.stock2_items where id=item_id and active for update;
  if not found then raise exception '품목이 없습니다'; end if;
  if r->>'unit' is distinct from i.unit or (r->>'version')::int is distinct from i.version then raise exception '단위 또는 버전 변경: 최신 파일을 받으세요'; end if;
  if jsonb_typeof(r->'qty') is distinct from 'number' then raise exception '실재고는 숫자여야 합니다'; end if;
  amount:=(r->>'qty')::numeric;
  if amount<0 or amount>=1000000000 or amount<>round(amount,6) or (i.unit<>'kg' and amount<>trunc(amount)) or amount<i.reserved then raise exception '수량 범위·단위·예약량을 확인하세요'; end if;
  if length(coalesce(r->>'note',''))>500 then raise exception '메모는 500자 이내입니다'; end if;
  changes:=changes||jsonb_build_array(jsonb_build_object('id',item_id,'before',i.qty,'after',amount,'note',coalesce(r->>'note','')));
  update public.stock2_items set qty=amount,version=version+1,updated_at=now() where id=item_id;
 end loop;
 insert into public.stock2_events(request_id,actor,mode,item_id,qty,reason,changes,payload)
 values(p_request,auth.uid(),'stocktake_import',first_id,0,'엑셀 실사 '||jsonb_array_length(p_rows)||'개 품목',changes,p_rows);
 return p_request;
end $$;
create or replace function public.stock2_import_stocktake(p_request uuid,p_rows jsonb) returns uuid
language sql security invoker set search_path='' as $$select private.stock2_import_stocktake(p_request,p_rows)$$;
revoke all on function private.stock2_import_stocktake(uuid,jsonb),public.stock2_import_stocktake(uuid,jsonb) from public,anon;
grant execute on function private.stock2_import_stocktake(uuid,jsonb),public.stock2_import_stocktake(uuid,jsonb) to authenticated;
