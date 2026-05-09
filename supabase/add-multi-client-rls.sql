-- Allow secondary clients on a domain (linked via project_clients but not the
-- primary projects.client_id) to read their own rows and the projects they're
-- linked to. Without this, the portal screen for such clients shows
-- "Wachten op koppeling aan project..." because RLS hides the data.

CREATE POLICY "Clients can view own project_clients" ON public.project_clients
  FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE profile_id = auth.uid()));

CREATE POLICY "Clients can view projects via project_clients" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_clients pc
      JOIN clients c ON c.id = pc.client_id
      WHERE pc.project_id = projects.id
      AND c.profile_id = auth.uid()
    )
  );
