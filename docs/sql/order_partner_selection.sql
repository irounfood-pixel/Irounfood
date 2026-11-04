-- NULL preserves legacy ML name matching. Explicit selection always takes precedence.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS partner_type text
 CHECK (partner_type IN ('해당없음','ML'));

CREATE OR REPLACE FUNCTION public.create_admin_order_with_partner_v1(
 p_order_date date,p_customer_name text,p_manager_name text,p_contact text,
 p_ship_date date,p_order_source text,p_address text,p_receive_method text,
 p_note text,p_items jsonb,p_partner_type text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE oid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 IF p_partner_type IS NULL OR p_partner_type NOT IN ('해당없음','ML') THEN
  RAISE EXCEPTION '거래처를 해당없음 또는 ML로 선택해주세요.';
 END IF;
 oid:=public.create_admin_order_v2(p_order_date,p_customer_name,p_manager_name,p_contact,
  p_ship_date,p_order_source,p_address,p_receive_method,p_note,p_items);
 UPDATE public.orders SET partner_type=p_partner_type WHERE id=oid;
 RETURN oid;
END $fn$;
REVOKE ALL ON FUNCTION public.create_admin_order_with_partner_v1(date,text,text,text,date,text,text,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_admin_order_with_partner_v1(date,text,text,text,date,text,text,text,text,jsonb,text) TO authenticated;

-- Retain existing validation, item snapshots, optimistic locking and admin authorization.
DO $patch$
DECLARE original text; amended text;
BEGIN
 SELECT pg_get_functiondef('public.admin_update_order_v2(uuid,timestamptz,jsonb,jsonb)'::regprocedure) INTO original;
 IF position('partner_type=case' IN original)>0 THEN RETURN; END IF;
 amended:=replace(original,' if p_items is null',
 E' if p_fields ? ''partner_type'' and (p_fields->>''partner_type'' is null or p_fields->>''partner_type'' not in (''해당없음'',''ML'')) then\n  raise exception ''거래처를 해당없음 또는 ML로 선택해주세요.'';\n end if;\n if p_items is null');
 amended:=replace(amended,'  order_date=coalesce',
 E'  partner_type=case when p_fields ? ''partner_type'' then p_fields->>''partner_type'' else v_order.partner_type end,\n  order_date=coalesce');
 IF amended=original OR position('partner_type=case' IN amended)=0 THEN
  RAISE EXCEPTION 'Unexpected admin_update_order_v2 definition';
 END IF;
 EXECUTE amended;
END $patch$;
NOTIFY pgrst,'reload schema';
