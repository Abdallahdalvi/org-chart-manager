-- Run once in your OWN Supabase SQL editor before starting the CasaOS app.
-- Schema only. No employee data, credentials, or seeded approvals here.
begin;
create table if not exists public.org_chart_documents (
  id text primary key check (id = 'company'),
  revision bigint not null check (revision >= 0),
  data jsonb not null
);
create table if not exists public.org_chart_snapshots (
  revision bigint primary key,
  version text not null,
  date timestamptz not null,
  data jsonb not null
);
alter table public.org_chart_documents enable row level security;
alter table public.org_chart_snapshots enable row level security;
revoke all on public.org_chart_documents, public.org_chart_snapshots from public, anon, authenticated;
grant select, insert, update on public.org_chart_documents to service_role;
grant select, insert on public.org_chart_snapshots to service_role;

create or replace function public.org_chart_save(p_expected_revision bigint, p_document jsonb, p_previous_document jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_row public.org_chart_documents%rowtype;
begin
  if p_expected_revision < 0 or p_document is null or p_previous_document is null or
     pg_catalog.octet_length(p_document::text) > 1500000 or
     pg_catalog.octet_length(p_previous_document::text) > 1500000 then
    raise exception 'Invalid document';
  end if;
  insert into public.org_chart_documents(id, revision, data)
    values ('company', 0, p_previous_document) on conflict (id) do nothing;
  select * into current_row from public.org_chart_documents where id = 'company' for update;
  if current_row.revision <> p_expected_revision then return false; end if;
  insert into public.org_chart_snapshots(revision, version, date, data)
    values (current_row.revision, current_row.data->>'version', coalesce(nullif(current_row.data->>'updatedDate', '')::timestamptz, now()), current_row.data)
    on conflict (revision) do nothing;
  update public.org_chart_documents set revision = p_expected_revision + 1, data = p_document where id = 'company';
  insert into public.org_chart_snapshots(revision, version, date, data)
    values (p_expected_revision + 1, p_document->>'version', now(), p_document);
  return true;
end;
$$;
revoke all on function public.org_chart_save(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.org_chart_save(bigint, jsonb, jsonb) to service_role;
commit;
