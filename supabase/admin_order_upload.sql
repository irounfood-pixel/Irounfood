-- Admin-only, atomic import. No grants on the private receipt table.
CREATE TABLE IF NOT EXISTS private.admin_order_imports (
 file_hash text PRIMARY KEY CHECK(file_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 order_ids jsonb NOT NULL
);
ALTER TABLE private.admin_order_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_order_imports FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.import_admin_orders_v1(
 p_file_hash text,p_orders jsonb,p_commit boolean DEFAULT false,p_confirmed text[] DEFAULT '{}'::text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE g jsonb; item jsonb; normalized jsonb:='[]'; n jsonb; items jsonb;
 d date; sd date; qty integer; pid uuid; product public.products%rowtype;
 idx integer:=0; total_items integer:=0; dup jsonb:='[]'; matches jsonb; prior jsonb;
 token text; existing jsonb; ids jsonb:='[]'; oid uuid; method text;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION '관리자 권한이 필요합니다.'; END IF;
 IF p_file_hash IS NULL OR p_file_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION '파일을 다시 선택해 주세요.'; END IF;
 IF p_commit THEN PERFORM pg_catalog.pg_advisory_xact_lock(7202601102); END IF;
 SELECT order_ids INTO existing FROM private.admin_order_imports WHERE file_hash=p_file_hash;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'already_imported',true,'order_ids',existing); END IF;
 IF p_orders IS NULL OR jsonb_typeof(p_orders)<>'array' OR jsonb_array_length(p_orders) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION '한 번에 1~500개 주문을 등록할 수 있습니다.';
 END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
  idx:=idx+1;
  d:=coalesce(nullif(g->>'order_date','')::date,(now() AT TIME ZONE 'Asia/Seoul')::date);
  sd:=nullif(g->>'ship_date','')::date;
  method:=coalesce(nullif(btrim(g->>'receive_method'),''),'방문수령');
  IF sd IS NULL OR coalesce(btrim(g->>'customer_name'),'')='' OR coalesce(btrim(g->>'address'),'')='' THEN
   RAISE EXCEPTION '%번 주문: 고객명, 발송일, 배송지를 확인하세요.',idx;
  END IF;
  IF method NOT IN ('택배','방문수령') THEN RAISE EXCEPTION '%번 주문: 수령방법을 확인하세요.',idx; END IF;
  IF length(coalesce(g->>'customer_name',''))>100 OR length(coalesce(g->>'manager_name',''))>100
    OR length(coalesce(g->>'contact',''))>100 OR length(coalesce(g->>'address',''))>1000 OR length(coalesce(g->>'note',''))>2000 THEN
   RAISE EXCEPTION '%번 주문: 입력 내용이 너무 깁니다.',idx;
  END IF;
  IF g->'items' IS NULL OR jsonb_typeof(g->'items')<>'array' OR jsonb_array_length(g->'items') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION '%번 주문: 상품을 확인하세요.',idx;
  END IF;
  total_items:=total_items+jsonb_array_length(g->'items');
  IF total_items>500 THEN RAISE EXCEPTION '상품은 한 번에 최대 500행입니다.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(g->'items') LOOP
   IF coalesce(item->>'quantity','') !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION '%번 주문: 수량은 1~1000의 정수입니다.',idx; END IF;
   qty:=(item->>'quantity')::integer;pid:=(item->>'product_id')::uuid;
   IF qty NOT BETWEEN 1 AND 1000 OR pid IS NULL THEN RAISE EXCEPTION '%번 주문: 상품·수량을 확인하세요.',idx; END IF;
   SELECT * INTO product FROM public.products WHERE id=pid AND active=true FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION '%번 주문: 판매 중인 상품이 아닙니다.',idx; END IF;
   IF product.inventory_item_id IS NULL OR product.deduction_qty<=0 THEN RAISE EXCEPTION '%번 주문: 상품의 재고 연결을 확인하세요.',idx; END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('product_id',q.pid,'quantity',q.qty) ORDER BY q.pid)
   INTO items FROM (SELECT (x->>'product_id')::uuid pid,sum((x->>'quantity')::integer) qty FROM jsonb_array_elements(g->'items') x GROUP BY 1) q;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE (x->>'quantity')::integer>1000) THEN RAISE EXCEPTION '%번 주문: 같은 상품의 합계는 1000개 이하여야 합니다.',idx; END IF;
  n:=jsonb_build_object('order_date',d,'ship_date',sd,'customer_name',btrim(g->>'customer_name'),
   'manager_name',coalesce(btrim(g->>'manager_name'),''),'contact',coalesce(btrim(g->>'contact'),''),
   'address',btrim(g->>'address'),'receive_method',method,'note',coalesce(btrim(g->>'note'),''),'items',items);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'order_no',o.order_no) ORDER BY o.id),'[]') INTO matches
  FROM public.orders o WHERE o.deleted_at IS NULL AND o.order_status<>'취소'
   AND o.order_date=d AND o.ship_date=sd AND btrim(o.customer_name)=n->>'customer_name'
   AND coalesce(btrim(o.manager_name),'')=n->>'manager_name' AND coalesce(btrim(o.contact),'')=n->>'contact'
   AND btrim(o.address)=n->>'address' AND o.receive_method=method AND coalesce(btrim(o.note),'')=n->>'note'
   AND (SELECT jsonb_agg(jsonb_build_object('product_id',q.pid,'quantity',q.qty) ORDER BY q.pid)
    FROM (SELECT i.product_id pid,sum(i.quantity) qty FROM public.order_items i WHERE i.order_id=o.id GROUP BY i.product_id) q)=items;
  SELECT coalesce(jsonb_agg(j.ordinality),'[]') INTO prior FROM jsonb_array_elements(normalized) WITH ORDINALITY j(value,ordinality) WHERE j.value=n;
  IF jsonb_array_length(matches)>0 OR jsonb_array_length(prior)>0 THEN
   token:=md5(n::text||matches::text||prior::text);
   dup:=dup||jsonb_build_array(jsonb_build_object('index',idx-1,'matches',matches,'same_file_orders',prior,'token',token));
  END IF;
  normalized:=normalized||jsonb_build_array(n);
 END LOOP;
 IF NOT coalesce(p_commit,false) OR EXISTS(SELECT 1 FROM jsonb_array_elements(dup) x WHERE NOT ((x->>'token')=ANY(coalesce(p_confirmed,'{}')))) THEN
  RETURN jsonb_build_object('ok',true,'ready',true,'needs_confirmation',jsonb_array_length(dup)>0,'duplicates',dup,'count',jsonb_array_length(normalized));
 END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(normalized) LOOP
  oid:=public.create_admin_order_v2((g->>'order_date')::date,g->>'customer_name',g->>'manager_name',g->>'contact',
   (g->>'ship_date')::date,'기관주문',g->>'address',g->>'receive_method',g->>'note',g->'items');
  ids:=ids||jsonb_build_array(oid);
 END LOOP;
 INSERT INTO private.admin_order_imports(file_hash,created_by,order_ids) VALUES(p_file_hash,auth.uid(),ids);
 RETURN jsonb_build_object('ok',true,'created',jsonb_array_length(ids),'order_ids',ids);
END $fn$;
REVOKE ALL ON FUNCTION public.import_admin_orders_v1(text,jsonb,boolean,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_admin_orders_v1(text,jsonb,boolean,text[]) TO authenticated;
