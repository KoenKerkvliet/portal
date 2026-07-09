-- Echte betaaldatum op de factuur vastleggen.
--
-- Tot nu toe zette de Bunq-matcher (supabase/functions/bunq-sync) alleen
-- status='paid'; de werkelijke betaaldatum leefde uitsluitend in
-- bank_transactions.booked_at. Daardoor toonde het facturenoverzicht een
-- ander datumveld (bv. de vervaldatum) als "betaald op".
--
-- Na deze migratie:
--   - bunq-sync zet paid_at = booked_at bij een automatische match.
--   - stripe-webhook zet paid_at = now() bij een strippenkaart-factuur.
--   - De frontend hoort paid_at te tonen als "betaald op" (val NIET terug op
--     due_date; gebruik desnoods invoice_date of '—' als paid_at leeg is).

alter table public.invoices
  add column if not exists paid_at timestamptz;

-- Backfill: bestaande betaalde facturen krijgen hun echte betaaldatum uit de
-- gekoppelde banktransactie. Bij meerdere transacties per factuur pakken we de
-- vroegste (eerste binnengekomen betaling).
update public.invoices i
set paid_at = sub.booked_at
from (
  select invoice_id, min(booked_at) as booked_at
  from public.bank_transactions
  where invoice_id is not null
  group by invoice_id
) sub
where sub.invoice_id = i.id
  and i.paid_at is null;
