-- Kennisbank: artikelen die klanten kunnen zoeken bij Support en die je met een
-- link (/kennisbank/:slug) in mails kunt delen, zonder inloggen. Alleen gepubliceerde
-- artikelen zijn zichtbaar; schrijven en beheren kan alleen de admin.

create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  category text not null default 'Algemeen',
  summary text not null default '',
  content text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_articles enable row level security;

drop policy if exists "Gepubliceerde artikelen zijn openbaar" on public.kb_articles;
create policy "Gepubliceerde artikelen zijn openbaar" on public.kb_articles
  for select to anon, authenticated using (published);

drop policy if exists "Admins beheren artikelen" on public.kb_articles;
create policy "Admins beheren artikelen" on public.kb_articles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.kb_articles to anon, authenticated;
grant insert, update, delete on public.kb_articles to authenticated;
