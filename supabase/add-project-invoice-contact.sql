-- Factuurcontact per domein (project).
--
-- Een klant (persoon) kan aan meerdere domeinen gekoppeld zijn met per domein
-- een eigen factuurnaam/-adres (bv. Bas: BGH -> penningmeester@bghoefveld.nl,
-- Scootmobiel -> bas@scootmobielandmore.nl). De factuurbouwer vult deze velden
-- automatisch in bij domeinkeuze; leeg = fallback naar de gegevens van de
-- gekozen klant (het bestaande gedrag).
--
-- Bijbehorende gedragswijziging in de mail-functions (send-invoice-email,
-- send-invoice-reminder, send-quote-email, process-recurring-invoices):
-- het op de factuur/offerte vastgelegde e-mailadres (snapshot) wint voortaan
-- van het live klant-adres, zodat per-domein-adressen blijven kloppen.

alter table public.projects
  add column if not exists invoice_name text,
  add column if not exists invoice_email text;
