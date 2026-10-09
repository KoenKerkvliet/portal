-- Locatie of link voor het startgesprek (adres, "telefonisch" of een videolink).
--   start_meeting_location       ingevuld door de admin op de domeinpagina
--   start_meeting_sent_location  de locatie in de laatst gemailde uitnodiging
--                                (gevuld door send-meeting-email), zodat de admin
--                                ziet dat de locatie daarna nog is gewijzigd

alter table public.projects add column if not exists start_meeting_location text;
alter table public.projects add column if not exists start_meeting_sent_location text;
