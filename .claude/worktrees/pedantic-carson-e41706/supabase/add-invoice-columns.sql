-- Nieuwe kolommen voor de invoices tabel (InvoiceBuilder)
-- Voer dit uit in de Supabase SQL Editor

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS btw_percent numeric(5,2) DEFAULT 21,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0;
