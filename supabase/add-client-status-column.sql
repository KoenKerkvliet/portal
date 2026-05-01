-- Status-kolom toevoegen aan klanten voor archivering
-- Voer dit uit in de Supabase SQL Editor

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);
