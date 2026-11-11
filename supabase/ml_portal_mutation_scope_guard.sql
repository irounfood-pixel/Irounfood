-- Apply after the scoped manifest SQL. Adds an atomic check inside the existing
-- transaction. No authentication, grants, existing business logic or data changes.
CREATE OR REPLACE FUNCTION private.assert_ml_portal_order_scope(p_sheet_id text,p_source_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE r public.partner_order_rows%rowtype; o public.orders%rowtype;
BEGIN
 IF p_sheet_id IS DISTINCT FROM '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM' THEN RETURN; END IF;
 SELECT * INTO r FROM public.partner_order_rows
 WHERE sheet_id=p_sheet_id AND source_uid=p_source_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '주문을 찾을 수 없습니다.'; END IF;
 IF r.approved_order_id IS NOT NULL THEN
  SELECT * INTO o FROM public.orders WHERE id=r.approved_order_id FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL OR o.order_status='취소'
   OR (o.partner_type IS NOT NULL AND o.partner_type<>'ML') THEN
   RAISE EXCEPTION '현재 거래처에서 처리할 수 없는 주문입니다.';
  END IF;
 END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION private.assert_ml_portal_order_scope(text,uuid) FROM PUBLIC,anon,authenticated;
-- No new browser or service-role grant; called only by existing owner-run RPCs.

DO $patch$
DECLARE d text; needle text;
BEGIN
 d := pg_get_functiondef('public.partner_portal_manage(text,text,text,uuid,jsonb,timestamp with time zone)'::regprocedure);
 needle := 'v_result:=private.partner_order_action_core(v_row.id,p_action);';
 IF position('PERFORM private.assert_ml_portal_order_scope(p_sheet_id,p_source_uid);' in d)=0 THEN
  IF position(needle in d)=0 THEN RAISE EXCEPTION 'Unrecognized partner_portal_manage implementation; review required'; END IF;
  d := replace(d,needle,'PERFORM private.assert_ml_portal_order_scope(p_sheet_id,p_source_uid);'||chr(10)||'  '||needle);
  EXECUTE d;
 END IF;
 d := pg_get_functiondef('public.partner_portal_update(text,text,uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure);
 needle := 'PERFORM private.update_ml_row(rid,p_expected,p_expected_updated_at,p_input);';
 IF position('PERFORM private.assert_ml_portal_order_scope(p_sheet_id,p_source_uid);' in d)=0 THEN
  IF position(needle in d)=0 THEN RAISE EXCEPTION 'Unrecognized partner_portal_update implementation; review required'; END IF;
  d := replace(d,needle,'PERFORM private.assert_ml_portal_order_scope(p_sheet_id,p_source_uid);'||chr(10)||' '||needle);
  EXECUTE d;
 END IF;
END;
$patch$;
