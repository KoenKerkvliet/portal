-- Wanneer de link om bestanden te delen (projects.file_sharing_url) voor het laatst
-- naar de klant is gemaild. Gevuld door de Edge Function send-files-email.

alter table public.projects add column if not exists files_sent_at timestamptz;
