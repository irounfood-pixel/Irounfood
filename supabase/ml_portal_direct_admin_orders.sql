-- Read-only ML visibility bridge for administrator-created ML orders.
-- Apply in staging first, then production together with the matching Edge and Apps Script deployments.
-- No order/order_items/shipping/photo records are changed.

CREATE OR REPLACE FUNCTION public.ml_portal_direct_orders(p_sheet_id text, p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF p_sheet_id <> '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'
    OR NOT EXISTS (
      SELECT 1 FROM private.partner_portal_tokens t
      JOIN public.partner_sheet_sources s USING (sheet_id)
      WHERE t.sheet_id = p_sheet_id AND t.token_hash = p_token_hash
        AND t.enabled AND s.enabled
    )
  THEN
    RAISE EXCEPTION 'ML portal is not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(x.entry ORDER BY x.ship_date DESC, x.order_no DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT o.ship_date, o.order_no,
      jsonb_build_object(
        'order_id', o.id,
        'order_no', o.order_no,
        'order_status', o.order_status,
        'order_date', COALESCE(o.order_date, (o.created_at AT TIME ZONE 'Asia/Seoul')::date)::text,
        'ship_date', o.ship_date::text,
        'recipient', COALESCE(NULLIF(btrim(o.manager_name), ''), o.customer_name, ''),
        'contact', COALESCE(o.contact, ''),
        'address', o.address,
        'note', COALESCE(o.note, ''),
        'tracking_numbers', COALESCE(d.tracking_numbers, ''),
        'ice_small', COALESCE(d.ice_small, 0),
        'ice_medium', COALESCE(d.ice_medium, 0),
        'ice_large', COALESCE(d.ice_large, 0),
        'paper_medium', COALESCE(d.paper_medium, 0),
        'paper_large', COALESCE(d.paper_large, 0),
        'photo_count', (SELECT count(*) FROM public.order_photos p WHERE p.order_id = o.id),
        'items', (SELECT COALESCE(jsonb_agg(
          jsonb_build_object('name', COALESCE(NULLIF(i.product_name_snapshot, ''), i.kit_name),
                             'quantity', i.quantity) ORDER BY i.id), '[]'::jsonb)
          FROM public.order_items i WHERE i.order_id = o.id)
      ) AS entry
    FROM public.orders o
    LEFT JOIN public.order_shipping_details d ON d.order_id = o.id
    WHERE o.partner_type = 'ML'
      AND o.deleted_at IS NULL
      AND o.order_status IS DISTINCT FROM '취소'
      AND NOT EXISTS (
        SELECT 1 FROM public.partner_order_rows r
        WHERE r.approved_order_id = o.id
      )
    ORDER BY o.ship_date DESC, o.order_no DESC
    LIMIT 1001
  ) x;

  IF jsonb_array_length(v_result) > 1000 THEN
    RAISE EXCEPTION 'ML direct order limit exceeded; pagination is required';
  END IF;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ml_portal_direct_orders(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_portal_direct_orders(text, text) TO service_role;

-- Bounded, request-scoped manifest. Apply the requested order/date filter before
-- photo LIMIT 201; the 201st item is an overflow sentinel, never silent truncation.
CREATE OR REPLACE FUNCTION public.ml_portal_photo_manifest_scoped(
  p_from date, p_to date, p_order_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH source AS (
    SELECT s.enabled FROM public.partner_sheet_sources s
    WHERE s.sheet_id = '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'
  ), approved AS (
    SELECT r.sheet_id, r.status, r.approved_order_id, r.source_row,
           r.recipient, r.contact, r.address, o.ship_date
    FROM public.partner_order_rows r
    JOIN public.orders o ON o.id = r.approved_order_id
    WHERE r.sheet_id = '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'
      AND r.status = '승인' AND r.approved_order_id IS NOT NULL
      AND o.deleted_at IS NULL AND o.order_status IS DISTINCT FROM '취소'
      AND (o.partner_type = 'ML' OR o.partner_type IS NULL)
      AND EXISTS (SELECT 1 FROM source WHERE enabled)
  ), direct AS (
    SELECT '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'::text AS sheet_id,
           '승인'::text AS status, o.id AS approved_order_id,
           0::integer AS source_row,
           COALESCE(NULLIF(btrim(o.manager_name), ''), o.customer_name, '') AS recipient,
           COALESCE(o.contact, '') AS contact,
           o.address, o.ship_date
    FROM public.orders o
    WHERE o.partner_type = 'ML'
      AND o.deleted_at IS NULL
      AND o.order_status IS DISTINCT FROM '취소'
      AND EXISTS (SELECT 1 FROM source WHERE enabled)
      AND NOT EXISTS (SELECT 1 FROM public.partner_order_rows r WHERE r.approved_order_id = o.id)
  ), visible AS (
    SELECT * FROM approved
    UNION ALL
    SELECT * FROM direct
  ), selected AS (
    SELECT * FROM visible v
    WHERE (p_order_id IS NULL OR v.approved_order_id = p_order_id)
      AND (p_from IS NULL AND p_to IS NULL OR v.ship_date BETWEEN p_from AND p_to)
    ORDER BY v.ship_date DESC, v.approved_order_id, v.source_row
    LIMIT 20001
  ), photos AS (
    SELECT p.id, p.order_id, p.storage_path, p.original_name,
           p.content_type, p.size_bytes, p.created_at, o.order_no
    FROM public.order_photos p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.order_id IN (SELECT approved_order_id FROM selected)
    ORDER BY p.created_at, p.id LIMIT 201
  )
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT enabled FROM source), false),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM selected v), '[]'::jsonb),
    'photos', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM photos p), '[]'::jsonb)
  );
$fn$;
REVOKE ALL ON FUNCTION public.ml_portal_photo_manifest_scoped(date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_portal_photo_manifest_scoped(date, date, uuid) TO service_role;

-- Keep the old internal signature for deployment compatibility and diagnostics.
-- Production photo export must use the scoped RPC, not this unfiltered wrapper.
CREATE OR REPLACE FUNCTION public.ml_portal_photo_manifest()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT public.ml_portal_photo_manifest_scoped(NULL::date, NULL::date, NULL::uuid);
$fn$;
REVOKE ALL ON FUNCTION public.ml_portal_photo_manifest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_portal_photo_manifest() TO service_role;

-- Source UIDs must be hidden in Apps Script too: merely omitting a status row
-- would make its raw spreadsheet row reappear as an unregistered order.
CREATE OR REPLACE FUNCTION public.ml_portal_hidden_uids(p_sheet_id text, p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF p_sheet_id <> '1lgXZtokJqUfvBibMmXgEPfu7KjTCteIigU_NcVYndfM'
    OR NOT EXISTS (
      SELECT 1 FROM private.partner_portal_tokens t
      JOIN public.partner_sheet_sources s USING (sheet_id)
      WHERE t.sheet_id = p_sheet_id AND t.token_hash = p_token_hash
        AND t.enabled AND s.enabled
    ) THEN RAISE EXCEPTION 'ML portal is not authorized'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(r.source_uid ORDER BY r.source_uid), '[]'::jsonb)
    FROM public.partner_order_rows r
    LEFT JOIN public.orders o ON o.id = r.approved_order_id
    WHERE r.sheet_id = p_sheet_id AND r.approved_order_id IS NOT NULL
      AND (o.id IS NULL OR o.deleted_at IS NOT NULL OR o.order_status = '취소'
           OR (o.partner_type IS NOT NULL AND o.partner_type <> 'ML'))
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.ml_portal_hidden_uids(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_portal_hidden_uids(text, text) TO service_role;
