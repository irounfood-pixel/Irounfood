-- Administrator-only supplier details for printable transaction/delivery statements.
-- Contains no real supplier details; production values are inserted privately into Supabase.
create table if not exists public.document_supplier_profile (
  id integer primary key default 1 check (id = 1),
  name text not null default '',
  number text not null default '',
  owner text not null default '',
  address text not null default '',
  contact text not null default '',
  business_type text not null default '',
  business_item text not null default '',
  bank text not null default '',
  account text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.document_supplier_profile enable row level security;
revoke all on table public.document_supplier_profile from public, anon;
revoke all on table public.document_supplier_profile from authenticated;
grant select, insert, update on table public.document_supplier_profile to authenticated;
drop policy if exists document_supplier_profile_admin_read on public.document_supplier_profile;
create policy document_supplier_profile_admin_read on public.document_supplier_profile
  for select to authenticated using ((select private.is_admin()));
drop policy if exists document_supplier_profile_admin_insert on public.document_supplier_profile;
create policy document_supplier_profile_admin_insert on public.document_supplier_profile
  for insert to authenticated with check ((select private.is_admin()));
drop policy if exists document_supplier_profile_admin_update on public.document_supplier_profile;
create policy document_supplier_profile_admin_update on public.document_supplier_profile
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
