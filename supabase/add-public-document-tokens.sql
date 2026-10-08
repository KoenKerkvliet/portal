-- Geheime code per offerte, factuur en opdracht, voor links zonder inloggen.
-- De code wordt pas aangemaakt als er een mail met zo'n link verstuurd wordt
-- (door een Edge Function met service_role). Leeg = er bestaat geen publieke link.
-- Opnieuw genereren maakt de oude link ongeldig.

alter table public.quotes      add column if not exists public_token text;
alter table public.invoices    add column if not exists public_token text;
alter table public.assignments add column if not exists public_token text;

create unique index if not exists quotes_public_token_key      on public.quotes (public_token)      where public_token is not null;
create unique index if not exists invoices_public_token_key    on public.invoices (public_token)    where public_token is not null;
create unique index if not exists assignments_public_token_key on public.assignments (public_token) where public_token is not null;

-- Klanten mogen hun eigen offertes/opdrachten bijwerken (accepteren/afwijzen),
-- maar de geheime code mag alleen door admin of service_role gezet worden.
create or replace function public.guard_public_token()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.public_token is distinct from old.public_token then
    raise exception 'De publieke link mag alleen door de beheerder gewijzigd worden';
  end if;
  return new;
end;
$$;

-- Alleen als trigger bedoeld; niet aanroepbaar via de API (triggers blijven gewoon werken)
revoke execute on function public.guard_public_token() from public, anon, authenticated;

drop trigger if exists trg_guard_public_token on public.quotes;
create trigger trg_guard_public_token before update on public.quotes
  for each row execute function public.guard_public_token();

drop trigger if exists trg_guard_public_token on public.invoices;
create trigger trg_guard_public_token before update on public.invoices
  for each row execute function public.guard_public_token();

drop trigger if exists trg_guard_public_token on public.assignments;
create trigger trg_guard_public_token before update on public.assignments
  for each row execute function public.guard_public_token();
