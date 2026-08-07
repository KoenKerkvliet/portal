-- Voegt 'source_booked_at' toe aan expenses, gevuld bij kosten die ontstaan
-- vanuit een banktransactie. Wordt gebruikt voor sortering: kosten die uit
-- banktransacties komen volgen dezelfde volgorde als de banktransactie-lijst.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_booked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_expenses_source_booked_at
  ON public.expenses(source_booked_at DESC NULLS LAST);

-- Backfill: voor kosten die al gekoppeld zijn aan een banktransactie nemen
-- we de booked_at van die transactie over.
UPDATE public.expenses e
SET source_booked_at = bt.booked_at
FROM public.bank_transactions bt
WHERE bt.expense_id = e.id
  AND e.source_booked_at IS NULL;
