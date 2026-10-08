-- Wanneer een offerte, factuur of opdracht voor het laatst naar de klant is
-- gemaild. Gevuld door de Edge Functions send-quote-email, send-invoice-email en
-- send-assignment-email (service_role). Leeg = (nog) niet via die weg gemaild.

alter table public.quotes      add column if not exists last_sent_at timestamptz;
alter table public.invoices    add column if not exists last_sent_at timestamptz;
alter table public.assignments add column if not exists last_sent_at timestamptz;
