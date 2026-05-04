-- Terugkerende facturen
-- Voer dit uit in de Supabase SQL Editor.
--
-- Een 'template' is een factuur met is_recurring = true. Deze blijft staan in de
-- sectie 'Terugkerende facturen' en triggert elke periode een nieuwe (gewone)
-- factuur. De gegenereerde kopieën hebben recurring_template_id gezet en
-- is_recurring = false zodat ze door de normale flow lopen.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_interval text,
  ADD COLUMN IF NOT EXISTS recurrence_send_time text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS recurrence_next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurring_template_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Interval mag alleen één van de toegestane waarden zijn (of NULL als de factuur geen template is)
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_recurrence_interval_valid;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_recurrence_interval_valid CHECK (
    recurrence_interval IS NULL OR recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly')
  );

-- Een template moet een interval hebben; iets dat geen template is mag geen interval hebben.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_recurring_requires_interval;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_recurring_requires_interval CHECK (
    (is_recurring = false AND recurrence_interval IS NULL AND recurrence_next_run_at IS NULL)
    OR (is_recurring = true AND recurrence_interval IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_invoices_recurrence_due
  ON public.invoices(recurrence_next_run_at)
  WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_invoices_recurring_template
  ON public.invoices(recurring_template_id)
  WHERE recurring_template_id IS NOT NULL;

-- =============================================================================
-- Optioneel: cron via pg_cron (vereist extensies pg_cron + pg_net) — elk uur.
-- De Edge Function checkt zelf welke templates aan de beurt zijn.
-- =============================================================================
--
-- SELECT cron.schedule(
--   'process-recurring-invoices',
--   '5 * * * *',  -- elk uur op :05 (na bunq-sync op :00)
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT-REF>.supabase.co/functions/v1/process-recurring-invoices',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Stop met:  SELECT cron.unschedule('process-recurring-invoices');
