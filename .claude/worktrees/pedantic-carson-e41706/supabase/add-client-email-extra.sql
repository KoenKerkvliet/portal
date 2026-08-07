-- Extra e-mailadressen per klant
-- Voer dit uit in de Supabase SQL Editor

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email_extra text[] NOT NULL DEFAULT '{}'::text[];
