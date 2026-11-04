DO $test$
DECLARE oid uuid; pid uuid; fields jsonb; items jsonb; inventory_before text;
BEGIN
 inventory_before:=(SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) FROM public.inventory_items i);
 PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.admin_users LIMIT 1),true);
 SELECT p.id INTO pid FROM public.products p JOIN public.inventory_items i ON i.id=p.inventory_item_id
 WHERE p.active AND i.active AND p.deduction_qty>0 LIMIT 1;
 oid:=public.create_admin_order_with_partner_v1(current_date,'거래처선택 테스트','테스트',null,
  current_date+1,'기관주문','테스트 주소','방문수령','롤백 테스트',jsonb_build_array(jsonb_build_object('product_id',pid,'quantity',1)),'ML');
 IF (SELECT partner_type FROM public.orders WHERE id=oid)<>'ML' OR
    (SELECT customer_name FROM public.orders WHERE id=oid)<>'거래처선택 테스트' THEN RAISE EXCEPTION 'create selection failed'; END IF;
 fields:=jsonb_build_object('customer_name','거래처선택 테스트','ship_date',(current_date+1)::text,
  'address','테스트 주소','receive_method','방문수령','partner_type','해당없음');
 SELECT jsonb_agg(jsonb_build_object('item_id',id,'product_id',product_id,'quantity',quantity)) INTO items FROM public.order_items WHERE order_id=oid;
 PERFORM public.admin_update_order_v2(oid,(SELECT updated_at FROM public.orders WHERE id=oid),fields,items);
 IF (SELECT partner_type FROM public.orders WHERE id=oid)<>'해당없음' THEN RAISE EXCEPTION 'ML to none failed'; END IF;
 fields:=jsonb_set(fields,'{partner_type}','"ML"');
 PERFORM public.admin_update_order_v2(oid,(SELECT updated_at FROM public.orders WHERE id=oid),fields,items);
 IF (SELECT partner_type FROM public.orders WHERE id=oid)<>'ML' THEN RAISE EXCEPTION 'none to ML failed'; END IF;
 BEGIN
  PERFORM public.admin_update_order_v2(oid,(SELECT updated_at FROM public.orders WHERE id=oid),jsonb_set(fields,'{partner_type}','"INVALID"'),items);
  RAISE EXCEPTION 'invalid selection accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='invalid selection accepted' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
 BEGIN
  PERFORM public.admin_update_order_v2(oid,(SELECT updated_at FROM public.orders WHERE id=oid),fields,items);
  RAISE EXCEPTION 'non-admin accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='non-admin accepted' THEN RAISE; END IF; END;
 IF inventory_before IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) FROM public.inventory_items i) THEN RAISE EXCEPTION 'inventory changed'; END IF;
 IF has_function_privilege('anon','public.create_admin_order_with_partner_v1(date,text,text,text,date,text,text,text,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'anon access'; END IF;
END $test$;
