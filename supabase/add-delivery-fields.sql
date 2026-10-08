-- Oplevering-fase: wanneer de klant de "website is live"-mail en het
-- review-verzoek voor het laatst kreeg (gevuld door de Edge Function
-- send-delivery-email), en de reviewlink van het bedrijf (één voor alle klanten,
-- in te stellen bij Instellingen → Facturen → Bedrijfsgegevens).

alter table public.projects add column if not exists live_sent_at timestamptz;
alter table public.projects add column if not exists review_requested_at timestamptz;
alter table public.invoice_settings add column if not exists review_url text;
