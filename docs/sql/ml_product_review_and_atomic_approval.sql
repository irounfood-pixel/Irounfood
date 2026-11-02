CREATE OR REPLACE FUNCTION public.partner_sheet_ingest(p_sheet_id text, p_token_hash text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   IF length(trim(v_row->>'product_name'))>200 THEN CONTINUE; END IF;
   -- ML unknown names remain pending for explicit administrator product resolution.
   IF v_source.partner_name IS DISTINCT FROM 'ML' AND NOT EXISTS(SELECT 1 FROM public.products WHERE active=true AND name=trim(v_row->>'product_name')) THEN CONTINUE; END IF;
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
END $function$
;

CREATE OR REPLACE FUNCTION public.approve_ml_matched_rows(p_matches jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE m jsonb; ids uuid[]:=ARRAY[]::uuid[]; rid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '관리자 로그인이 필요합니다.'; END IF;
 IF jsonb_typeof(p_matches) IS DISTINCT FROM 'array' OR jsonb_array_length(p_matches)<1 OR jsonb_array_length(p_matches)>100 THEN RAISE EXCEPTION '선택 상품을 확인해주세요.'; END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
  rid:=(m->>'row_id')::uuid;
  PERFORM public.admin_update_ml_row(rid,m->'expected',(m->>'updated_at')::timestamptz,jsonb_set(m->'expected','{2}',m->'product_name'));
  ids:=array_append(ids,rid);
 END LOOP;
 RETURN public.approve_partner_sheet_rows(ids);
END $fn$;
REVOKE ALL ON FUNCTION public.approve_ml_matched_rows(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.approve_ml_matched_rows(jsonb) TO authenticated;
