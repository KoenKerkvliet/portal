-- Fix: een klant verwijderen mag NOOIT het hele domein meeslepen.
--
-- Huidige situatie: projects.client_id, invoices.client_id en quotes.client_id
-- hebben ON DELETE CASCADE. Een klant verwijderen wist daardoor hun project
-- (en via project-cascade ook alle phase-instances, facturen, offertes, etc.)
-- en hun factuur/offerte-historie.
--
-- Fix: vervang CASCADE door SET NULL op deze drie velden. Domein en historie
-- blijven bestaan; alleen de koppeling naar de verwijderde klant verdwijnt.
--
-- Draai dit script één keer in Supabase Dashboard > SQL Editor.

-- 1) projects.client_id: domein moet blijven leven na klantverwijdering
alter table public.projects
  alter column client_id drop not null;

alter table public.projects
  drop constraint projects_client_id_fkey;

alter table public.projects
  add constraint projects_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;

-- 2) invoices.client_id: factuurhistorie blijft bewaard
alter table public.invoices
  alter column client_id drop not null;

alter table public.invoices
  drop constraint invoices_client_id_fkey;

alter table public.invoices
  add constraint invoices_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;

-- 3) quotes.client_id: offertehistorie blijft bewaard
alter table public.quotes
  alter column client_id drop not null;

alter table public.quotes
  drop constraint quotes_client_id_fkey;

alter table public.quotes
  add constraint quotes_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete set null;
