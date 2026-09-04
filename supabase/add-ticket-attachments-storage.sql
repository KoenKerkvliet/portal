-- Storage voor ticket-bijlages
-- Voer dit uit in de Supabase SQL Editor (als postgres/service-rol).
--
-- Achtergrond: src/pages/client/TicketSystem.tsx en src/pages/admin/Tickets.tsx
-- uploadden al naar de bucket 'ticket-attachments', maar die bestond niet. Elke
-- upload faalde daardoor. Dit script maakt de bucket aan (NIET publiek) en zet
-- de policies zoals bij 'quote-attachments': lezen via signed URLs, alleen voor
-- admins en de klanten die aan het bijbehorende domein gekoppeld zijn.
--
-- Padconventie in de bucket (bepaalt de policies):
--   <project_id>/new/<uniek>.<ext>            -- bijlage bij een nieuw ticket
--   <project_id>/<ticket_id>/<uniek>.<ext>    -- bijlage bij een reactie
-- De eerste map is dus altijd het project-id.

-- =============================================================================
-- Bucket
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- Helpers
-- =============================================================================

-- Eerste map van een storage-pad als uuid; NULL als het geen uuid is.
CREATE OR REPLACE FUNCTION public.ticket_attachment_project(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(object_name, '/', 1)
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN split_part(object_name, '/', 1)::uuid
    ELSE NULL
  END;
$$;

-- Mag de ingelogde gebruiker bij dit domein? Admin altijd; een klant als hij de
-- primaire klant van het project is of via project_clients gekoppeld is.
-- SECURITY DEFINER zodat de check zelf niet door RLS op projects/clients loopt.
CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR (
      p_project_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.projects p
          JOIN public.clients c ON c.id = p.client_id
          WHERE p.id = p_project_id AND c.profile_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.project_clients pc
          JOIN public.clients c ON c.id = pc.client_id
          WHERE pc.project_id = p_project_id AND c.profile_id = auth.uid()
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.ticket_attachment_project(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated;

-- =============================================================================
-- Storage policies voor de 'ticket-attachments' bucket
-- =============================================================================

-- Lezen: admins alles, klanten alleen bijlages van hun eigen domein(en).
-- De app leest via createSignedUrl(); die signed URL wordt met deze policy
-- gecontroleerd op het moment dat hij aangemaakt wordt.
DROP POLICY IF EXISTS "Ticket attachments readable by admins and project clients" ON storage.objects;
CREATE POLICY "Ticket attachments readable by admins and project clients"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND public.can_access_project(public.ticket_attachment_project(name))
  );

-- Uploaden: klanten uploaden hier zelf, maar alleen in de map van een domein
-- waar ze aan gekoppeld zijn. Admins mogen overal uploaden.
DROP POLICY IF EXISTS "Ticket attachments uploadable by admins and project clients" ON storage.objects;
CREATE POLICY "Ticket attachments uploadable by admins and project clients"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND public.can_access_project(public.ticket_attachment_project(name))
  );

-- Overschrijven en verwijderen: alleen admins. Klanten kunnen een verstuurde
-- bijlage niet meer weghalen of vervangen.
DROP POLICY IF EXISTS "Admins can update ticket-attachments" ON storage.objects;
CREATE POLICY "Admins can update ticket-attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'ticket-attachments' AND public.is_admin())
  WITH CHECK (bucket_id = 'ticket-attachments' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete from ticket-attachments" ON storage.objects;
CREATE POLICY "Admins can delete from ticket-attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'ticket-attachments' AND public.is_admin());
