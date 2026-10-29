-- Production feature prerequisite: private order photo attachments.
-- Does not modify existing order, inventory, or shipment records.
create table if not exists public.order_photos(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  storage_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint order_photos_order_path_check check (storage_path like order_id::text || '/%')
);
create index if not exists order_photos_order_id_idx on public.order_photos(order_id,created_at desc);
alter table public.order_photos enable row level security;
revoke all on public.order_photos from anon;
grant select,insert,delete on public.order_photos to authenticated;
do $policies$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='order_photos' and policyname='order_photos_admin_read') then
  create policy order_photos_admin_read on public.order_photos for select to authenticated using (private.is_admin());
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='order_photos' and policyname='order_photos_admin_insert') then
  create policy order_photos_admin_insert on public.order_photos for insert to authenticated with check (private.is_admin() and uploaded_by=auth.uid());
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='order_photos' and policyname='order_photos_admin_delete') then
  create policy order_photos_admin_delete on public.order_photos for delete to authenticated using (private.is_admin());
 end if;
end $policies$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('iroun-order-photos','iroun-order-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $storage_policies$
begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='iroun_order_photos_admin_read') then
  create policy iroun_order_photos_admin_read on storage.objects for select to authenticated
  using (bucket_id='iroun-order-photos' and private.is_admin());
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='iroun_order_photos_admin_upload') then
  create policy iroun_order_photos_admin_upload on storage.objects for insert to authenticated
  with check (
   bucket_id='iroun-order-photos' and private.is_admin()
   and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$'
   and exists(select 1 from public.orders o where o.id::text=split_part(objects.name,'/',1))
  );
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='iroun_order_photos_admin_delete') then
  create policy iroun_order_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id='iroun-order-photos' and private.is_admin());
 end if;
end $storage_policies$;
