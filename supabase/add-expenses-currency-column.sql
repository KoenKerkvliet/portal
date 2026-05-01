-- Voeg valuta-kolom toe aan expenses tabel
-- Voer dit uit in de Supabase SQL Editor (na add-expenses-table.sql)

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
