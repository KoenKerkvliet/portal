-- Bunq integratie: tabellen voor authenticatiestatus en banktransacties
-- Voer dit uit in de Supabase SQL Editor.
--
-- bunq_state is een single-row tabel die de RSA-keypair, installation token,
-- session token en sync-cursor bewaart. De Edge Function 'bunq-sync' beheert
-- deze rij volledig zelf — niets handmatig aanpassen tenzij je opnieuw wilt
-- starten (truncate de tabel, dan maakt de volgende sync alles opnieuw aan).

-- =============================================================================
-- bunq_state: persistente Bunq API-status (singleton)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bunq_state (
  id smallint PRIMARY KEY DEFAULT 1,
  private_key_pem text,                    -- RSA-2048 private key in PEM (PKCS8)
  public_key_pem text,                     -- bijbehorende public key
  installation_token text,                 -- token uit POST /v1/installation
  server_public_key_pem text,              -- public key van de Bunq-server
  device_server_id bigint,                 -- id van geregistreerde device
  session_token text,                      -- huidige sessietoken
  session_expires_at timestamptz,          -- vervaldatum sessie
  user_id bigint,                          -- Bunq UserPerson/UserCompany id
  monetary_account_ids bigint[],           -- gecachte rekening-IDs
  last_sync_at timestamptz,                -- laatst succesvolle sync
  last_payment_id bigint,                  -- hoogste payment-id die is verwerkt
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT bunq_state_singleton CHECK (id = 1)
);

-- Zorg dat er altijd precies één rij is
INSERT INTO public.bunq_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bunq_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read bunq_state" ON public.bunq_state;
CREATE POLICY "Admins can read bunq_state"
  ON public.bunq_state
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Schrijven/wijzigen gebeurt alléén door de Edge Function via service-role key,
-- die RLS sowieso bypasst. Geen INSERT/UPDATE/DELETE policy voor gebruikers.

-- =============================================================================
-- bank_transactions: door Bunq opgehaalde transacties
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bunq_payment_id bigint NOT NULL UNIQUE,
  bunq_account_id bigint NOT NULL,
  booked_at timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL,           -- positief = inkomsten, negatief = uitgaven
  currency text NOT NULL DEFAULT 'EUR',
  description text NOT NULL DEFAULT '',
  counterparty_name text,
  counterparty_iban text,
  payment_type text,                       -- bv. 'IDEAL', 'SEPA_CREDIT_TRANSFER', 'BUNQ', 'MASTERCARD'
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  -- Optionele categorie voor transacties die niet aan factuur/kost gekoppeld zijn,
  -- maar wel verwerkt moeten zijn. Houdt zakelijke totalen schoon.
  category text,
  raw jsonb,                               -- originele Bunq-respons voor debugging
  created_at timestamptz DEFAULT now(),
  CONSTRAINT bank_transactions_category_valid CHECK (
    category IS NULL OR category IN ('private_deposit', 'private_withdrawal', 'private_purchase', 'interest')
  ),
  -- Hoogstens één van invoice_id / expense_id / category mag gevuld zijn.
  CONSTRAINT bank_transactions_single_link CHECK (
    (CASE WHEN invoice_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN category IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_booked_at
  ON public.bank_transactions(booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_invoice
  ON public.bank_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_expense
  ON public.bank_transactions(expense_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account
  ON public.bank_transactions(bunq_account_id);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage bank_transactions" ON public.bank_transactions;
CREATE POLICY "Admins can manage bank_transactions"
  ON public.bank_transactions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================================================
-- Optioneel: uurlijkse cron via pg_cron (vereist extension 'pg_cron' + 'pg_net')
-- =============================================================================
-- 1. Activeer beide extensies in Supabase (Database → Extensions): pg_cron, pg_net.
-- 2. Vul hieronder de URL en de Edge Function 'service-role' Authorization in.
-- 3. Voer dit gedeelte apart uit zodra de Edge Function deployed is.
--
-- SELECT cron.schedule(
--   'bunq-hourly-sync',
--   '0 * * * *',  -- elk heel uur
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT-REF>.supabase.co/functions/v1/bunq-sync',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Stop cron weer met:  SELECT cron.unschedule('bunq-hourly-sync');

-- =============================================================================
-- Optioneel: wekelijkse herinnering voor onverwerkte banktransacties
-- =============================================================================
-- Vrijdagavond 18:00 UTC (= 19:00 winter NL / 20:00 zomer NL).
-- Stuurt alleen mail als er ook daadwerkelijk onverwerkte transacties zijn.
--
-- SELECT cron.schedule(
--   'weekly-unprocessed-reminder',
--   '0 18 * * 5',  -- vrijdag 18:00 UTC
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT-REF>.supabase.co/functions/v1/weekly-unprocessed-reminder',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Stop met:  SELECT cron.unschedule('weekly-unprocessed-reminder');
