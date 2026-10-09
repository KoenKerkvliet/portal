-- Vragenlijsten invullen via een link in de mail, zonder inloggen (zie Edge Functions
-- public-document en send-form-email). Een vragenlijst koppelen aan een domein maakt
-- één form_submissions-rij aan; die rij krijgt bij de eerste mail een geheime code.
--   public_token  geheime code in de link (/d/vragenlijst/:token)
--   last_sent_at  wanneer de vragenlijst voor het laatst is gemaild
--   updated_at    laatste keer dat de klant iets heeft ingevuld (tussentijds opslaan)

alter table public.form_submissions add column if not exists public_token text unique;
alter table public.form_submissions add column if not exists last_sent_at timestamptz;
alter table public.form_submissions add column if not exists updated_at timestamptz;

-- Per domein elke vragenlijst maar één keer
create unique index if not exists form_submissions_form_project_key
  on public.form_submissions (form_id, project_id);

-- Alleen de beheerder (of de server) mag de geheime code zetten of wijzigen
drop trigger if exists trg_guard_public_token on public.form_submissions;
create trigger trg_guard_public_token
  before update on public.form_submissions
  for each row execute function public.guard_public_token();
