-- Nachtelijke sync van de Emailit-audiences (Alle klanten + Hostingklanten)
-- Vereist: extensies pg_cron en pg_net (staan al aan). Eenmalig uitvoeren in de SQL-editor.
-- Vervang <PROJECT-REF> en <SERVICE_ROLE_KEY> door je eigen waarden. Zet de key nergens in git.
--
-- Draait elke nacht om 03:30 UTC (04:30 NL-winter, 05:30 NL-zomer).

select cron.schedule(
  'sync-emailit-audiences',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-emailit-audiences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Stoppen:   select cron.unschedule('sync-emailit-audiences');
-- Status:    select * from cron.job_run_details where jobname = 'sync-emailit-audiences' order by start_time desc limit 5;
