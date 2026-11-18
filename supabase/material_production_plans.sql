-- Staging-only additive production plans. Requires material_inventory_v2.sql.
-- No triggers, stock deductions, reservations, order links or real recipe seeds.
create table public.stock2_plans (
 id uuid primary key, plan_date date not null,
 demands jsonb not null check(jsonb_typeof(demands)='array' and jsonb_array_length(demands) between 1 and 100),
 notes text not null default '' check(length(notes)<=1000),
 status text not null check(status in ('planned','cancelled')),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(plan_date between date '2000-01-01' and date '2100-12-31')
);
create index stock2_plans_date_idx on public.stock2_plans(plan_date);
create table private.stock2_plan_requests (
 request_id uuid primary key, plan_id uuid not null references public.stock2_plans(id),
 payload jsonb not null, created_at timestamptz not null default now()
);
alter table public.stock2_plans enable row level security;
alter table private.stock2_plan_requests enable row level security;
create policy stock2_plans_admin_read on public.stock2_plans for select to authenticated using ((select private.is_admin()));
revoke all on public.stock2_plans from public,anon,authenticated;
grant select on public.stock2_plans to authenticated;
revoke all on private.stock2_plan_requests from public,anon,authenticated;
create function private.stock2_save_plan(p_request uuid,p_id uuid,p_date date,p_demands jsonb,p_notes text,p_status text,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_old public.stock2_plans%rowtype; v_request private.stock2_plan_requests%rowtype;
 v_payload jsonb; v_item public.stock2_items%rowtype; v_line jsonb; v_qty numeric; v_id uuid; v_seen uuid[]='{}';
begin
 if private.is_admin() is not true then raise exception '관리자 권한이 필요합니다'; end if;
 if p_request is null or p_id is null then raise exception '요청과 계획 식별자가 필요합니다'; end if;
 perform pg_advisory_xact_lock(20261118,2);
 v_payload:=jsonb_build_object('id',p_id,'date',p_date,'demands',p_demands,'notes',p_notes,'status',p_status,'version',p_expected_version);
 select * into v_request from private.stock2_plan_requests where request_id=p_request;
 if found then
  if v_request.payload is distinct from v_payload then raise exception '같은 요청 ID로 다른 내용을 저장할 수 없습니다'; end if;
  return v_request.plan_id;
 end if;
 if p_date is null or p_date<date '2000-01-01' or p_date>date '2100-12-31' or p_status is null or p_status not in ('planned','cancelled') or p_notes is null or length(p_notes)>1000 then raise exception '예정일·상태·메모를 확인하세요'; end if;
 if jsonb_typeof(p_demands) is distinct from 'array' then raise exception '생산 품목 배열이 필요합니다'; end if;
 if jsonb_array_length(p_demands) not between 1 and 100 then raise exception '생산 품목은 1~100개 행으로 입력하세요'; end if;
 for v_line in select value from jsonb_array_elements(p_demands) loop
  if jsonb_typeof(v_line) is distinct from 'object' or jsonb_typeof(v_line->'qty') is distinct from 'number' then raise exception '생산 품목·수량 형식 오류'; end if;
  v_id:=(v_line->>'itemId')::uuid; v_qty:=(v_line->>'qty')::numeric;
  select * into v_item from public.stock2_items where id=v_id and active;
  if not found or v_item.kind='raw' then raise exception '활성 반제품 또는 제품을 선택하세요'; end if;
  if v_id=any(v_seen) then raise exception '같은 생산 품목은 한 행으로 합쳐 주세요'; end if;
  v_seen:=array_append(v_seen,v_id);
  if v_qty is null or v_qty<0.000001 or v_qty>=1000000000 or (v_item.unit<>'kg' and v_qty<>trunc(v_qty)) then raise exception '생산량은 양수이며 개수 단위는 정수여야 합니다'; end if;
 end loop;
 select * into v_old from public.stock2_plans where id=p_id;
 if found then
  if p_expected_version is distinct from v_old.version then raise exception '다른 창에서 계획이 수정되었습니다. 새로고침하세요'; end if;
  update public.stock2_plans set plan_date=p_date,demands=p_demands,notes=trim(p_notes),status=p_status,version=version+1,updated_at=now() where id=p_id;
 else
  if p_expected_version is distinct from 0 then raise exception '계획이 없습니다. 새로고침하세요'; end if;
  insert into public.stock2_plans(id,plan_date,demands,notes,status) values(p_id,p_date,p_demands,trim(p_notes),p_status);
 end if;
 insert into private.stock2_plan_requests(request_id,plan_id,payload) values(p_request,p_id,v_payload);
 return p_id;
end $$;
create function public.stock2_save_plan(p_request uuid,p_id uuid,p_date date,p_demands jsonb,p_notes text,p_status text,p_expected_version integer)
returns uuid language sql security invoker set search_path='' as $$select private.stock2_save_plan(p_request,p_id,p_date,p_demands,p_notes,p_status,p_expected_version)$$;
revoke all on function private.stock2_save_plan(uuid,uuid,date,jsonb,text,text,integer),public.stock2_save_plan(uuid,uuid,date,jsonb,text,text,integer) from public,anon;
grant execute on function private.stock2_save_plan(uuid,uuid,date,jsonb,text,text,integer),public.stock2_save_plan(uuid,uuid,date,jsonb,text,text,integer) to authenticated;
