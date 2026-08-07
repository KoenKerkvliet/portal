-- Klanten moeten invoice_settings kunnen lezen om de IBAN- en KOR-banner op
-- hun factuur-pagina te zien. Zonder deze policy zijn `settings.iban` en
-- `settings.kor_enabled` undefined in de client view, en valt de blauwe
-- 'overmaken naar'-balk + de gele KOR-melding weg.
--
-- iban en kor_enabled staan sowieso al op elke factuur die de klant ziet,
-- dus geen extra informatie-leak. We geven authenticated users alleen SELECT.

create policy "Authenticated can read invoice_settings"
  on public.invoice_settings
  for select
  using (auth.role() = 'authenticated');
