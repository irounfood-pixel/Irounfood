-- STAGING ONLY. Run after the reviewed function DDL. All fixtures roll back.
-- Explicit order numbers avoid touching the non-transactional order number sequence.
BEGIN;
DO $test$
DECLARE
 sid text := '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM';
 a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
 d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid();
 g uuid := gen_random_uuid(); h uuid := gen_random_uuid();
 uid_c uuid := gen_random_uuid(); uid_d uuid := gen_random_uuid(); uid_e uuid := gen_random_uuid();
 uid_f uuid := gen_random_uuid(); uid_pending uuid := gen_random_uuid();
 j jsonb; hidden jsonb; tok text; n integer; exp jsonb; stamp timestamptz;
BEGIN
 UPDATE public.partner_sheet_sources SET enabled=true WHERE sheet_id=sid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staging ML source is missing'; END IF;
 SELECT token_hash INTO tok FROM private.partner_portal_tokens WHERE sheet_id=sid AND enabled LIMIT 1;
 IF tok IS NULL THEN
  tok := repeat('a',64); -- non-secret test hash; this change is rolled back
  INSERT INTO private.partner_portal_tokens(sheet_id,token_hash,enabled) VALUES(sid,tok,true)
  ON CONFLICT (sheet_id) DO UPDATE SET token_hash=excluded.token_hash,enabled=true;
 END IF;
 INSERT INTO public.orders(id,order_no,customer_name,address,ship_date,partner_type,order_status,deleted_at)
 VALUES
 (a,'test-'||a,'fixture old','fixture','2098-01-01','ML','주문접수',NULL),
 (b,'test-'||b,'fixture recent','fixture','2099-01-01','ML','주문접수',NULL),
 (c,'test-'||c,'fixture linked legacy','fixture','2099-01-02',NULL,'주문접수',NULL),
 (d,'test-'||d,'fixture non ML linked','fixture','2099-01-02','해당없음','주문접수',NULL),
 (e,'test-'||e,'fixture cancelled','fixture','2099-01-02','ML','취소',NULL),
 (f,'test-'||f,'fixture deleted','fixture','2099-01-02','ML','주문접수',now()),
 (g,'test-'||g,'ML fixture unclassified','fixture','2099-01-02',NULL,'주문접수',NULL),
 (h,'test-'||h,'fixture other sheet','fixture','2099-01-02',NULL,'주문접수',NULL);
 INSERT INTO public.partner_order_rows(sheet_id,source_row,source_uid,content_hash,order_date,ship_date,product_name,quantity,recipient,contact,address,status,approved_order_id)
 VALUES
 (sid,19001,uid_c,'fixture',CURRENT_DATE,'2099-01-02','fixture',1,'fixture','fixture','fixture','승인',c),
 (sid,19002,uid_d,'fixture',CURRENT_DATE,'2099-01-02','fixture',1,'fixture','fixture','fixture','승인',d),
 (sid,19003,uid_e,'fixture',CURRENT_DATE,'2099-01-02','fixture',1,'fixture','fixture','fixture','승인',e),
 (sid,19004,uid_f,'fixture',CURRENT_DATE,'2099-01-02','fixture',1,'fixture','fixture','fixture','승인',f),
 (sid,19005,uid_pending,'fixture',CURRENT_DATE,'2099-01-02','fixture',1,'fixture','fixture','fixture','등록',NULL);
 INSERT INTO public.order_photos(order_id,storage_path,original_name,content_type,size_bytes,uploaded_by,created_at)
 SELECT a,a::text||'/fixture-'||i||'.jpg','fixture.jpg','image/jpeg',1,a,'2098-01-01'::timestamptz
 FROM generate_series(1,250) i;
 INSERT INTO public.order_photos(order_id,storage_path,original_name,content_type,size_bytes,uploaded_by,created_at)
 SELECT id,id::text||'/fixture.jpg','fixture.jpg','image/jpeg',1,a,'2099-01-01'::timestamptz
 FROM unnest(ARRAY[b,c,d,e,f,g,h]) id;
 j := public.ml_portal_photo_manifest_scoped(NULL,NULL,b);
 IF jsonb_array_length(j->'photos')<>1 THEN RAISE EXCEPTION 'New order lost behind historic photo cap'; END IF;
 j := public.ml_portal_photo_manifest_scoped('2099-01-01','2099-01-01',NULL);
 IF jsonb_array_length(j->'photos')<>1 THEN RAISE EXCEPTION 'Date filter not applied before cap'; END IF;
 j := public.ml_portal_photo_manifest_scoped(NULL,NULL,a);
 IF jsonb_array_length(j->'photos')<>201 THEN RAISE EXCEPTION 'Photo overflow sentinel missing'; END IF;
 j := public.ml_portal_photo_manifest_scoped(NULL,NULL,c);
 IF jsonb_array_length(j->'rows')<>1 OR jsonb_array_length(j->'photos')<>1 THEN RAISE EXCEPTION 'Approved legacy linkage missing'; END IF;
 FOREACH a IN ARRAY ARRAY[d,e,f,g,h] LOOP
  j := public.ml_portal_photo_manifest_scoped(NULL,NULL,a);
  IF jsonb_array_length(j->'rows')<>0 OR jsonb_array_length(j->'photos')<>0 THEN RAISE EXCEPTION 'Excluded order leaked'; END IF;
 END LOOP;
 IF to_regprocedure('private.assert_ml_portal_order_scope(text,uuid)') IS NOT NULL THEN
  PERFORM private.assert_ml_portal_order_scope(sid,uid_c);
  PERFORM private.assert_ml_portal_order_scope(sid,uid_pending);
  SELECT jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,r.quantity::text,r.recipient,r.contact,r.address,r.note),r.updated_at
  INTO exp,stamp FROM public.partner_order_rows r WHERE source_uid=uid_d AND sheet_id=sid;
  BEGIN
   PERFORM public.partner_portal_manage(sid,tok,'cancel',uid_d,exp,stamp);
   RAISE EXCEPTION 'Hidden order cancellation unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> '현재 거래처에서 처리할 수 없는 주문입니다.' THEN RAISE; END IF;
  END;
  BEGIN
   PERFORM public.partner_portal_update(sid,tok,uid_d,exp,stamp,'{}'::jsonb);
   RAISE EXCEPTION 'Hidden order update unexpectedly allowed';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> '현재 거래처에서 처리할 수 없는 주문입니다.' THEN RAISE; END IF;
  END;
 END IF;
 hidden := public.ml_portal_hidden_uids(sid,tok);
 IF NOT (hidden ? uid_d::text AND hidden ? uid_e::text AND hidden ? uid_f::text)
    OR hidden ? uid_c::text OR hidden ? uid_pending::text THEN RAISE EXCEPTION 'Hidden UID set incorrect'; END IF;
 BEGIN
  PERFORM public.ml_portal_hidden_uids(sid,'invalid-test-token-hash');
  RAISE EXCEPTION 'Invalid token unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Invalid token unexpectedly allowed' THEN RAISE; END IF;
 END;
 IF has_function_privilege('anon','public.ml_portal_photo_manifest_scoped(date,date,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.ml_portal_hidden_uids(text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Browser role has privileged RPC access';
 END IF;
END;
$test$;
ROLLBACK;
SELECT 'PASS: scoped photos, overflow, exclusions, legacy linkage, pending rows, hidden UIDs, invalid token, grants; all fixtures rolled back' AS result;
