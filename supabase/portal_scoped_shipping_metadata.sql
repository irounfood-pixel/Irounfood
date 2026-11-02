DO $patch$
DECLARE original text; amended text;
BEGIN
 SELECT pg_get_functiondef('public.partner_portal_manage(text,text,text,uuid,jsonb,timestamptz)'::regprocedure) INTO original;
 IF position('''order_no'',o.order_no' in original)>0 THEN RETURN; END IF;
 amended:=replace(original,'''order_status'',o.order_status,',
 '''order_status'',o.order_status,''order_no'',o.order_no,
 ''tracking_numbers'',coalesce(d.tracking_numbers,''''),
 ''ice_small'',coalesce(d.ice_small,0),''ice_medium'',coalesce(d.ice_medium,0),''ice_large'',coalesce(d.ice_large,0),
 ''paper_medium'',coalesce(d.paper_medium,0),''paper_large'',coalesce(d.paper_large,0),
 ''photo_count'',(SELECT count(*) FROM public.order_photos ph WHERE ph.order_id=o.id),');
 amended:=replace(amended,'WHERE r.sheet_id=p_sheet_id;','LEFT JOIN public.order_shipping_details d ON d.order_id=o.id WHERE r.sheet_id=p_sheet_id;');
 IF amended=original OR position('LEFT JOIN public.order_shipping_details' in amended)=0 THEN RAISE EXCEPTION 'unexpected function definition'; END IF;
 EXECUTE amended;
END $patch$;