-- Wanneer de link naar de stagingsite (testsite) voor het laatst naar de klant is
-- gemaild. Gevuld door de Edge Function send-staging-email. Leeg = nog niet gemaild.

alter table public.projects add column if not exists staging_sent_at timestamptz;
