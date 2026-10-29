create or replace function public.admin_update_order_v2(
 p_order_id uuid, p_expected_updated_at timestamptz, p_fields jsonb, p_items jsonb
) returns uuid language plpgsql security definer set search_path='' as $fn$
declare
 v_order public.orders%rowtype; v_existing public.order_items%rowtype;
 v_product public.products%rowtype; v_line jsonb; v_item_id bigint;
 v_product_id uuid; v_qty integer; v_keep bigint[]:=array[]::bigint[];
begin
 if auth.uid() is null or not private.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception '주문을 찾을 수 없습니다.'; end if;
 if v_order.order_status is null or v_order.order_status not in ('주문접수','준비중') then
  raise exception '주문접수·준비중 주문만 수정할 수 있습니다. 출고완료·취소 주문은 수정할 수 없습니다.';
 end if;
 if p_expected_updated_at is null or v_order.updated_at is distinct from p_expected_updated_at then
  raise exception '다른 작업에서 주문이 변경됐습니다. 새로고침 후 다시 수정해주세요.';
 end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object'
  or nullif(trim(p_fields->>'customer_name'),'') is null
  or nullif(trim(p_fields->>'address'),'') is null
  or nullif(p_fields->>'ship_date','') is null
  or coalesce(p_fields->>'receive_method','') not in ('택배','방문수령') then
  raise exception '고객/기관명, 배송일, 배송지, 수령방법을 확인해주세요.';
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
  raise exception '상품을 1~100개 행으로 입력해주세요.';
 end if;
 perform 1 from public.order_items where order_id=p_order_id order by id for update;
 for v_line in select value from jsonb_array_elements(p_items) loop
  if coalesce(v_line->>'quantity','') !~ '^[0-9]{1,4}$' then raise exception '상품 수량은 1~1000개의 정수로 입력해주세요.'; end if;
  v_qty:=(v_line->>'quantity')::integer;
  if v_qty<1 or v_qty>1000 then raise exception '상품 수량은 1~1000개의 정수로 입력해주세요.'; end if;
  v_item_id:=nullif(v_line->>'item_id','')::bigint;
  v_product_id:=nullif(v_line->>'product_id','')::uuid;
  v_existing:=null;
  if v_item_id is not null then
   if v_item_id=any(v_keep) then raise exception '중복된 주문 상품입니다.'; end if;
   select * into v_existing from public.order_items where id=v_item_id and order_id=p_order_id;
   if not found then raise exception '주문에 속하지 않는 상품 행입니다.'; end if;
  end if;
  if v_item_id is not null and v_product_id is not distinct from v_existing.product_id then
   -- Preserve the original price/inventory snapshots for unchanged products.
   update public.order_items set quantity=v_qty where id=v_item_id and order_id=p_order_id;
  else
   select * into v_product from public.products where id=v_product_id and active=true for share;
   if not found then raise exception '판매 중인 상품을 선택해주세요.'; end if;
   if v_product.inventory_item_id is null or v_product.deduction_qty is null or v_product.deduction_qty<=0
    or not exists(select 1 from public.inventory_items where id=v_product.inventory_item_id and active=true) then
    raise exception '상품의 재고 연결 설정을 확인해주세요.';
   end if;
   if v_item_id is null then
    insert into public.order_items(order_id,product_id,kit_name,product_name_snapshot,quantity,
     unit_price_snapshot,inventory_item_id_snapshot,inventory_deduction_snapshot)
    values(p_order_id,v_product.id,v_product.name,v_product.name,v_qty,v_product.price,
     v_product.inventory_item_id,v_product.deduction_qty) returning id into v_item_id;
   else
    update public.order_items set product_id=v_product.id,kit_name=v_product.name,
     product_name_snapshot=v_product.name,quantity=v_qty,unit_price_snapshot=v_product.price,
     inventory_item_id_snapshot=v_product.inventory_item_id,inventory_deduction_snapshot=v_product.deduction_qty
    where id=v_item_id and order_id=p_order_id;
   end if;
  end if;
  v_keep:=array_append(v_keep,v_item_id);
 end loop;
 delete from public.order_items where order_id=p_order_id and not(id=any(v_keep));
 update public.orders set
  order_date=coalesce(nullif(p_fields->>'order_date','')::date,v_order.order_date),
  customer_name=trim(p_fields->>'customer_name'),manager_name=nullif(trim(p_fields->>'manager_name'),''),
  contact=nullif(trim(p_fields->>'contact'),''),ship_date=(p_fields->>'ship_date')::date,
  address=trim(p_fields->>'address'),receive_method=p_fields->>'receive_method',
  note=nullif(trim(p_fields->>'note'),''),updated_at=clock_timestamp()
 where id=p_order_id;
 return p_order_id;
end;
$fn$;
revoke all on function public.admin_update_order_v2(uuid,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.admin_update_order_v2(uuid,timestamptz,jsonb,jsonb) to authenticated;
