-- Gebruik van het portaal volgen: wie logt in, welke pagina's worden bekeken en wanneer
-- worden documenten via de link uit een mail geopend. Alleen de admin kan dit lezen.
-- Gegevens worden na 12 maanden automatisch verwijderd (zie cron-job onderaan).
--   kind       'portal_view' (pagina in het portaal) of 'doc_open' (document geopend)
--   path       pagina in het portaal, bijv. /support
--   doc_type   quote | invoice | assignment | design | form
--   doc_id     id van het document (bij design: project_phases.id)
--   label      leesbare omschrijving, bijv. "Factuur INV26117"

create table if not exists public.portal_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('portal_view', 'doc_open')),
  client_id uuid references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  path text,
  doc_type text,
  doc_id uuid,
  label text not null default ''
);

create index if not exists portal_events_client_idx on public.portal_events (client_id, created_at desc);
create index if not exists portal_events_project_idx on public.portal_events (project_id, created_at desc);
create index if not exists portal_events_doc_idx on public.portal_events (doc_type, doc_id, created_at desc);

alter table public.portal_events enable row level security;

drop policy if exists "Admins lezen portaalgebruik" on public.portal_events;
create policy "Admins lezen portaalgebruik" on public.portal_events
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins verwijderen portaalgebruik" on public.portal_events;
create policy "Admins verwijderen portaalgebruik" on public.portal_events
  for delete to authenticated using (public.is_admin());

grant select, delete on public.portal_events to authenticated;

-- Een ingelogde klant meldt een bekeken pagina (of een document in het portaal). Alleen
-- klanten tellen mee; dezelfde pagina binnen 30 minuten telt één keer.
create or replace function public.log_portal_view(p_path text, p_doc_type text default null, p_doc_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_project uuid;
  v_label text := '';
  v_kind text := 'portal_view';
begin
  select id into v_client from clients where profile_id = auth.uid() limit 1;
  if v_client is null then
    return;
  end if;

  if p_doc_type is not null and p_doc_id is not null then
    if p_doc_type = 'quote' then
      select project_id, 'Offerte ' || number into v_project, v_label from quotes where id = p_doc_id and client_id = v_client;
    elsif p_doc_type = 'invoice' then
      select project_id, 'Factuur ' || number into v_project, v_label from invoices where id = p_doc_id and client_id = v_client;
    else
      return;
    end if;
    if v_label is null or v_label = '' then
      return;
    end if;
    v_kind := 'doc_open';
  end if;

  if exists (
    select 1 from portal_events
    where client_id = v_client
      and kind = v_kind
      and coalesce(path, '') = coalesce(left(p_path, 200), '')
      and coalesce(doc_id::text, '') = coalesce(p_doc_id::text, '')
      and created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;

  insert into portal_events (kind, client_id, project_id, path, doc_type, doc_id, label)
  values (v_kind, v_client, v_project, left(p_path, 200), case when v_kind = 'doc_open' then p_doc_type end,
          case when v_kind = 'doc_open' then p_doc_id end, coalesce(v_label, ''));
end;
$$;

revoke all on function public.log_portal_view(text, text, uuid) from public, anon;
grant execute on function public.log_portal_view(text, text, uuid) to authenticated;

-- Activiteit per klant voor het klantenoverzicht: laatste activiteit (portaal of
-- inloggen) en het aantal gebeurtenissen in de laatste 30 dagen. Alleen voor de admin.
create or replace function public.admin_client_activity()
returns table (client_id uuid, last_active_at timestamptz, last_sign_in_at timestamptz, events_30d bigint)
language sql
security definer
set search_path = public
as $$
  select c.id,
         greatest(e.last_event, u.last_sign_in_at),
         u.last_sign_in_at,
         coalesce(e.events_30d, 0)
  from clients c
  left join auth.users u on u.id = c.profile_id
  left join (
    select pe.client_id,
           max(pe.created_at) as last_event,
           count(*) filter (where pe.created_at > now() - interval '30 days') as events_30d
    from portal_events pe
    where pe.client_id is not null
    group by pe.client_id
  ) e on e.client_id = c.id
  where public.is_admin();
$$;

revoke all on function public.admin_client_activity() from public, anon;
grant execute on function public.admin_client_activity() to authenticated;

-- Kennisbank: hoe vaak een artikel is gelezen (anoniem, zonder te weten door wie)
alter table public.kb_articles add column if not exists view_count integer not null default 0;

create or replace function public.kb_register_view(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return; -- mijn eigen leesbeurten tellen niet mee
  end if;
  update kb_articles set view_count = view_count + 1 where slug = p_slug and published;
end;
$$;

revoke all on function public.kb_register_view(text) from public;
grant execute on function public.kb_register_view(text) to anon, authenticated;

-- Bewaartermijn: gebeurtenissen ouder dan 12 maanden dagelijks verwijderen
select cron.unschedule('portal-events-retention')
where exists (select 1 from cron.job where jobname = 'portal-events-retention');
select cron.schedule('portal-events-retention', '17 3 * * *',
  $$delete from public.portal_events where created_at < now() - interval '12 months'$$);
