-- 거래처별 Google Sheets 연동 신규 테이블/함수. 기존 주문 데이터는 변경하지 않습니다.
CREATE TABLE IF NOT EXISTS public.partner_sheet_sources (
  sheet_id text PRIMARY KEY,
  partner_name text NOT NULL CHECK (length(trim(partner_name))>0),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.partner_sheet_tokens (
  sheet_id text PRIMARY KEY REFERENCES public.partner_sheet_sources(sheet_id),
  token_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.partner_order_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id text NOT NULL REFERENCES public.partner_sheet_sources(sheet_id),
  source_row integer NOT NULL CHECK (source_row BETWEEN 2 AND 20000),
  content_hash text NOT NULL,
  order_date date NOT NULL,
  ship_date date NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  recipient text NOT NULL,
  contact text NOT NULL,
  address text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '승인대기' CHECK (status IN ('승인대기','승인','반려')),
  approved_order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sheet_id,source_row)
);
CREATE INDEX IF NOT EXISTS partner_order_rows_status_idx ON public.partner_order_rows(status,ship_date);
CREATE TABLE IF NOT EXISTS public.order_shipping_details (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  tracking_numbers text NOT NULL DEFAULT '',
  ice_small integer NOT NULL DEFAULT 0 CHECK (ice_small>=0),
  ice_medium integer NOT NULL DEFAULT 0 CHECK (ice_medium>=0),
  ice_large integer NOT NULL DEFAULT 0 CHECK (ice_large>=0),
  paper_medium integer NOT NULL DEFAULT 0 CHECK (paper_medium>=0),
  paper_large integer NOT NULL DEFAULT 0 CHECK (paper_large>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_sheet_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_order_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipping_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.partner_sheet_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_sheet_sources, public.partner_order_rows, public.order_shipping_details FROM anon, authenticated;
GRANT SELECT ON public.partner_sheet_sources, public.partner_order_rows, public.order_shipping_details TO authenticated;
DROP POLICY IF EXISTS partner_source_admin_read ON public.partner_sheet_sources;
CREATE POLICY partner_source_admin_read ON public.partner_sheet_sources FOR SELECT TO authenticated USING (private.is_admin());
DROP POLICY IF EXISTS partner_rows_admin_read ON public.partner_order_rows;
CREATE POLICY partner_rows_admin_read ON public.partner_order_rows FOR SELECT TO authenticated USING (private.is_admin());
DROP POLICY IF EXISTS shipping_admin_read ON public.order_shipping_details;
CREATE POLICY shipping_admin_read ON public.order_shipping_details FOR SELECT TO authenticated USING (private.is_admin());

-- 서버 전용 동기화. 편집 중인 미완성 행은 제외하며 승인된 행은 절대 덮어쓰지 않습니다.
CREATE OR REPLACE FUNCTION public.partner_sheet_ingest(p_sheet_id text,p_token_hash text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_row jsonb; v_idx int; v_n int:=0; v_conflict int:=0;
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
   IF jsonb_typeof(v_row)<>'object' OR (v_row->>'source_row') !~ '^[0-9]{1,5}$' THEN CONTINUE; END IF;
   v_idx:=(v_row->>'source_row')::integer;
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
      WHERE sheet_id=p_sheet_id AND source_row=v_idx FOR UPDATE;
   IF FOUND AND v_old.status='승인' THEN
     IF v_old.content_hash<>v_hash THEN v_conflict:=v_conflict+1; END IF;
     -- 승인된 원본은 수정 불가, 송장/박스 정보는 별도 관리자 기능으로 입력
     CONTINUE;
   END IF;
   IF FOUND AND v_old.status='반려' THEN CONTINUE; END IF;
   INSERT INTO public.partner_order_rows(sheet_id,source_row,content_hash,order_date,ship_date,
     product_name,quantity,recipient,contact,address,note)
   VALUES (p_sheet_id,v_idx,v_hash,v_date,v_ship,trim(v_row->>'product_name'),
     v_qty,trim(v_row->>'recipient'),trim(v_row->>'contact'),trim(v_row->>'address'),
     coalesce(v_row->>'note',''))
   ON CONFLICT(sheet_id,source_row) DO UPDATE SET
     content_hash=excluded.content_hash,order_date=excluded.order_date,
     ship_date=excluded.ship_date,product_name=excluded.product_name,
     quantity=excluded.quantity,recipient=excluded.recipient,contact=excluded.contact,
     address=excluded.address,note=excluded.note,updated_at=now()
   WHERE public.partner_order_rows.status='승인대기'
     AND public.partner_order_rows.content_hash IS DISTINCT FROM excluded.content_hash;
   v_n:=v_n+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'processed_rows',v_n,'approved_changed_conflicts',v_conflict);
END $$;
REVOKE ALL ON FUNCTION public.partner_sheet_ingest(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_sheet_ingest(text,text,jsonb) TO service_role;

-- 선택한 행들을 관리자 검토 후 단일 정식 주문으로 등록. 함수 전체가 원자적으로 처리됩니다.
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
 AND r.status='승인대기' AND r.sheet_id=v_first.sheet_id
 AND r.order_date=v_first.order_date AND r.ship_date=v_first.ship_date
 AND r.recipient=v_first.recipient AND r.contact=v_first.contact AND r.address=v_first.address;
 IF v_all<>v_count THEN RAISE EXCEPTION '서로 다른 주문 또는 이미 처리한 행이 포함됐습니다.'; END IF;
 -- 행 순서 고정으로 동시 승인 경합 방지
 PERFORM 1 FROM public.partner_order_rows r WHERE r.id=ANY(p_row_ids) ORDER BY r.id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.reject_partner_sheet_rows(p_row_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_n integer;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 UPDATE public.partner_order_rows SET status='반려',updated_at=now()
 WHERE id=ANY(p_row_ids) AND status='승인대기';
 GET DIAGNOSTICS v_n=ROW_COUNT;
 RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.reject_partner_sheet_rows(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_partner_sheet_rows(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_order_shipping(p_order_id uuid,p_tracking text,
 p_ice_small int,p_ice_medium int,p_ice_large int,p_paper_medium int,p_paper_large int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id) THEN RAISE EXCEPTION '주문 없음'; END IF;
 IF least(p_ice_small,p_ice_medium,p_ice_large,p_paper_medium,p_paper_large)<0 THEN
 RAISE EXCEPTION '박스 수량은 음수일 수 없습니다.'; END IF;
 INSERT INTO public.order_shipping_details(order_id,tracking_numbers,ice_small,ice_medium,
 ice_large,paper_medium,paper_large)
 VALUES (p_order_id,coalesce(trim(p_tracking),''),p_ice_small,p_ice_medium,
 p_ice_large,p_paper_medium,p_paper_large)
 ON CONFLICT(order_id) DO UPDATE SET tracking_numbers=excluded.tracking_numbers,
 ice_small=excluded.ice_small,ice_medium=excluded.ice_medium,ice_large=excluded.ice_large,
 paper_medium=excluded.paper_medium,paper_large=excluded.paper_large,updated_at=now();
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_order_shipping(uuid,text,int,int,int,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_order_shipping(uuid,text,int,int,int,int,int) TO authenticated;
