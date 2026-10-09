-- Strippenkaarten zijn geldig zolang de website bij DesignPixels gehost wordt;
-- anders 2 jaar. projects.hosted_by_us geeft aan of een domein bij ons host.
-- De vervaldatum wordt centraal door de database geregeld, zodat elke route die
-- een strippenkaart aanmaakt (Stripe-betaling, schenken, later handmatig) het
-- vanzelf goed doet:
--   - nieuwe kaart voor een gehost domein: geen vervaldatum
--   - vinkje aan: actieve kaarten van dat domein verliezen hun vervaldatum
--   - vinkje uit: actieve kaarten zonder vervaldatum krijgen aankoopdatum + 2 jaar

alter table public.projects add column if not exists hosted_by_us boolean not null default false;

create or replace function public.punch_card_hosting_expiry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.projects where id = new.project_id and hosted_by_us) then
    new.expires_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_punch_card_hosting_expiry on public.punch_cards;
create trigger trg_punch_card_hosting_expiry before insert on public.punch_cards
  for each row execute function public.punch_card_hosting_expiry();

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
      update public.punch_cards set expires_at = purchased_at + interval '2 years'
      where project_id = new.id and status = 'active' and expires_at is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_punch_card_expiry_on_hosting on public.projects;
create trigger trg_sync_punch_card_expiry_on_hosting after update of hosted_by_us on public.projects
  for each row execute function public.sync_punch_card_expiry_on_hosting();

-- Alleen als trigger bedoeld; niet aanroepbaar via de API
revoke execute on function public.punch_card_hosting_expiry() from public, anon, authenticated;
revoke execute on function public.sync_punch_card_expiry_on_hosting() from public, anon, authenticated;
