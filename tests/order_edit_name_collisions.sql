begin;
-- Reproduce the production legacy unique constraint in staging; rollback at the end.
do $constraint$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.order_items'::regclass and conname='order_items_order_id_kit_name_key') then
  alter table public.order_items add constraint order_items_order_id_kit_name_key unique(order_id,kit_name);
 end if;
end $constraint$;
do $test$
declare oid uuid; a public.products%rowtype; b public.products%rowtype;
 ia bigint; ib bigint; ts timestamptz; fields jsonb; before_items jsonb; inv_before jsonb; inv_after jsonb;
begin
 perform set_config('request.jwt.claim.sub',(select user_id::text from public.admin_users limit 1),true);
 select * into a from public.products where active=true and inventory_item_id is not null order by id limit 1;
 select * into b from public.products where active=true and inventory_item_id is not null and id<>a.id order by id limit 1;
 select jsonb_agg(to_jsonb(x) order by id) into inv_before from public.inventory_items x;
 insert into public.orders(customer_name,address,ship_date,receive_method) values('중복수정 회귀테스트','실제배송금지',current_date,'방문수령') returning id into oid;
 insert into public.order_items(order_id,product_id,kit_name,product_name_snapshot,quantity,unit_price_snapshot,inventory_item_id_snapshot,inventory_deduction_snapshot)
 values(oid,a.id,a.name,a.name,2,1234,a.inventory_item_id,a.deduction_qty) returning id into ia;
 insert into public.order_items(order_id,product_id,kit_name,product_name_snapshot,quantity,unit_price_snapshot,inventory_item_id_snapshot,inventory_deduction_snapshot)
 values(oid,b.id,b.name,b.name,3,2345,b.inventory_item_id,b.deduction_qty) returning id into ib;
 fields:=jsonb_build_object('customer_name','중복수정 회귀테스트','address','실제배송금지','ship_date',current_date,'receive_method','방문수령');
 select updated_at into ts from public.orders where id=oid;
 perform public.admin_update_order_v2(oid,ts,fields,jsonb_build_array(jsonb_build_object('item_id',ia,'product_id',a.id,'quantity',4),jsonb_build_object('item_id',ib,'product_id',b.id,'quantity',3)));
 if not exists(select 1 from public.order_items where id=ia and kit_name=a.name and quantity=4 and unit_price_snapshot=1234) then raise exception 'snapshot retention failed';end if;
 select updated_at into ts from public.orders where id=oid;
 perform public.admin_update_order_v2(oid,ts,fields,jsonb_build_array(jsonb_build_object('item_id',ia,'product_id',b.id,'quantity',4),jsonb_build_object('item_id',ib,'product_id',a.id,'quantity',3)));
 if not exists(select 1 from public.order_items where id=ia and kit_name=b.name) or not exists(select 1 from public.order_items where id=ib and kit_name=a.name) then raise exception 'swap failed';end if;
 select updated_at into ts from public.orders where id=oid;
 perform public.admin_update_order_v2(oid,ts,fields,jsonb_build_array(jsonb_build_object('product_id',a.id,'quantity',5)));
 if (select count(*) from public.order_items where order_id=oid)<>1 then raise exception 'replace failed';end if;
 select jsonb_agg(to_jsonb(x) order by id) into before_items from public.order_items x where order_id=oid;
 select updated_at into ts from public.orders where id=oid;
 begin
 perform public.admin_update_order_v2(oid,ts,fields,jsonb_build_array(jsonb_build_object('product_id',a.id,'quantity',5),jsonb_build_object('product_id',a.id,'quantity',4)));
 raise exception 'duplicate accepted';
 exception when raise_exception then if sqlerrm not like '같은 상품이 여러 줄%' then raise;end if;end;
 if before_items is distinct from (select jsonb_agg(to_jsonb(x) order by id) from public.order_items x where order_id=oid) then raise exception 'rollback failed';end if;
 begin
 perform public.admin_update_order_v2(oid,ts-interval '1 day',fields,jsonb_build_array(jsonb_build_object('product_id',a.id,'quantity',5)));
 raise exception 'stale accepted';
 exception when raise_exception then if sqlerrm not like '다른 작업에서%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
 perform public.admin_update_order_v2(oid,ts,fields,jsonb_build_array(jsonb_build_object('product_id',a.id,'quantity',5)));
 raise exception 'anonymous accepted';
 exception when raise_exception then if sqlerrm not like '관리자 권한%' then raise;end if;end;
 select jsonb_agg(to_jsonb(x) order by id) into inv_after from public.inventory_items x;
 if inv_before is distinct from inv_after then raise exception 'inventory changed';end if;
 if exists(select 1 from public.order_items where order_id=oid and kit_name like '__order_edit_%') then raise exception 'staged names leaked';end if;
end $test$;
select 'PASS: snapshot retention, swap, delete/readd, duplicate rollback, stale edit, auth, inventory unchanged' as result;
rollback;