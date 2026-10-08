-- Geheime code per fase (in gebruik voor de Design-fase): de klant beoordeelt
-- designs via een link zonder inloggen (Edge Function public-document, type
-- 'design'). Pas aangemaakt bij de eerste designmail; leeg = geen publieke link.

alter table public.project_phases add column if not exists public_token text;

create unique index if not exists project_phases_public_token_key
  on public.project_phases (public_token) where public_token is not null;

-- Klanten mogen hun eigen fases bijwerken (goedkeuringen in het portaal), maar
-- de code alleen admin/service_role. Zelfde functie als bij offertes/facturen.
drop trigger if exists trg_guard_public_token on public.project_phases;
create trigger trg_guard_public_token before update on public.project_phases
  for each row execute function public.guard_public_token();
