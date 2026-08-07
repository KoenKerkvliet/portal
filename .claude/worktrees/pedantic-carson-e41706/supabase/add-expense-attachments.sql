-- Bijlagen voor kosten (bonnen / facturen)
-- Voer dit uit in de Supabase SQL Editor.
--
-- VOORAF: maak in Supabase Dashboard → Storage een bucket aan met de naam
-- 'expense-receipts' en zet 'Public bucket' UIT. Daarna pas dit script draaien.

-- =============================================================================
-- expense_attachments: één rij per geüpload bestand
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense
  ON public.expense_attachments(expense_id);

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage expense_attachments" ON public.expense_attachments;
CREATE POLICY "Admins can manage expense_attachments"
  ON public.expense_attachments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================================================
-- Storage policies voor de 'expense-receipts' bucket
-- =============================================================================
-- Deze policies regelen dat alleen admins bestanden mogen lezen/uploaden/verwijderen
-- in de bucket. De bucket zelf moet je eerst via het dashboard hebben aangemaakt.

DROP POLICY IF EXISTS "Admins can read expense-receipts" ON storage.objects;
CREATE POLICY "Admins can read expense-receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can upload to expense-receipts" ON storage.objects;
CREATE POLICY "Admins can upload to expense-receipts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete from expense-receipts" ON storage.objects;
CREATE POLICY "Admins can delete from expense-receipts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
