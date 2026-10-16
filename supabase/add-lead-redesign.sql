-- Redesignpagina per lead: een openbare pagina (/d/redesign/<code>) met titel, korte
-- intro, het ontwerp in een monitor en daaronder de volledige design file. Geen
-- goedkeuring; wel een contactknop. De Edge Function public-document (type 'redesign')
-- leest de pagina via de geheime code en houdt bij wanneer de lead hem bekijkt.
-- leads is alleen voor admins (RLS), dus de code hoeft niet extra afgeschermd.

alter table public.leads
  add column if not exists redesign_token text,
  add column if not exists redesign_image_url text,
  add column if not exists redesign_title text,
  add column if not exists redesign_intro text,
  add column if not exists redesign_views integer not null default 0,
  add column if not exists redesign_first_viewed_at timestamptz,
  add column if not exists redesign_last_viewed_at timestamptz;

create unique index if not exists leads_redesign_token_key
  on public.leads (redesign_token) where redesign_token is not null;

comment on column public.leads.redesign_token is 'Geheime code van de openbare redesignpagina; leeg = geen pagina.';
comment on column public.leads.redesign_views is 'Aantal keer bekeken via de link (mijn eigen bezoeken en herladen binnen 30 minuten tellen niet).';
