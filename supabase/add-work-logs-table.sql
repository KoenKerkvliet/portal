-- Werkzaamheden (werklog per domein)
-- Voer dit uit in de Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  performed_at date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'onderhoud',
  billable boolean NOT NULL DEFAULT false,
  visible_to_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_logs_project ON public.work_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON public.work_logs(performed_at DESC);

ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage work logs" ON public.work_logs;
CREATE POLICY "Admins can manage work logs"
  ON public.work_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
