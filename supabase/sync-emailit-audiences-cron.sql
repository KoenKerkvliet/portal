-- Nachtelijke sync van de Emailit-audiences (Alle klanten + Hostingklanten)
-- Vereist: pg_cron, pg_net, pgcrypto en supabase_vault (staan al aan).
--
-- Auth zonder service-role key: een eigen willekeurige code. De code zelf staat versleuteld
-- in Vault (pg_cron leest hem bij elke run), de functie kent alleen de SHA-256 uit
-- integration_config. Opnieuw uitvoeren maakt een nieuwe code aan.

-- 1. Code aanmaken: plat in Vault, hash in integration_config
do $$
declare
  t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from vault.secrets where name = 'sync_emailit_cron_token';
  perform vault.create_secret(t, 'sync_emailit_cron_token', 'Code waarmee pg_cron de Emailit-sync aanroept');
  insert into public.integration_config (key, value)
  values ('sync_emailit_cron_token_sha256', encode(extensions.digest(t, 'sha256'), 'hex'))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- 2. Elke nacht om 03:30 UTC (04:30 NL-winter, 05:30 NL-zomer)
select cron.schedule(
  'sync-emailit-audiences',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://gzrfnafjelhyveceebwj.supabase.co/functions/v1/sync-emailit-audiences',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_emailit_cron_token')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Stoppen:   select cron.unschedule('sync-emailit-audiences');
-- Status:    select status_code, content, created from net._http_response order by created desc limit 5;
