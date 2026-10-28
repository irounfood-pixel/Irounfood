-- v2 administrator-owned reverse sync: server shipment/box/photo count -> partner sheet.
-- Test project only. No order, inventory, or shipping rows are changed here.
create or replace function public.partner_sheet_status(p_sheet_id text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
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
end $fn$;
revoke all on function public.partner_sheet_status(text,text) from public,anon,authenticated;
grant execute on function public.partner_sheet_status(text,text) to service_role;
