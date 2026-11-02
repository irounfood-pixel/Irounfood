BEGIN;
DO $test$
DECLARE admin_id uuid; product_id uuid; orders jsonb; result jsonb; before_count bigint; saved_ids jsonb; tokens text[]; failed boolean:=false;
BEGIN
 -- An unauthenticated caller must fail before receiving any receipt/order data.
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.import_admin_orders_v1(repeat('a',64),'[]'); EXCEPTION WHEN OTHERS THEN failed:=position('관리자' in SQLERRM)>0; END;
 IF NOT failed THEN RAISE EXCEPTION 'authorization test failed'; END IF;
 SELECT user_id INTO admin_id FROM public.admin_users LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 SELECT id INTO product_id FROM public.products WHERE active AND inventory_item_id IS NOT NULL AND deduction_qty>0 LIMIT 1;
 SELECT count(*) INTO before_count FROM public.orders;
 orders:=jsonb_build_array(jsonb_build_object('order_date','2026-11-03','ship_date','2026-11-05','customer_name','UPLOAD_ROLLBACK_TEST',
  'manager_name','TEST','contact','01000000000','address','TEST','receive_method','방문수령','note','TRANSACTION_ONLY','items',jsonb_build_array(jsonb_build_object('product_id',product_id,'quantity',2))));
 result:=public.import_admin_orders_v1(repeat('a',64),orders,false);
 IF result->>'ready'<>'true' OR (select count(*) FROM public.orders)<>before_count THEN RAISE EXCEPTION 'preview wrote data'; END IF;
 -- Invalid second order must not leave the first order behind.
 failed:=false;
 BEGIN PERFORM public.import_admin_orders_v1(repeat('b',64),orders||jsonb_build_array(jsonb_set(orders->0,'{items,0,quantity}','0')),true); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed OR (SELECT count(*) FROM public.orders)<>before_count THEN RAISE EXCEPTION 'invalid batch not atomic'; END IF;
 -- Two valid mixed-method orders, no stock changes at order registration.
 orders:=orders||jsonb_build_array(jsonb_set(jsonb_set(orders->0,'{receive_method}','"택배"'),'{customer_name}','"UPLOAD_ROLLBACK_SECOND"'));
 result:=public.import_admin_orders_v1(repeat('c',64),orders,true);
 IF (result->>'created')::int<>2 THEN RAISE EXCEPTION 'batch not created: %',result; END IF;
 saved_ids:=result->'order_ids';
 result:=public.import_admin_orders_v1(repeat('c',64),orders,true);
 IF result->>'already_imported'<>'true' OR result->'order_ids'<>saved_ids OR (SELECT count(*) FROM public.orders)<>before_count+2 THEN RAISE EXCEPTION 'retry duplicated orders'; END IF;
 -- Changed file with identical order content is a reviewable duplicate.
 result:=public.import_admin_orders_v1(repeat('d',64),orders,true);
 IF (SELECT count(*) FROM public.orders)<>before_count+2 OR jsonb_array_length(result->'duplicates')<>2 THEN RAISE EXCEPTION 'duplicate not blocked'; END IF;
 SELECT array_agg(x->>'token') INTO tokens FROM jsonb_array_elements(result->'duplicates') x;
 result:=public.import_admin_orders_v1(repeat('d',64),orders,true,tokens);
 IF (result->>'created')::int<>2 THEN RAISE EXCEPTION 'confirmed duplicates failed'; END IF;
 -- Identical distinct rows within one file also require explicit confirmation.
 result:=public.import_admin_orders_v1(repeat('e',64),jsonb_build_array(jsonb_set(orders->0,'{note}','"IN_FILE_TEST"'),jsonb_set(orders->0,'{note}','"IN_FILE_TEST"')),false);
 IF jsonb_array_length(result->'duplicates')<>1 OR result#>>'{duplicates,0,same_file_orders,0}'<>'1' THEN RAISE EXCEPTION 'in-file duplicate missing'; END IF;
 IF has_function_privilege('anon','public.import_admin_orders_v1(text,jsonb,boolean,text[])','EXECUTE') THEN RAISE EXCEPTION 'anon grant'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: auth, preview, atomic failure, mixed methods, idempotent retry, duplicate confirmation, same-file duplicates; test writes rolled back' result;
