-- Aanbetalings- en restfactuur ondersteuning
-- Voer dit uit in de Supabase SQL Editor

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_deposit_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_remainder_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_temp_number boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_parent_invoice_id
  ON public.invoices(parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;
