-- Geldigheid van strippenkaarten volgens de algemene voorwaarden (versie 9 oktober 2026):
--   - zolang de klant Websitebeheer afneemt (projects.hosted_by_us; hosting kan bij
--     DesignPixels alleen samen met beheer): geen vervaldatum
--   - na beëindiging van Websitebeheer: nog 6 maanden, gerekend vanaf het moment
--     dat het vinkje uitgaat
--   - zonder Websitebeheer: 36 maanden vanaf de aankoopdatum
-- Vervangt de regels uit add-hosting-punch-card-expiry.sql (die rekenden met 2 jaar).

-- Nieuwe kaart: de database bepaalt de vervaldatum, ongeacht wat de aanmaker meestuurt
create or replace function public.punch_card_hosting_expiry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.projects where id = new.project_id and hosted_by_us) then
    new.expires_at := null;
  else
    new.expires_at := coalesce(new.purchased_at, now()) + interval '36 months';
  end if;
  return new;
end;
$$;

-- Vinkje aan: actieve kaarten zonder vervaldatum. Vinkje uit: nog 6 maanden.
create or replace function public.sync_punch_card_expiry_on_hosting()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.hosted_by_us is distinct from old.hosted_by_us then
    if new.hosted_by_us then
      update public.punch_cards set expires_at = null
      where project_id = new.id and status = 'active';
    else
      update public.punch_cards set expires_at = now() + interval '6 months'
      where project_id = new.id and status = 'active' and expires_at is null;
    end if;
  end if;
  return new;
end;
$$;

-- Bestaande actieve kaarten zonder beheer met de oude 2 jaar: naar 36 maanden
update public.punch_cards pc
set expires_at = pc.purchased_at + interval '36 months'
from public.projects p
where p.id = pc.project_id and not p.hosted_by_us and pc.status = 'active'
  and pc.expires_at is not null and pc.expires_at < pc.purchased_at + interval '36 months';

revoke execute on function public.punch_card_hosting_expiry() from public, anon, authenticated;
revoke execute on function public.sync_punch_card_expiry_on_hosting() from public, anon, authenticated;
