-- Uitnodiging voor het startgesprek (projects.start_meeting_at). Gevuld door de
-- Edge Function send-meeting-email:
--   start_meeting_sent_at  wanneer de uitnodiging voor het laatst is gemaild
--   start_meeting_sent_for voor welk tijdstip die uitnodiging gold, zodat de
--                          admin ziet dat de datum daarna nog is gewijzigd

alter table public.projects add column if not exists start_meeting_sent_at timestamptz;
alter table public.projects add column if not exists start_meeting_sent_for timestamptz;
