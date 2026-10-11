-- Resultaat van het benaderen van leads bijhouden: wanneer een lead voor het eerst is
-- benaderd en wanneer er een reactie kwam. Samen met client_id (klant geworden) geeft
-- dat het overzicht benaderd -> reactie -> klant.
--   first_contacted_at  eerste mail of contact (wordt gezet bij de eerste statuswijziging
--                       naar mail gestuurd / tweede mail / contact gelegd / in beraad)
--   replied_at          reactie ontvangen (gezet bij "In beraad", of handmatig)

alter table public.leads add column if not exists first_contacted_at date;
alter table public.leads add column if not exists replied_at date;

-- Bestaande leads: wie al benaderd is, krijgt de best bekende datum
update public.leads
set first_contacted_at = coalesce(last_contact_at, updated_at::date, first_seen_at::date)
where first_contacted_at is null
  and status in ('mail_gestuurd', 'tweede_mail', 'contact_gelegd', 'in_beraad', 'nog_opvolgen');

update public.leads
set replied_at = coalesce(last_contact_at, updated_at::date)
where replied_at is null and status = 'in_beraad';
