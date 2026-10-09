-- Logboek van beveiligde links (bijv. Inprivy) die de admin vanaf de domeinpagina
-- (Algemeen > Privacy) mailt. De link zelf wordt bewust NIET opgeslagen: die staat
-- alleen in de mail aan de ontvanger.

create table if not exists public.secure_link_sends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_email text not null,
  note text not null default '',
  has_password boolean not null default false,
  sent_at timestamptz not null default now()
);

alter table public.secure_link_sends enable row level security;

drop policy if exists "Admins beheren verzonden beveiligde links" on public.secure_link_sends;
create policy "Admins beheren verzonden beveiligde links" on public.secure_link_sends
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
