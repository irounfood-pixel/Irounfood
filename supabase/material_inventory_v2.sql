-- Additive inventory module. Does not alter legacy stock, orders or order triggers.
-- Apply only after review + staging tests. Requires existing private.is_admin().
create table public.stock2_items (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name)) between 1 and 150),
 kind text not null check(kind in ('raw','semi','product')), unit text not null check(unit in ('kg','개','봉','세트','팩','장','쌍','롤')),
 purchase_unit text not null default '', purchase_factor numeric check(purchase_factor>0 and purchase_factor<1000000000),
 estimated boolean not null default false, notes text not null default '', active boolean not null default true,
 qty numeric check(qty>=0 and qty<1000000000), reserved numeric not null default 0 check(reserved>=0 and reserved<1000000000),
 version integer not null default 1, updated_at timestamptz not null default now(),
 check ((qty is null and reserved=0) or (qty is not null and reserved<=qty)),
 check(unit='kg' or ((qty is null or qty=trunc(qty)) and reserved=trunc(reserved)))
);
create table public.stock2_recipes (
 parent_id uuid primary key references public.stock2_items(id),
 yield_qty numeric check(yield_qty>0 and yield_qty<1000000000),
 status text not null check(status in ('draft','confirmed')), lines jsonb not null check(jsonb_typeof(lines)='array'),
 updated_at timestamptz not null default now()
);
create table public.stock2_events (
 request_id uuid primary key, created_at timestamptz not null default now(), actor uuid not null,
 mode text not null, item_id uuid not null references public.stock2_items(id), qty numeric not null,
 reason text not null, changes jsonb not null, payload jsonb not null
);
alter table public.stock2_items enable row level security;
alter table public.stock2_recipes enable row level security;
alter table public.stock2_events enable row level security;
create policy stock2_items_read on public.stock2_items for select to authenticated using ((select private.is_admin()));
create policy stock2_recipes_read on public.stock2_recipes for select to authenticated using ((select private.is_admin()));
create policy stock2_events_read on public.stock2_events for select to authenticated using ((select private.is_admin()));
revoke all on public.stock2_items,public.stock2_recipes,public.stock2_events from public,anon,authenticated;
grant select on public.stock2_items,public.stock2_recipes,public.stock2_events to authenticated;
-- Write functions live in private, check admin authorization, and serialize only this module.
create function private.stock2_save_item(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_old public.stock2_items%rowtype;
begin
 if private.is_admin() is not true then raise exception '관리자 권한이 필요합니다'; end if;
 perform pg_advisory_xact_lock(20261118,2);
 v_id := coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
 select * into v_old from public.stock2_items where id=v_id;
 if found then
  if (p_payload->>'expected_version')::int is distinct from v_old.version then raise exception '다른 창에서 수정되었습니다. 새로고침하세요'; end if;
  if p_payload->>'kind' is distinct from v_old.kind or p_payload->>'unit' is distinct from v_old.unit then raise exception '등록 후 종류와 기준단위는 변경할 수 없습니다. 새 품목을 등록하세요'; end if;
  update public.stock2_items set name=trim(p_payload->>'name'),purchase_unit=coalesce(p_payload->>'purchase_unit',''),purchase_factor=nullif(p_payload->>'purchase_factor','')::numeric,estimated=coalesce((p_payload->>'estimated')::boolean,false),notes=coalesce(p_payload->>'notes',''),version=version+1,updated_at=now() where id=v_id;
 else
  insert into public.stock2_items(id,name,kind,unit,purchase_unit,purchase_factor,estimated,notes)
   values(v_id,trim(p_payload->>'name'),p_payload->>'kind',p_payload->>'unit',coalesce(p_payload->>'purchase_unit',''),nullif(p_payload->>'purchase_factor','')::numeric,coalesce((p_payload->>'estimated')::boolean,false),coalesce(p_payload->>'notes',''));
 end if;
 return v_id;
end $$;
create function private.stock2_save_recipe(p_parent uuid,p_yield numeric,p_lines jsonb,p_status text,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare v_parent public.stock2_items%rowtype; v_child public.stock2_items%rowtype; v_line jsonb; v_seen uuid[]='{}'; v_id uuid; v_qty numeric;
begin
 if private.is_admin() is not true then raise exception '관리자 권한이 필요합니다'; end if;
 perform pg_advisory_xact_lock(20261118,2);
 select * into v_parent from public.stock2_items where id=p_parent;
 if not found or v_parent.kind='raw' then raise exception '반제품 또는 제품만 레시피를 가질 수 있습니다'; end if;
 if p_expected_version is distinct from v_parent.version then raise exception '다른 창에서 수정되었습니다. 새로고침하세요'; end if;
 if (p_status='confirmed' and p_yield is null) or p_yield<=0 or p_yield>=1000000000 or (v_parent.unit<>'kg' and p_yield<>trunc(p_yield)) then raise exception '완성 기준수량을 확인하세요'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or (p_status='confirmed' and jsonb_array_length(p_lines)=0) then raise exception '재료를 하나 이상 입력하세요'; end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_id:=(v_line->>'itemId')::uuid; v_qty:=(v_line->>'qty')::numeric;
  if v_id=any(v_seen) then raise exception '같은 재료는 합쳐서 한 번 입력하세요'; end if;
  v_seen:=array_append(v_seen,v_id);
  select * into v_child from public.stock2_items where id=v_id and active;
  if not found or v_child.kind='product' then raise exception '원재료·반제품만 연결할 수 있습니다'; end if;
  if v_id=p_parent or exists(with recursive deps(id) as (select v_id union select (x.value->>'itemId')::uuid from deps d join public.stock2_recipes r on r.parent_id=d.id cross join lateral jsonb_array_elements(r.lines) x) select 1 from deps where id=p_parent) then raise exception '순환 레시피는 등록할 수 없습니다'; end if;
  if (p_status='confirmed' and v_qty is null) or v_qty<=0 or v_qty>=1000000000 then raise exception '배합량은 양수여야 합니다. 미확정 배합은 확정하지 마세요'; end if;
  if coalesce(v_line->>'rounding','none') not in ('none','ceil') then raise exception '올림 기준 오류'; end if;
 end loop;
 insert into public.stock2_recipes(parent_id,yield_qty,lines,status) values(p_parent,p_yield,p_lines,p_status)
 on conflict(parent_id) do update set yield_qty=excluded.yield_qty,lines=excluded.lines,status=excluded.status,updated_at=now();
 update public.stock2_items set version=version+1,updated_at=now() where id=p_parent;
end $$;
create function private.stock2_move(p_request uuid,p_item uuid,p_mode text,p_qty numeric,p_reason text,p_inputs jsonb,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare v_item public.stock2_items%rowtype; v_child public.stock2_items%rowtype; v_recipe public.stock2_recipes%rowtype; v_event public.stock2_events%rowtype; v_line jsonb; v_input jsonb; v_amount numeric; v_new numeric; v_changes jsonb='[]'; v_payload jsonb; v_count integer;
begin
 if private.is_admin() is not true then raise exception '관리자 권한이 필요합니다'; end if;
 if p_request is null then raise exception '요청 식별자가 필요합니다'; end if;
 perform pg_advisory_xact_lock(20261118,2);
 v_payload:=jsonb_build_object('item',p_item,'mode',p_mode,'qty',p_qty,'reason',p_reason,'inputs',p_inputs,'version',p_expected_version);
 select * into v_event from public.stock2_events where request_id=p_request;
 if found then
  if v_event.payload is distinct from v_payload then raise exception '같은 요청 ID로 다른 내용을 저장할 수 없습니다'; end if;
  return p_request;
 end if;
 if p_mode is null or p_mode not in ('receive','set','reserve','issue','produce') or p_qty is null or p_qty<0 or p_qty>=1000000000 or length(trim(coalesce(p_reason,'')))=0 then raise exception '처리 종류·수량·사유를 확인하세요'; end if;
 if p_mode in ('receive','issue','produce') and p_qty=0 then raise exception '수량은 0보다 커야 합니다'; end if;
 select * into v_item from public.stock2_items where id=p_item and active;
 if not found then raise exception '품목이 없습니다'; end if;
 if p_expected_version is distinct from v_item.version then raise exception '다른 창에서 수정되었습니다. 새로고침하세요'; end if;
 if v_item.unit<>'kg' and p_qty<>trunc(p_qty) then raise exception '개수 단위는 정수로 입력하세요'; end if;
 if p_mode<>'set' and v_item.qty is null then raise exception '먼저 실재고를 확인하여 입력하세요'; end if;
 if p_mode='produce' then
  select * into v_recipe from public.stock2_recipes where parent_id=p_item and status='confirmed';
  if not found then raise exception '확정된 레시피가 필요합니다'; end if;
  if jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs)<>jsonb_array_length(v_recipe.lines) then raise exception '실제 사용량을 모든 재료에 입력하세요'; end if;
  select count(distinct value->>'itemId') into v_count from jsonb_array_elements(p_inputs);
  if v_count<>jsonb_array_length(p_inputs) then raise exception '중복 재료 사용량'; end if;
  for v_line in select value from jsonb_array_elements(v_recipe.lines) loop
   select value into v_input from jsonb_array_elements(p_inputs) where value->>'itemId'=v_line->>'itemId';
   if not found then raise exception '레시피와 사용 재료가 다릅니다'; end if;
   v_amount:=(v_input->>'qty')::numeric;
   select * into v_child from public.stock2_items where id=(v_line->>'itemId')::uuid and active;
   if not found or v_child.qty is null or v_amount is null or v_amount<=0 or v_amount>=1000000000 then raise exception '재료 실재고·실제 사용량을 확인하세요'; end if;
   if v_child.unit<>'kg' and v_amount<>trunc(v_amount) then raise exception '개수 단위 사용량은 정수로 입력하세요'; end if;
   if v_child.qty-v_child.reserved<v_amount then raise exception '% 재고가 부족합니다 (예약 제외)',v_child.name; end if;
   update public.stock2_items set qty=qty-v_amount,version=version+1,updated_at=now() where id=v_child.id;
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',v_child.id,'before',v_child.qty,'after',v_child.qty-v_amount,'delta',-v_amount));
  end loop;
 end if;
 if p_mode='reserve' then
  if p_qty>v_item.qty then raise exception '예약량이 실재고를 초과합니다'; end if;
  update public.stock2_items set reserved=p_qty,version=version+1,updated_at=now() where id=p_item;
  v_changes:=jsonb_build_array(jsonb_build_object('id',p_item,'reservedBefore',v_item.reserved,'reservedAfter',p_qty));
 else
  v_new:=case when p_mode='set' then p_qty when p_mode='issue' then v_item.qty-p_qty else v_item.qty+p_qty end;
  if v_new<v_item.reserved then raise exception '예약을 제외한 가용재고가 부족합니다. 예약 출고라면 예약량부터 해제하세요'; end if;
  update public.stock2_items set qty=v_new,version=version+1,updated_at=now() where id=p_item;
  v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',p_item,'before',v_item.qty,'after',v_new,'delta',case when v_item.qty is null then null else v_new-v_item.qty end));
 end if;
 insert into public.stock2_events(request_id,actor,mode,item_id,qty,reason,changes,payload) values(p_request,auth.uid(),p_mode,p_item,p_qty,trim(p_reason),v_changes,v_payload);
 return p_request;
end $$;
create function public.stock2_save_item(p_payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.stock2_save_item(p_payload)$$;
create function public.stock2_save_recipe(p_parent uuid,p_yield numeric,p_lines jsonb,p_status text,p_expected_version integer) returns void language sql security invoker set search_path='' as $$select private.stock2_save_recipe(p_parent,p_yield,p_lines,p_status,p_expected_version)$$;
create function public.stock2_move(p_request uuid,p_item uuid,p_mode text,p_qty numeric,p_reason text,p_inputs jsonb default null,p_expected_version integer default null) returns uuid language sql security invoker set search_path='' as $$select private.stock2_move(p_request,p_item,p_mode,p_qty,p_reason,p_inputs,p_expected_version)$$;
revoke all on function private.stock2_save_item(jsonb),public.stock2_save_item(jsonb),private.stock2_save_recipe(uuid,numeric,jsonb,text,integer),public.stock2_save_recipe(uuid,numeric,jsonb,text,integer),private.stock2_move(uuid,uuid,text,numeric,text,jsonb,integer),public.stock2_move(uuid,uuid,text,numeric,text,jsonb,integer) from public,anon;
grant execute on function private.stock2_save_item(jsonb),public.stock2_save_item(jsonb),private.stock2_save_recipe(uuid,numeric,jsonb,text,integer),public.stock2_save_recipe(uuid,numeric,jsonb,text,integer),private.stock2_move(uuid,uuid,text,numeric,text,jsonb,integer),public.stock2_move(uuid,uuid,text,numeric,text,jsonb,integer) to authenticated;
