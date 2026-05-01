-- Expenses (kosten) tabel voor administratie
-- Voer dit uit in de Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  vendor text,
  description text NOT NULL,
  category text,
  amount_excl_btw numeric(10,2) NOT NULL DEFAULT 0,
  btw_percent numeric(5,2) DEFAULT 21,
  btw_amount numeric(10,2) NOT NULL DEFAULT 0,
  amount_incl_btw numeric(10,2) NOT NULL DEFAULT 0,
  invoice_number text,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;
CREATE POLICY "Admins can manage expenses"
  ON public.expenses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
