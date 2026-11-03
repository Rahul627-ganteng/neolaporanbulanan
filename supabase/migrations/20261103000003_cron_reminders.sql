-- =====================================================================
--  Migrasi 3/3 — Otomatisasi pengingat rundown dengan pg_cron + Edge Function
--
--  Setiap pagi pukul 06.05 WIB (23.05 UTC) pg_cron memanggil Edge Function
--  `weekly-reminder`. Fungsi itu menghitung minggu rundown aktif (1–4) dari
--  tanggal mulai siklus; saat terjadi pergantian minggu (atau antrean minggu
--  itu belum ada) ia menyiapkan antrean pesan WA untuk Ketua & Sekretaris
--  bagian sesuai agenda minggu tersebut. Pesan TIDAK dikirim otomatis:
--  admin meninjau dan mengirimnya satu per satu dari Panel Admin.
--
--  Prasyarat (sekali saja, lihat README → "Secret Vault"):
--    select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--    select vault.create_secret('<string acak panjang>', 'cron_secret');
--  dan secret Edge Function CRON_SECRET bernilai sama.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Bungkus pemanggilan agar mudah diuji manual: select public.trigger_weekly_reminder();
create or replace function public.trigger_weekly_reminder()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
  v_req    bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'Secret Vault project_url / cron_secret belum diatur; pengingat dilewati';
    return null;
  end if;

  select net.http_post(
    url                  := rtrim(v_url, '/') || '/functions/v1/weekly-reminder',
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || v_secret),
    body                 := jsonb_build_object('source', 'pg_cron', 'at', now()),
    timeout_milliseconds := 15000
  ) into v_req;
  return v_req;
end;
$$;

revoke all on function public.trigger_weekly_reminder() from public, anon, authenticated;

-- Jadwal harian; fungsi sendiri yang memutuskan apakah ini hari pergantian minggu.
select cron.unschedule(jobid) from cron.job where jobname = 'kmi-weekly-reminder';
select cron.schedule(
  'kmi-weekly-reminder',
  '5 23 * * *',
  $$ select public.trigger_weekly_reminder(); $$
);
