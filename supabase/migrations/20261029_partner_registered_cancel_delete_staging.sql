-- ML and other partner sheets: reversible approval, registered editing, and deletion.
-- STAGING ONLY until Apps Script, Edge Function, and UI are verified.
-- Do not change historical shipped orders or delete linked operational orders.

ALTER TABLE public.partner_order_rows DROP CONSTRAINT IF EXISTS partner_order_rows_status_check;
ALTER TABLE public.partner_order_rows ADD CONSTRAINT partner_order_rows_status_check
 CHECK (status IN ('등록','승인대기','승인','반려'));
ALTER TABLE public.partner_order_rows ALTER COLUMN status SET DEFAULT '등록';

-- UID-only tombstones (no customer details), to stop accidental resurrection after deletion.
CREATE TABLE IF NOT EXISTS private.partner_order_deleted_keys(
 sheet_id text NOT NULL REFERENCES public.partner_sheet_sources(sheet_id),
 source_uid uuid NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(sheet_id,source_uid)
);
ALTER TABLE private.partner_order_deleted_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.partner_order_deleted_keys FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.partner_sheet_ingest(p_sheet_id text,p_token_hash text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_row jsonb; v_idx int; v_uid uuid; v_n int:=0; v_conflict int:=0;
 v_date date; v_ship date; v_qty int; v_hash text; v_old public.partner_order_rows%rowtype;
 v_source public.partner_sheet_sources%rowtype;
BEGIN
 SELECT * INTO v_source FROM public.partner_sheet_sources WHERE sheet_id=p_sheet_id AND enabled;
 IF NOT FOUND OR NOT EXISTS (
   SELECT 1 FROM private.partner_sheet_tokens t
   WHERE t.sheet_id=p_sheet_id AND t.enabled AND t.token_hash=p_token_hash
 ) THEN RAISE EXCEPTION '시트 연동 인증에 실패했습니다.'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN
   RAISE EXCEPTION '입력 행 배열이 올바르지 않습니다.';
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   IF jsonb_typeof(v_row)<>'object' OR (v_row->>'source_row') !~ '^[0-9]{1,5}$' OR (v_row->>'source_uid') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN CONTINUE; END IF;
   v_uid := (v_row->>'source_uid')::uuid;
   v_idx:=(v_row->>'source_row')::integer;
   -- Deleted UIDs remain suppressed even if an old sheet snapshot is re-sent.
   IF EXISTS (SELECT 1 FROM private.partner_order_deleted_keys d
              WHERE d.sheet_id=p_sheet_id AND d.source_uid=v_uid) THEN CONTINUE; END IF;
   IF v_idx<2 OR v_idx>20000 THEN CONTINUE; END IF;
   IF (v_row->>'quantity') !~ '^[0-9]{1,4}$' THEN CONTINUE; END IF;
   v_qty:=(v_row->>'quantity')::integer;
   IF v_qty<1 OR v_qty>1000 THEN CONTINUE; END IF;
   IF (v_row->>'order_date') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (v_row->>'ship_date') !~ '^\d{4}-\d{2}-\d{2}$'
      OR nullif(trim(v_row->>'product_name'),'') IS NULL
      OR nullif(trim(v_row->>'recipient'),'') IS NULL
      OR nullif(trim(v_row->>'contact'),'') IS NULL
      OR nullif(trim(v_row->>'address'),'') IS NULL THEN CONTINUE; END IF;
   BEGIN
    v_date:=(v_row->>'order_date')::date;
    v_ship:=(v_row->>'ship_date')::date;
   EXCEPTION WHEN others THEN CONTINUE; END;
   IF NOT EXISTS(SELECT 1 FROM public.products WHERE active=true AND name=trim(v_row->>'product_name')) THEN CONTINUE; END IF;
   v_hash:=md5(concat_ws(chr(31),v_date::text,v_ship::text,trim(v_row->>'product_name'),
       v_qty::text,trim(v_row->>'recipient'),trim(v_row->>'contact'),
       trim(v_row->>'address'),coalesce(v_row->>'note','')));
   SELECT * INTO v_old FROM public.partner_order_rows
      WHERE sheet_id=p_sheet_id AND source_uid=v_uid FOR UPDATE;
   IF FOUND AND v_old.status='승인' THEN
     IF v_old.content_hash<>v_hash THEN v_conflict:=v_conflict+1; END IF;
     -- 승인된 원본은 수정 불가, 다만 시트에서 행이 이동한 경우 위치만 갱신
     IF v_old.source_row<>v_idx THEN
       UPDATE public.partner_order_rows SET source_row=v_idx WHERE id=v_old.id;
     END IF;
     CONTINUE;
   END IF;
   IF FOUND AND v_old.status='반려' THEN CONTINUE; END IF;
   INSERT INTO public.partner_order_rows(sheet_id,source_row,source_uid,content_hash,order_date,ship_date,
     product_name,quantity,recipient,contact,address,note)
   VALUES (p_sheet_id,v_idx,v_uid,v_hash,v_date,v_ship,trim(v_row->>'product_name'),
     v_qty,trim(v_row->>'recipient'),trim(v_row->>'contact'),trim(v_row->>'address'),
     coalesce(v_row->>'note',''))
   ON CONFLICT(sheet_id,source_uid) DO UPDATE SET
     source_row=excluded.source_row,content_hash=excluded.content_hash,order_date=excluded.order_date,
     ship_date=excluded.ship_date,product_name=excluded.product_name,
     quantity=excluded.quantity,recipient=excluded.recipient,contact=excluded.contact,
     address=excluded.address,note=excluded.note,updated_at=now()
   WHERE public.partner_order_rows.status IN ('승인대기','등록')
     AND (public.partner_order_rows.content_hash IS DISTINCT FROM excluded.content_hash
       OR public.partner_order_rows.source_row IS DISTINCT FROM excluded.source_row);
   v_n:=v_n+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'processed_rows',v_n,'approved_changed_conflicts',v_conflict);
