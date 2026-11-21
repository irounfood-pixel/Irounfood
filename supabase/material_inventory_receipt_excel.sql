-- Atomic additive receipts for the existing inventory administrator only.
create or replace function private.stock2_import_receipts(p_request uuid,p_rows jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r jsonb; i public.stock2_items%rowtype; e public.stock2_events%rowtype;
 seen uuid[]='{}'; v_id uuid; v_first uuid; v_entry numeric; v_factor numeric; v_unit text;
 v_delta numeric; v_after numeric; v_note text; v_changes jsonb='[]';
begin
 if private.is_admin() is not true then raise exception '관리자 권한이 필요합니다'; end if;
 if p_request is null then raise exception '요청 식별자가 필요합니다'; end if;
 perform pg_advisory_xact_lock(20261118,2);
 select * into e from public.stock2_events where request_id=p_request;
 if found then
  if e.actor is distinct from auth.uid() or e.mode<>'receipt_import' or e.payload is distinct from p_rows then raise exception '같은 요청 ID에 다른 내용입니다'; end if;
  return p_request;
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception '행 형식 오류'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception '1~1000개 품목만 가능합니다'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  v_id:=(r->>'id')::uuid;
  if v_id is null or v_id=any(seen) then raise exception '누락 또는 중복 품목'; end if;
  seen:=array_append(seen,v_id);v_first:=coalesce(v_first,v_id);
  select * into i from public.stock2_items where id=v_id and active for update;
  if not found then raise exception '품목이 없습니다'; end if;
  if (r->>'version')::int is distinct from i.version then raise exception '%: 재고가 변경됐습니다. 최신 양식을 받으세요',i.name; end if;
  if i.qty is null then raise exception '%: 먼저 실사 수량을 입력하세요',i.name; end if;
  v_unit:=i.unit;v_factor:=1;
  if i.unit<>'kg' and not i.estimated and i.purchase_unit<>'' and i.purchase_unit<>i.unit
     and i.purchase_factor>1 and i.purchase_factor=trunc(i.purchase_factor) then
   v_unit:=i.purchase_unit;v_factor:=i.purchase_factor;
  end if;
  if r->>'entry_unit' is distinct from v_unit or jsonb_typeof(r->'entry_qty') is distinct from 'number' then
    raise exception '%: 입고 단위 또는 수량을 확인하세요',i.name;
  end if;
  v_entry:=(r->>'entry_qty')::numeric;
  if v_entry<=0 or v_entry>=1000000000 or v_entry<>round(v_entry,6) or (i.unit<>'kg' and v_entry<>trunc(v_entry)) then
   raise exception '%: 입고 수량을 확인하세요',i.name;
  end if;
  v_delta:=v_entry*v_factor; v_after:=i.qty+v_delta;v_note:=coalesce(r->>'note','');
  if v_after>=1000000000 or length(v_note)>500 then raise exception '%: 입고 수량 또는 메모 길이를 확인하세요',i.name; end if;
  v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',v_id,'before',i.qty,'after',v_after,'note',v_note));
  update public.stock2_items set qty=v_after,version=version+1,updated_at=now() where id=v_id;
 end loop;
 insert into public.stock2_events(request_id,actor,mode,item_id,qty,reason,changes,payload)
 values(p_request,auth.uid(),'receipt_import',v_first,0,'엑셀 입고 '||jsonb_array_length(p_rows)||'개 품목',v_changes,p_rows);
 return p_request;
end $$;
create or replace function public.stock2_import_receipts(p_request uuid,p_rows jsonb) returns uuid
language sql security invoker set search_path='' as $$select private.stock2_import_receipts(p_request,p_rows)$$;
revoke all on function private.stock2_import_receipts(uuid,jsonb),public.stock2_import_receipts(uuid,jsonb) from public,anon;
grant execute on function private.stock2_import_receipts(uuid,jsonb),public.stock2_import_receipts(uuid,jsonb) to authenticated;
