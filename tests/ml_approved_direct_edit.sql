BEGIN;
DO $test$
DECLARE sid text:='ML_DIRECT_REGRESSION_20261030'; tok text:=repeat('d',64); u uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();
 payload jsonb; r public.partner_order_rows%rowtype; oid uuid; before_stock text; before_shipping text; v jsonb; oldtime timestamptz; oldfields jsonb;
BEGIN
 SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) INTO before_stock FROM public.inventory_items t;
 SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY order_id)::text) INTO before_shipping FROM public.order_shipping_details t;
 INSERT INTO public.partner_sheet_sources(sheet_id,partner_name,enabled) VALUES(sid,'ML',true);
 INSERT INTO private.partner_sheet_tokens(sheet_id,token_hash,enabled) VALUES(sid,tok,true);
 INSERT INTO private.partner_portal_tokens(sheet_id,token_hash,enabled) VALUES(sid,tok,true);
 payload:=jsonb_build_array(jsonb_build_object('source_row',2,'source_uid',u,'order_date','2026-10-30','ship_date','2026-12-01','product_name','초코스틱','quantity','2','recipient','테스트','contact','010-0000-0000','address','테스트 주소','note',''),jsonb_build_object('source_row',3,'source_uid',u2,'order_date','2026-10-30','ship_date','2026-12-01','product_name','과자집','quantity','3','recipient','테스트','contact','010-0000-0000','address','테스트 주소','note',''));
 PERFORM public.partner_sheet_ingest(sid,tok,payload);
 PERFORM set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.admin_users LIMIT 1),true);
 oid:=public.approve_partner_sheet_rows((SELECT array_agg(id) FROM public.partner_order_rows WHERE sheet_id=sid));
 SELECT * INTO r FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u;
 IF r.approved_item_id IS NULL THEN RAISE EXCEPTION 'item binding missing'; END IF;
 oldfields:=jsonb_build_array('2026-10-30','2026-12-01','초코스틱','2','테스트','010-0000-0000','테스트 주소','');oldtime:=r.updated_at;
 v:=public.partner_portal_update(sid,tok,u,oldfields,oldtime,jsonb_build_array('2026-10-30','2026-12-02','초코스틱','5','수정 수령인','010-0000-0000','수정 주소','수정 요청'));
 SELECT * INTO r FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u;
 IF r.status<>'승인' OR r.approved_order_id<>oid OR r.quantity<>5 OR (SELECT order_status FROM public.orders WHERE id=oid)<>'주문접수' OR (SELECT quantity FROM public.order_items WHERE id=r.approved_item_id)<>5 THEN RAISE EXCEPTION 'approved direct edit failed'; END IF;
 IF (SELECT count(*) FROM public.partner_order_rows WHERE approved_order_id=oid AND address='수정 주소' AND ship_date='2026-12-02')<>2 THEN RAISE EXCEPTION 'sibling header mirror failed'; END IF;
 BEGIN
  PERFORM public.partner_portal_update(sid,tok,u,oldfields,oldtime,oldfields);
  RAISE EXCEPTION 'stale request accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale request accepted' THEN RAISE; END IF;END;
 BEGIN
  PERFORM public.partner_portal_update(sid,repeat('e',64),u,oldfields,oldtime,oldfields);
  RAISE EXCEPTION 'bad token accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='bad token accepted' THEN RAISE; END IF;END;
 -- Admin order edit mirrors product quantity and headers without cancellation.
 PERFORM public.admin_update_order_v2(oid,(SELECT updated_at FROM public.orders WHERE id=oid),jsonb_build_object('customer_name','ML','manager_name','관리자 수정','contact','010-0000-0000','ship_date','2026-12-03','address','관리자 주소','receive_method','택배','note','관리자 요청'),(SELECT jsonb_agg(jsonb_build_object('item_id',id,'product_id',product_id,'quantity',quantity+1)) FROM public.order_items WHERE order_id=oid));
 SELECT * INTO r FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u;
 IF r.quantity<>6 OR r.recipient<>'관리자 수정' OR r.approved_order_id<>oid OR r.status<>'승인' THEN RAISE EXCEPTION 'admin mirror failed'; END IF;
 UPDATE public.orders SET order_status='출고완료' WHERE id=oid;
 BEGIN
  PERFORM private.partner_order_action_core(r.id,'delete');RAISE EXCEPTION 'shipped delete accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='shipped delete accepted' THEN RAISE; END IF;END;
 BEGIN
  PERFORM private.update_ml_row(r.id,jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,r.quantity::text,r.recipient,r.contact,r.address,r.note),r.updated_at,jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,'7',r.recipient,r.contact,r.address,r.note));RAISE EXCEPTION 'shipped edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='shipped edit accepted' THEN RAISE; END IF;END;
 UPDATE public.orders SET order_status='주문접수' WHERE id=oid;
 PERFORM public.admin_manage_partner_row(r.id,'delete');
 IF EXISTS(SELECT 1 FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u) OR (SELECT count(*) FROM public.order_items WHERE order_id=oid)<>1 OR (SELECT order_status FROM public.orders WHERE id=oid)<>'주문접수' THEN RAISE EXCEPTION 'approved partial delete failed'; END IF;
 PERFORM public.partner_sheet_ingest(sid,tok,payload);
 IF EXISTS(SELECT 1 FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u) THEN RAISE EXCEPTION 'deleted uid resurrected'; END IF;
 SELECT * INTO r FROM public.partner_order_rows WHERE sheet_id=sid AND source_uid=u2;
 PERFORM public.partner_portal_manage(sid,tok,'delete',u2,jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,r.quantity::text,r.recipient,r.contact,r.address,r.note),r.updated_at);
 IF EXISTS(SELECT 1 FROM public.partner_order_rows WHERE sheet_id=sid) OR (SELECT deleted_at FROM public.orders WHERE id=oid) IS NULL THEN RAISE EXCEPTION 'last item deletion failed'; END IF;
 IF before_stock IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.inventory_items t) THEN RAISE EXCEPTION 'inventory changed'; END IF;
 IF before_shipping IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY order_id)::text) FROM public.order_shipping_details t) THEN RAISE EXCEPTION 'shipping changed'; END IF;
 IF has_function_privilege('anon','public.partner_portal_update(text,text,uuid,jsonb,timestamptz,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.partner_portal_update(text,text,uuid,jsonb,timestamptz,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public RPC exposure';END IF;
END $test$;
SELECT 'PASS: approved portal edit, admin edit mirror, same approval/order, stale and auth rejection, shipped guards, partial and last delete, replay suppression, inventory/shipping unchanged' result;
ROLLBACK;
