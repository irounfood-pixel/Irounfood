ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- ML direct edits preserve approval/order ID; deletion suppresses future sync replay.
ALTER TABLE public.partner_order_rows ADD COLUMN IF NOT EXISTS approved_item_id bigint;

CREATE OR REPLACE FUNCTION private.ml_sheet(p_sheet text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.partner_sheet_sources WHERE sheet_id=p_sheet AND enabled AND partner_name='ML');
$$;
REVOKE ALL ON FUNCTION private.ml_sheet(text) FROM PUBLIC,anon,authenticated,service_role;

-- The operational order has a unique (order_id, kit_name). Bind to its stable item ID.
UPDATE public.partner_order_rows r SET approved_item_id=i.id FROM public.order_items i
WHERE private.ml_sheet(r.sheet_id) AND r.status='승인' AND r.approved_order_id=i.order_id
 AND r.product_name=i.kit_name AND r.approved_item_id IS NULL;

CREATE OR REPLACE FUNCTION private.bind_ml_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='승인' AND NEW.approved_order_id IS NOT NULL AND private.ml_sheet(NEW.sheet_id)
 AND (NEW.approved_item_id IS NULL OR NEW.approved_order_id IS DISTINCT FROM OLD.approved_order_id) THEN
  SELECT id INTO NEW.approved_item_id FROM public.order_items
   WHERE order_id=NEW.approved_order_id AND kit_name=NEW.product_name;
 END IF;
 IF NEW.approved_order_id IS NULL THEN NEW.approved_item_id:=NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.bind_ml_item() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS bind_ml_item ON public.partner_order_rows;
CREATE TRIGGER bind_ml_item BEFORE INSERT OR UPDATE ON public.partner_order_rows FOR EACH ROW EXECUTE FUNCTION private.bind_ml_item();

-- Reflect admin order edits back to ML, including removed/added item rows.
CREATE OR REPLACE FUNCTION private.mirror_ml_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sid text; r public.partner_order_rows%rowtype; i public.order_items%rowtype; n int;
BEGIN
 IF NEW.order_status NOT IN ('주문접수','준비중') THEN RETURN NEW; END IF;
 SELECT sheet_id INTO sid FROM public.partner_order_rows WHERE approved_order_id=NEW.id AND status='승인' AND private.ml_sheet(sheet_id) LIMIT 1;
 IF sid IS NULL THEN RETURN NEW; END IF;
 FOR r IN SELECT * FROM public.partner_order_rows WHERE approved_order_id=NEW.id AND status='승인' ORDER BY id FOR UPDATE LOOP
  SELECT * INTO i FROM public.order_items WHERE id=r.approved_item_id AND order_id=NEW.id;
  IF NOT FOUND THEN
   INSERT INTO private.partner_order_deleted_keys(sheet_id,source_uid) VALUES(sid,r.source_uid) ON CONFLICT DO NOTHING;
   DELETE FROM public.partner_order_rows WHERE id=r.id;
  ELSE
   UPDATE public.partner_order_rows SET order_date=NEW.order_date,ship_date=NEW.ship_date,
    product_name=i.kit_name,quantity=i.quantity,recipient=coalesce(NEW.manager_name,r.recipient),
    contact=coalesce(NEW.contact,''),address=NEW.address,note=coalesce(NEW.note,''),
    content_hash=md5(concat_ws(chr(31),NEW.order_date::text,NEW.ship_date::text,i.kit_name,i.quantity::text,
      coalesce(NEW.manager_name,r.recipient),coalesce(NEW.contact,''),NEW.address,coalesce(NEW.note,''))),updated_at=clock_timestamp()
   WHERE id=r.id;
  END IF;
 END LOOP;
 FOR i IN SELECT * FROM public.order_items x WHERE order_id=NEW.id AND NOT EXISTS(SELECT 1 FROM public.partner_order_rows WHERE approved_order_id=NEW.id AND approved_item_id=x.id) ORDER BY id LOOP
  SELECT coalesce(max(source_row),1)+1 INTO n FROM public.partner_order_rows WHERE sheet_id=sid;
  INSERT INTO public.partner_order_rows(sheet_id,source_row,source_uid,content_hash,order_date,ship_date,product_name,quantity,recipient,contact,address,note,status,approved_order_id,approved_item_id)
  VALUES(sid,n,gen_random_uuid(),md5(concat_ws(chr(31),NEW.order_date::text,NEW.ship_date::text,i.kit_name,i.quantity::text,coalesce(NEW.manager_name,''),coalesce(NEW.contact,''),NEW.address,coalesce(NEW.note,''))),NEW.order_date,NEW.ship_date,i.kit_name,i.quantity,coalesce(NEW.manager_name,''),coalesce(NEW.contact,''),NEW.address,coalesce(NEW.note,''),'승인',NEW.id,i.id);
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.mirror_ml_order() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS mirror_ml_order ON public.orders;
CREATE TRIGGER mirror_ml_order AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.mirror_ml_order();

