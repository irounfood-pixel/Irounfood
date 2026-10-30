-- TEST PROJECT ONLY: all synthetic rows and mutations are rolled back.
BEGIN;
DO $test$
DECLARE sid text:='ML_STATE_REGRESSION_20261029_ONLY'; token text:=repeat('a',64); portal text:=repeat('b',64);
 u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();ids uuid[];oid uuid;v jsonb;payload jsonb;
 row1 public.partner_order_rows%rowtype; before_stock text;after_stock text;
BEGIN
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'')) INTO before_stock FROM public.inventory_items t;
 INSERT INTO public.partner_sheet_sources(sheet_id,partner_name,enabled) VALUES(sid,'ML 회귀검증 전용',true);
 INSERT INTO private.partner_sheet_tokens(sheet_id,token_hash,enabled) VALUES(sid,token,true);
 INSERT INTO private.partner_portal_tokens(sheet_id,token_hash,enabled) VALUES(sid,portal,true);
 payload:=jsonb_build_array(
  jsonb_build_object('source_row',2,'source_uid',u1,'order_date','2026-10-29','ship_date','2026-11-30','product_name','초코스틱','quantity','2','recipient','배송금지 테스트','contact','010-0000-0000','address','테스트 주소','note',''),
  jsonb_build_object('source_row',3,'source_uid',u2,'order_date','2026-10-29','ship_date','2026-11-30','product_name','과자집','quantity','3','recipient','배송금지 테스트','contact','010-0000-0000','address','테스트 주소','note',''));
 PERFORM public.partner_sheet_ingest(sid,token,payload);
 IF (SELECT count(*) FROM public.partner_order_rows WHERE sheet_id=sid AND status='등록')<>2 THEN RAISE EXCEPTION 'registration failed'; END IF;
 BEGIN
  PERFORM public.partner_portal_manage(sid,repeat('c',64),'status');
  RAISE EXCEPTION 'bad token was allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='bad token was allowed' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.partner_portal_manage('1cvd7XNsGMUfdMWudbqD4LFsBwIh6sTIdn8PWe_k4QNM',portal,'status');
  RAISE EXCEPTION 'cross-sheet token was allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='cross-sheet token was allowed' THEN RAISE; END IF; END;
 SELECT array_agg(id) INTO ids FROM public.partner_order_rows WHERE sheet_id=sid;
 PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.admin_users LIMIT 1),true);
 oid:=public.approve_partner_sheet_rows(ids);
 SELECT * INTO row1 FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u1;
 BEGIN
  PERFORM public.partner_portal_manage(sid,portal,'delete',u1,
   jsonb_build_array('2026-10-29','2026-11-30','초코스틱','2','배송금지 테스트','010-0000-0000','테스트 주소',''),row1.updated_at);
  RAISE EXCEPTION 'partial deletion of approved order allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='partial deletion of approved order allowed' THEN RAISE; END IF; END;
 UPDATE public.orders SET order_status='출고완료' WHERE id=oid;
 BEGIN
  PERFORM public.partner_portal_manage(sid,portal,'cancel',u1,
   jsonb_build_array('2026-10-29','2026-11-30','초코스틱','2','배송금지 테스트','010-0000-0000','테스트 주소',''),row1.updated_at);
  RAISE EXCEPTION 'shipped cancellation allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='shipped cancellation allowed' THEN RAISE; END IF; END;
 UPDATE public.orders SET order_status='주문접수' WHERE id=oid;
 v:=public.partner_portal_manage(sid,portal,'cancel',u1,
  jsonb_build_array('2026-10-29','2026-11-30','초코스틱','2','배송금지 테스트','010-0000-0000','테스트 주소',''),row1.updated_at);
 IF (SELECT count(*) FROM public.partner_order_rows WHERE sheet_id=sid AND status='등록' AND approved_order_id IS NULL)<>2 THEN RAISE EXCEPTION 'all product rows were not restored'; END IF;
 IF (SELECT order_status FROM public.orders WHERE id=oid)<>'취소' THEN RAISE EXCEPTION 'cancelled order history missing'; END IF;
 -- Edit the same UID and confirm no duplicate is created.
 payload:=jsonb_set(payload,'{0,quantity}','"5"');
 PERFORM public.partner_sheet_ingest(sid,token,payload);
 SELECT * INTO row1 FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u1;
 IF row1.quantity<>5 OR (SELECT count(*) FROM public.partner_order_rows WHERE sheet_id=sid)<>2 THEN RAISE EXCEPTION 'edit duplicated or failed'; END IF;
 BEGIN
  PERFORM public.partner_portal_manage(sid,portal,'delete',u1,
   jsonb_build_array('2026-10-29','2026-11-30','초코스틱','2','배송금지 테스트','010-0000-0000','테스트 주소',''),row1.updated_at);
  RAISE EXCEPTION 'stale snapshot accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale snapshot accepted' THEN RAISE; END IF; END;
 v:=public.partner_portal_manage(sid,portal,'delete',u1,
  jsonb_build_array('2026-10-29','2026-11-30','초코스틱','5','배송금지 테스트','010-0000-0000','테스트 주소',''),row1.updated_at);
 PERFORM public.partner_sheet_ingest(sid,token,payload);
 IF EXISTS(SELECT 1 FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u1) THEN RAISE EXCEPTION 'deleted order resurrected'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=oid AND order_status='취소') THEN RAISE EXCEPTION 'history deleted'; END IF;
 IF has_function_privilege('anon','public.partner_portal_manage(text,text,text,uuid,jsonb,timestamptz)','EXECUTE') OR
    has_function_privilege('authenticated','public.partner_portal_manage(text,text,text,uuid,jsonb,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'portal RPC publicly executable'; END IF;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'')) INTO after_stock FROM public.inventory_items t;
 IF before_stock IS DISTINCT FROM after_stock THEN RAISE EXCEPTION 'inventory changed'; END IF;
END $test$;
SELECT 'PASS: approval, shipped block, multi-item cancellation, registered edit, delete, replay suppression, scope and stale snapshot' AS result;
ROLLBACK;
