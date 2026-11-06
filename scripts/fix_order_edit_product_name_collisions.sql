DO $patch$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.admin_update_order_v2(uuid,timestamptz,jsonb,jsonb)'::regprocedure) INTO v_def;
 IF position('v_original_names jsonb' in v_def)>0 THEN RETURN; END IF;
 IF position('v_product_id uuid; v_qty integer;' in v_def)=0 OR position('set quantity=v_qty where id=v_item_id' in v_def)=0 THEN
 RAISE EXCEPTION 'Unexpected admin_update_order_v2 definition'; END IF;
 v_def:=replace(v_def,'v_product_id uuid; v_qty integer;','v_product_id uuid; v_qty integer; v_original_names jsonb; v_name_prefix text; v_constraint text;');
 v_def:=replace(v_def,
 ' perform 1 from public.order_items where order_id=p_order_id order by id for update;',
 $stage$ perform 1 from public.order_items where order_id=p_order_id order by id for update;
 select coalesce(jsonb_object_agg(id::text,kit_name),'{}'::jsonb) into v_original_names
 from public.order_items where order_id=p_order_id;
 v_name_prefix:='__order_edit_'||gen_random_uuid()::text||'_';
 update public.order_items set kit_name=v_name_prefix||id::text where order_id=p_order_id;
$stage$);
 v_def:=replace(v_def,'set quantity=v_qty where id=v_item_id','set quantity=v_qty,kit_name=v_original_names->>v_item_id::text where id=v_item_id');
 v_def:=replace(v_def,E' return p_order_id;\nend;',
 $handler$ return p_order_id;
exception when unique_violation then
 get stacked diagnostics v_constraint=CONSTRAINT_NAME;
 if v_constraint='order_items_order_id_kit_name_key' then
  raise exception '같은 상품이 여러 줄에 선택되어 있습니다. 상품별로 한 줄만 남기고 수량을 합쳐주세요.';
 end if;
 raise;
end;$handler$);
 EXECUTE v_def;
END $patch$;