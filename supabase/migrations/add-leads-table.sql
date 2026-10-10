-- Leads uit de lead-scanner (Google Places + website-audit).
-- Scanresultaten worden overschreven bij elke scan; de opvolgvelden
-- (status, note, last_contact_at, follow_up_at) zijn van de gebruiker en
-- worden door een scan nooit aangeraakt.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),

  -- identiteit, afkomstig van Google Places
  place_id text unique,
  name text not null,
  address text,
  phone text,
  website text,

  -- resultaat van de website-audit
  website_kind text check (website_kind in ('eigen', 'social', 'gids', 'geen')),
  score integer check (score between 0 and 100),
  priority text check (priority in ('geen_site', 'social', 'hoog', 'gemiddeld', 'ok')),
  issues text[] not null default '{}',
  cms text,
  has_ssl boolean,
  mobile_friendly boolean,
  load_time_seconds numeric(6,2),
  google_rating numeric(2,1),
  google_reviews integer,

  -- herkomst van de lead
  search_query text,
  region text,
  lead_type text,

  -- opvolging: alleen van de gebruiker
  status text not null default 'nieuw' check (status in (
    'nieuw', 'interessant', 'contact_gelegd', 'mail_gestuurd',
    'in_beraad', 'nog_opvolgen', 'niet_interessant'
  )),
  note text,
  last_contact_at date,
  follow_up_at date,

  first_seen_at timestamptz not null default now(),
  scanned_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Leads uit een eerdere bron hebben geen place_id; daarop matchen we op naam.
create index if not exists leads_name_lower_idx on public.leads (lower(name));
create index if not exists leads_priority_idx on public.leads (priority);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_region_idx on public.leads (region);
create index if not exists leads_follow_up_idx on public.leads (follow_up_at) where follow_up_at is not null;

alter table public.leads enable row level security;

create policy "Admins full access to leads" on public.leads
  for all using (public.is_admin());

comment on table public.leads is 'Leads uit de lead-scanner. Scanvelden worden bij elke scan bijgewerkt, opvolgvelden (status/note/last_contact_at/follow_up_at) nooit.';

-- Koppeling naar de klant die uit deze lead is voortgekomen. Verdwijnt de
-- klant, dan blijft de lead bestaan zonder koppeling.
alter table public.leads
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists leads_client_idx on public.leads (client_id) where client_id is not null;

comment on column public.leads.client_id is 'Gezet wanneer je vanuit deze lead een klant aanmaakt. Een scan raakt dit veld niet aan.';