END $$;
REVOKE ALL ON FUNCTION public.partner_sheet_ingest(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_sheet_ingest(text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_partner_sheet_rows(p_row_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_first public.partner_order_rows%rowtype; v_count int; v_items jsonb;
 v_partner text; v_order_id uuid; v_all int;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 v_count:=coalesce(array_length(p_row_ids,1),0);
 IF v_count<1 OR v_count>100 OR v_count<>(SELECT count(DISTINCT id) FROM unnest(p_row_ids) x(id)) THEN
  RAISE EXCEPTION '승인할 행을 1~100개 선택하세요 (중복 불가).';
 END IF;
 SELECT r.* INTO v_first FROM public.partner_order_rows r
 WHERE r.id=ANY(p_row_ids) ORDER BY r.id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '승인할 주문을 찾을 수 없습니다.'; END IF;
 SELECT count(*) INTO v_all FROM public.partner_order_rows r WHERE r.id=ANY(p_row_ids)
 AND r.status IN ('승인대기','등록') AND r.sheet_id=v_first.sheet_id
 AND r.order_date=v_first.order_date AND r.ship_date=v_first.ship_date
 AND r.recipient=v_first.recipient AND r.contact=v_first.contact AND r.address=v_first.address;
 -- 동시 승인 경합 방지를 위해 모든 행을 잠근 다음 상태를 재검증합니다.
 PERFORM 1 FROM public.partner_order_rows r WHERE r.id=ANY(p_row_ids) ORDER BY r.id FOR UPDATE;
 SELECT count(*) INTO v_all FROM public.partner_order_rows r WHERE r.id=ANY(p_row_ids)
 AND r.status IN ('승인대기','등록') AND r.sheet_id=v_first.sheet_id
 AND r.order_date=v_first.order_date AND r.ship_date=v_first.ship_date
 AND r.recipient=v_first.recipient AND r.contact=v_first.contact AND r.address=v_first.address;
 IF v_all<>v_count THEN RAISE EXCEPTION '서로 다른 주문 또는 이미 처리한 행이 포함됐습니다.'; END IF;
 SELECT partner_name INTO v_partner FROM public.partner_sheet_sources WHERE sheet_id=v_first.sheet_id;
 SELECT jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',r.quantity) ORDER BY r.source_row)
 INTO v_items FROM public.partner_order_rows r
 JOIN public.products p ON p.name=r.product_name AND p.active=true
 WHERE r.id=ANY(p_row_ids);
 IF jsonb_array_length(coalesce(v_items,'[]'::jsonb))<>v_count THEN
    RAISE EXCEPTION '상품 목록을 확인해주세요.'; END IF;
 v_order_id:=public.create_admin_order_v2(v_first.order_date,v_partner,v_first.recipient,
   v_first.contact,v_first.ship_date,'거래처시트',v_first.address,'택배',
   (SELECT nullif(string_agg(DISTINCT nullif(trim(note),''),' / '),'') FROM public.partner_order_rows
    WHERE id=ANY(p_row_ids)),v_items);
 UPDATE public.partner_order_rows SET status='승인',approved_order_id=v_order_id,updated_at=now()
 WHERE id=ANY(p_row_ids);
 RETURN v_order_id;
END $$;
REVOKE ALL ON FUNCTION public.approve_partner_sheet_rows(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_partner_sheet_rows(uuid[]) TO authenticated;

-- Called only by access-checked wrappers. Never grant to any client.
CREATE OR REPLACE FUNCTION private.partner_order_action_core(p_row_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
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
  IF v_row.status NOT IN ('등록','승인대기') OR v_row.approved_order_id IS NOT NULL
  THEN RAISE EXCEPTION '등록 상태의 승인 전 주문만 완전 삭제할 수 있습니다.'; END IF;
  INSERT INTO private.partner_order_deleted_keys(sheet_id,source_uid)
    VALUES(v_row.sheet_id,v_row.source_uid) ON CONFLICT DO NOTHING;
  DELETE FROM public.partner_order_rows WHERE id=v_row.id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'action','delete','deleted',v_count);
 ELSE
  RAISE EXCEPTION '허용되지 않은 동작입니다.';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION private.partner_order_action_core(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Existing admin cancellation route continues working. It also unlocks partner rows.
CREATE OR REPLACE FUNCTION private.restore_partner_rows_on_order_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF NEW.order_status='취소' AND OLD.order_status IS DISTINCT FROM NEW.order_status THEN
  UPDATE public.partner_order_rows
    SET status='등록',approved_order_id=NULL,updated_at=clock_timestamp()
  WHERE approved_order_id=NEW.id AND status='승인';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.restore_partner_rows_on_order_cancel() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS restore_partner_rows_when_order_canceled ON public.orders;
CREATE TRIGGER restore_partner_rows_when_order_canceled
 AFTER UPDATE OF order_status ON public.orders
 FOR EACH ROW EXECUTE FUNCTION private.restore_partner_rows_on_order_cancel();

-- Authenticated admins may cancel/re-register, or delete a still-registered row.
CREATE OR REPLACE FUNCTION public.admin_manage_partner_row(p_row_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_admin()
 THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 RETURN private.partner_order_action_core(p_row_id,p_action);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_manage_partner_row(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_manage_partner_row(uuid,text) TO authenticated;

-- Service-role only, called by token-verifying Edge Function on behalf of a single partner sheet.
CREATE OR REPLACE FUNCTION public.partner_sheet_manage(
 p_sheet_id text,p_token_hash text,p_source_uid uuid,p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM private.partner_sheet_tokens t
   JOIN public.partner_sheet_sources s USING (sheet_id)
   WHERE t.sheet_id=p_sheet_id AND t.enabled AND s.enabled
     AND t.token_hash=p_token_hash
 ) THEN RAISE EXCEPTION '거래처 인증에 실패했습니다.'; END IF;
 SELECT id INTO v_id FROM public.partner_order_rows
 WHERE sheet_id=p_sheet_id AND source_uid=p_source_uid;
 IF v_id IS NULL THEN RAISE EXCEPTION '등록 주문을 찾을 수 없습니다.'; END IF;
 RETURN private.partner_order_action_core(v_id,p_action);
END $fn$;
REVOKE ALL ON FUNCTION public.partner_sheet_manage(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_sheet_manage(text,text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.partner_sheet_deleted_uids(p_sheet_id text,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM private.partner_sheet_tokens t
   JOIN public.partner_sheet_sources s USING(sheet_id)
   WHERE t.sheet_id=p_sheet_id AND t.enabled AND s.enabled AND t.token_hash=p_token_hash
 ) THEN RAISE EXCEPTION '시트 연동 인증에 실패했습니다.'; END IF;
 SELECT coalesce(jsonb_agg(source_uid::text),'[]'::jsonb) INTO v_result
 FROM private.partner_order_deleted_keys WHERE sheet_id=p_sheet_id;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.partner_sheet_deleted_uids(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_sheet_deleted_uids(text,text) TO service_role;

-- Separate portal credential: read/cancel/delete only, never reuse administrator sync tokens.
CREATE TABLE IF NOT EXISTS private.partner_portal_tokens(
 sheet_id text PRIMARY KEY REFERENCES public.partner_sheet_sources(sheet_id),
 token_hash text NOT NULL, enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE private.partner_portal_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.partner_portal_tokens FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.partner_portal_manage(
 p_sheet_id text,p_token_hash text,p_action text,p_source_uid uuid DEFAULT NULL,
 p_expected jsonb DEFAULT NULL,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_row public.partner_order_rows%rowtype; v_result jsonb; v_rows jsonb; v_deleted jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.partner_portal_tokens t
  JOIN public.partner_sheet_sources s USING(sheet_id)
  WHERE t.sheet_id=p_sheet_id AND t.token_hash=p_token_hash AND t.enabled AND s.enabled)
 THEN RAISE EXCEPTION '거래처 인증에 실패했습니다.'; END IF;
 IF p_action NOT IN ('status','cancel','delete') THEN RAISE EXCEPTION '허용되지 않은 동작입니다.'; END IF;
 IF p_action<>'status' THEN
  SELECT * INTO v_row FROM public.partner_order_rows
  WHERE sheet_id=p_sheet_id AND source_uid=p_source_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '주문을 찾을 수 없습니다. 새로고침해 주세요.'; END IF;
  IF p_expected_updated_at IS DISTINCT FROM v_row.updated_at OR
   p_expected IS DISTINCT FROM jsonb_build_array(v_row.order_date::text,v_row.ship_date::text,
    v_row.product_name,v_row.quantity::text,v_row.recipient,v_row.contact,v_row.address,v_row.note)
  THEN RAISE EXCEPTION '주문이 변경되었습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  v_result:=private.partner_order_action_core(v_row.id,p_action);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source_uid',r.source_uid,'source_row',r.source_row,
  'status',r.status,'updated_at',r.updated_at,'approved_order_id',r.approved_order_id,
  'order_status',o.order_status,
  'fields',jsonb_build_array(r.order_date::text,r.ship_date::text,r.product_name,r.quantity::text,
   r.recipient,r.contact,r.address,r.note)) ORDER BY r.source_row),'[]'::jsonb)
 INTO v_rows FROM public.partner_order_rows r LEFT JOIN public.orders o ON o.id=r.approved_order_id
 WHERE r.sheet_id=p_sheet_id;
 SELECT coalesce(jsonb_agg(source_uid::text),'[]'::jsonb) INTO v_deleted
 FROM private.partner_order_deleted_keys WHERE sheet_id=p_sheet_id;
 RETURN jsonb_build_object('ok',true,'mutation',v_result,'rows',v_rows,'deleted_uids',v_deleted);
END $fn$;
REVOKE ALL ON FUNCTION public.partner_portal_manage(text,text,text,uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_portal_manage(text,text,text,uuid,jsonb,timestamptz) TO service_role;
