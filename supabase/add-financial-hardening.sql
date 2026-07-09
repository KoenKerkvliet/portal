-- Financiële hardening (review-ronde). Bundelt drie DDL-wijzigingen die al live
-- op Supabase zijn toegepast; dit bestand houdt de broncode in sync.

-- 1) Fiscale vangnet: echte factuurnummers moeten uniek zijn. Test- en
--    tijdelijke (TMP/RECURRING) nummers horen niet in de reeks en worden
--    uitgesloten. (Geverifieerd: geen bestaande duplicaten.)
create unique index if not exists invoices_real_number_unique
  on public.invoices (number)
  where (not is_test and not has_temp_number);

-- Strippenkaart-nummer per project uniek — voorkomt dubbele kaartnummers bij
-- gelijktijdige/herhaalde webhook-verwerking.
create unique index if not exists punch_cards_project_number_unique
  on public.punch_cards (project_id, number);

-- 2) Idempotentie voor de Stripe-webhook: elk verwerkt event-id registreren zodat
--    een retry (Stripe levert at-least-once) geen dubbele kaart/factuur maakt.
create table if not exists public.processed_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.processed_stripe_events enable row level security;
-- Geen policies: alleen de service-role (webhook) raakt deze tabel aan.

-- 3) Offerte-inhoud beschermen: de RLS-policy "Clients can accept own quotes" is
--    een kale UPDATE zonder kolombeperking. RLS kan geen kolommen beperken; deze
--    trigger staat klanten alleen accepteren/afwijzen toe. Admin (is_admin) en
--    edge functions (service_role → auth.uid() is null) blijven ongemoeid.
create or replace function public.guard_quote_client_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.project_id       is distinct from old.project_id
     or new.client_id     is distinct from old.client_id
     or new.number        is distinct from old.number
     or new.amount        is distinct from old.amount
     or new.items         is distinct from old.items
     or new.discount_percent is distinct from old.discount_percent
     or new.btw_percent   is distinct from old.btw_percent
     or new.notes         is distinct from old.notes
     or new.valid_until   is distinct from old.valid_until
     or new.is_test       is distinct from old.is_test
     or new.created_at    is distinct from old.created_at then
    raise exception 'Klanten mogen een offerte alleen accepteren of afwijzen, niet de inhoud wijzigen';
  end if;
  if new.status is distinct from old.status
     and new.status not in ('accepted', 'declined') then
    raise exception 'Ongeldige statuswijziging voor klant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_quote_client_update on public.quotes;
create trigger trg_guard_quote_client_update
  before update on public.quotes
  for each row execute function public.guard_quote_client_update();