CREATE OR REPLACE FUNCTION private.update_ml_row(p_id uuid,p_expected jsonb,p_updated timestamptz,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.partner_order_rows%rowtype; o public.orders%rowtype; p public.products%rowtype;
 d date; s date; q int; a text[]; iid bigint;
BEGIN
 SELECT * INTO r FROM public.partner_order_rows WHERE id=p_id;
 IF NOT FOUND OR NOT private.ml_sheet(r.sheet_id) THEN RAISE EXCEPTION 'ML 주문을 찾을 수 없습니다.'; END IF;
 IF r.approved_order_id IS NOT NULL THEN
  SELECT * INTO o FROM public.orders WHERE id=r.approved_order_id FOR UPDATE;
  IF NOT FOUND OR o.order_status NOT IN ('주문접수','준비중') THEN RAISE EXCEPTION '출고완료·취소 주문은 수정할 수 없습니다.'; END IF;
 END IF;
 SELECT * INTO r FROM public.partner_order_rows WHERE id=p_id FOR UPDATE;
 IF r.status NOT IN ('등록','승인대기','승인') THEN RAISE EXCEPTION '수정할 수 없는 주문입니다.'; END IF;
 IF p_updated IS DISTINCT FROM r.updated_at OR p_expected IS DISTINCT FROM jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,r.quantity::text,r.recipient,r.contact,r.address,r.note)
 THEN RAISE EXCEPTION '다른 작업에서 주문이 변경됐습니다. 새로고침해 주세요.'; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'array' OR jsonb_array_length(p_input)<>8 THEN RAISE EXCEPTION '입력 정보를 확인해 주세요.'; END IF;
 SELECT array_agg(trim(value) ORDER BY ord) INTO a FROM jsonb_array_elements_text(p_input) WITH ORDINALITY x(value,ord);
 IF a[1] !~ '^\d{4}-\d{2}-\d{2}$' OR a[2] !~ '^\d{4}-\d{2}-\d{2}$' OR a[4] !~ '^[0-9]{1,4}$' OR coalesce(a[5],'')='' OR coalesce(a[6],'')='' OR coalesce(a[7],'')='' OR length(a[5])>100 OR length(a[6])>100 OR length(a[7])>1000 OR length(a[8])>2000 THEN RAISE EXCEPTION '필수 입력 정보를 확인해 주세요.'; END IF;
 d:=a[1]::date;s:=a[2]::date;q:=a[4]::int;
 IF q<1 OR q>1000 THEN RAISE EXCEPTION '수량은 1~1000개입니다.'; END IF;
 SELECT * INTO p FROM public.products WHERE name=a[3] AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '판매 중인 상품을 선택해 주세요.'; END IF;
 IF r.status='승인' THEN
  iid:=r.approved_item_id;
  IF iid IS NULL OR NOT EXISTS(SELECT 1 FROM public.order_items WHERE id=iid AND order_id=o.id) THEN RAISE EXCEPTION '연결 상품을 확인해 주세요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=o.id AND kit_name=p.name AND id<>iid) THEN RAISE EXCEPTION '같은 주문에 이미 있는 상품입니다. 관리자에게 수량 변경을 요청해 주세요.'; END IF;
  UPDATE public.order_items SET quantity=q WHERE id=iid;
  IF p.name<>r.product_name THEN
   IF p.inventory_item_id IS NULL OR p.deduction_qty<=0 THEN RAISE EXCEPTION '상품 재고 설정을 확인해 주세요.'; END IF;
   UPDATE public.order_items SET product_id=p.id,kit_name=p.name,product_name_snapshot=p.name,
    unit_price_snapshot=p.price,inventory_item_id_snapshot=p.inventory_item_id,inventory_deduction_snapshot=p.deduction_qty WHERE id=iid;
  END IF;
  -- Trigger mirrors the order to every linked product row; order ID/status/shipping/photos stay intact.
  UPDATE public.orders SET order_date=d,ship_date=s,manager_name=a[5],contact=a[6],address=a[7],note=a[8],updated_at=clock_timestamp() WHERE id=o.id;
 ELSE
  UPDATE public.partner_order_rows SET order_date=d,ship_date=s,product_name=a[3],quantity=q,recipient=a[5],contact=a[6],address=a[7],note=a[8],content_hash=md5(array_to_string(a,chr(31))),updated_at=clock_timestamp() WHERE id=r.id;
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION private.update_ml_row(uuid,jsonb,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_update_ml_row(p_row_id uuid,p_expected jsonb,p_expected_updated_at timestamptz,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 RETURN private.update_ml_row(p_row_id,p_expected,p_expected_updated_at,p_input);
END $$;
REVOKE ALL ON FUNCTION public.admin_update_ml_row(uuid,jsonb,timestamptz,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_ml_row(uuid,jsonb,timestamptz,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_portal_update(p_sheet_id text,p_token_hash text,p_source_uid uuid,p_expected jsonb,p_expected_updated_at timestamptz,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.partner_portal_tokens t JOIN public.partner_sheet_sources s USING(sheet_id) WHERE t.sheet_id=p_sheet_id AND t.token_hash=p_token_hash AND t.enabled AND s.enabled) THEN RAISE EXCEPTION '거래처 인증에 실패했습니다.'; END IF;
 SELECT id INTO rid FROM public.partner_order_rows WHERE sheet_id=p_sheet_id AND source_uid=p_source_uid;
 IF rid IS NULL THEN RAISE EXCEPTION '주문을 찾을 수 없습니다.'; END IF;
 PERFORM private.update_ml_row(rid,p_expected,p_expected_updated_at,p_input);
 RETURN public.partner_portal_manage(p_sheet_id,p_token_hash,'status');
END $$;
REVOKE ALL ON FUNCTION public.partner_portal_update(text,text,uuid,jsonb,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_update(text,text,uuid,jsonb,timestamptz,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION private.partner_order_action_core(p_row_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_row public.partner_order_rows%rowtype;
        v_order public.orders%rowtype;
        v_count integer;
BEGIN
 SELECT * INTO v_row FROM public.partner_order_rows WHERE id=p_row_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '등록 주문을 찾을 수 없습니다.'; END IF;

 IF p_action='cancel' THEN
  IF v_row.status<>'승인' OR v_row.approved_order_id IS NULL
  THEN RAISE EXCEPTION '승인된 주문만 승인 취소할 수 있습니다.'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=v_row.approved_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '연결된 정식 주문을 찾을 수 없습니다.'; END IF;
  IF v_order.order_status NOT IN ('주문접수','준비중')
  THEN RAISE EXCEPTION '출고완료 또는 이미 취소한 주문은 승인 취소할 수 없습니다.'; END IF;
  -- One approved order can contain multiple product rows. The trigger re-registers them together.
  UPDATE public.orders SET order_status='취소',updated_at=clock_timestamp()
   WHERE id=v_order.id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'action','cancel','order_id',v_order.id,'updated',v_count);
 ELSIF p_action='delete' THEN
  IF v_row.status='승인' AND v_row.approved_order_id IS NOT NULL AND private.ml_sheet(v_row.sheet_id) THEN
   SELECT * INTO v_order FROM public.orders WHERE id=v_row.approved_order_id FOR UPDATE;
   IF NOT FOUND OR v_order.order_status NOT IN ('주문접수','준비중','취소') THEN RAISE EXCEPTION '출고완료 주문은 삭제할 수 없습니다.'; END IF;
   IF v_order.order_status<>'취소' AND (v_row.approved_item_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.order_items WHERE id=v_row.approved_item_id AND order_id=v_order.id)) THEN RAISE EXCEPTION '연결 상품을 확인해 주세요.'; END IF;
   INSERT INTO private.partner_order_deleted_keys(sheet_id,source_uid) VALUES(v_row.sheet_id,v_row.source_uid) ON CONFLICT DO NOTHING;
   DELETE FROM public.partner_order_rows WHERE id=v_row.id;
   IF v_order.order_status<>'취소' THEN
    DELETE FROM public.order_items WHERE id=v_row.approved_item_id AND order_id=v_order.id;
    IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=v_order.id) THEN
     UPDATE public.orders SET updated_at=clock_timestamp() WHERE id=v_order.id;
    ELSE
     UPDATE public.orders SET order_status='취소',deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=v_order.id;
    END IF;
   END IF;
   RETURN jsonb_build_object('ok',true,'action','delete','deleted',1);
  END IF;
  IF v_row.status NOT IN ('등록','승인대기','반려') OR v_row.approved_order_id IS NOT NULL THEN RAISE EXCEPTION '삭제할 수 없는 주문입니다.'; END IF;
  INSERT INTO private.partner_order_deleted_keys(sheet_id,source_uid) VALUES(v_row.sheet_id,v_row.source_uid) ON CONFLICT DO NOTHING;
  DELETE FROM public.partner_order_rows WHERE id=v_row.id;
  RETURN jsonb_build_object('ok',true,'action','delete','deleted',1);
 ELSE
  RAISE EXCEPTION '허용되지 않은 동작입니다.';
 END IF;
END $function$
;
CREATE OR REPLACE FUNCTION public.partner_sheet_status(p_sheet_id text, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if not exists (
  select 1 from private.partner_sheet_tokens t
  join public.partner_sheet_sources s using (sheet_id)
  where t.sheet_id=p_sheet_id and t.enabled and s.enabled and t.token_hash=p_token_hash
 ) then raise exception '시트 연동 인증에 실패했습니다.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'source_row',r.source_row,'source_uid',r.source_uid,
  'ship_date',r.ship_date,'recipient',r.recipient,'status',r.status,
  'updated_at',r.updated_at,'approved_order_id',r.approved_order_id,
  'order_status',o.order_status,'fields',case when private.ml_sheet(r.sheet_id) then jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,r.quantity::text,r.recipient,r.contact,r.address,r.note) else null end,
  'order_no',case when r.status='승인' then o.order_no else null end,
  'tracking_numbers',case when r.status='승인' then coalesce(d.tracking_numbers,'') else '' end,
  'ice_small',case when r.status='승인' then coalesce(d.ice_small,0) else 0 end,
  'ice_medium',case when r.status='승인' then coalesce(d.ice_medium,0) else 0 end,
  'ice_large',case when r.status='승인' then coalesce(d.ice_large,0) else 0 end,
  'paper_medium',case when r.status='승인' then coalesce(d.paper_medium,0) else 0 end,
  'paper_large',case when r.status='승인' then coalesce(d.paper_large,0) else 0 end,
  'photo_count',case when r.status='승인' then coalesce(p.photo_count,0) else 0 end
 ) order by r.source_row),'[]'::jsonb)
 into v_result
 from public.partner_order_rows r
 left join public.orders o on o.id=r.approved_order_id
 left join public.order_shipping_details d on d.order_id=r.approved_order_id
 left join lateral (
  select count(*)::integer photo_count from public.order_photos ph
  where ph.order_id=r.approved_order_id
 ) p on true
 where r.sheet_id=p_sheet_id;
 return v_result;
end $function$
;
