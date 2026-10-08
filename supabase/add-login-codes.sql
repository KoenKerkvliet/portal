-- Inlogcodes (6 cijfers) voor inloggen met een code uit de mail (Edge Function
-- login-code). De code zelf wordt nooit opgeslagen: alleen een SHA-256-hash met een
-- willekeurige salt. Rijen zonder code_hash zijn aanvragen voor een onbekend adres;
-- die tellen mee voor de limiet, zodat niet te zien is of een adres een account heeft.
-- Alleen service_role: RLS aan, geen policies.

create table if not exists public.login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text,
  salt text,
  ip text,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists login_codes_email_created_idx on public.login_codes (email, created_at desc);
create index if not exists login_codes_ip_created_idx on public.login_codes (ip, created_at desc);

alter table public.login_codes enable row level security;
