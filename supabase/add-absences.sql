-- Afwezigheid (vakantie, vrije dagen). Beheerd op het admin-dashboard; klanten zien
-- een melding in het portaal, op de pagina's achter links in mails en in de kennisbank,
-- vanaf twee weken voor de start tot en met de laatste dag.
--   starts_on / ends_on  eerste en laatste dag van de afwezigheid (inclusief)
--   message              optionele toelichting, bijv. "Ik ben op vakantie."
--   emergency            optioneel: hoe spoed in die periode geregeld is

create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  message text not null default '',
  emergency text not null default '',
  created_at timestamptz not null default now(),
  constraint absences_period_check check (ends_on >= starts_on)
);

alter table public.absences enable row level security;

-- Iedereen (ook zonder login) mag huidige en komende afwezigheid lezen: de melding staat
-- ook op openbare pagina's. Afgelopen periodes blijven alleen voor de admin zichtbaar.
drop policy if exists "Huidige en komende afwezigheid is openbaar" on public.absences;
create policy "Huidige en komende afwezigheid is openbaar" on public.absences
  for select to anon, authenticated using (ends_on >= current_date);

drop policy if exists "Admins beheren afwezigheid" on public.absences;
create policy "Admins beheren afwezigheid" on public.absences
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.absences to anon, authenticated;
grant insert, update, delete on public.absences to authenticated;
