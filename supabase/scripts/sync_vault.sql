-- Dipanggil GitHub Actions (psql) untuk membuat/memperbarui secret Vault yang
-- dibaca pg_cron. Contoh:
--   psql "$SUPABASE_DB_URL" -v project_url=https://xxx.supabase.co -v cron_secret=... -f supabase/scripts/sync_vault.sql
\set ON_ERROR_STOP on
select set_config('kmi.project_url', :'project_url', false);
select set_config('kmi.cron_secret', :'cron_secret', false);

do $$
declare
  v_url    text := current_setting('kmi.project_url');
  v_secret text := current_setting('kmi.cron_secret');
  v_id     uuid;
begin
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    raise exception 'project_url dan cron_secret wajib diisi';
  end if;

  select id into v_id from vault.secrets where name = 'project_url';
  if v_id is null then perform vault.create_secret(v_url, 'project_url');
  else perform vault.update_secret(v_id, v_url); end if;

  select id into v_id from vault.secrets where name = 'cron_secret';
  if v_id is null then perform vault.create_secret(v_secret, 'cron_secret');
  else perform vault.update_secret(v_id, v_secret); end if;
end $$;
