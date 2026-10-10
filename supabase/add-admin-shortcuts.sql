-- Snelkoppelingen op het admin-dashboard (bijv. Sinosend, Inprivy, Hostinger).
--   title       naam op de tegel
--   url         adres dat in een nieuw tabblad opent
--   sort_order  volgorde op het dashboard (laag eerst)

create table if not exists public.admin_shortcuts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.admin_shortcuts enable row level security;

drop policy if exists "Admins beheren snelkoppelingen" on public.admin_shortcuts;
create policy "Admins beheren snelkoppelingen" on public.admin_shortcuts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.admin_shortcuts to authenticated;
