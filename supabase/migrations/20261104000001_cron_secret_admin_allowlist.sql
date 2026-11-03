-- =====================================================================
--  Migrasi 4 — otomatisasi penuh tanpa langkah manual:
--   1. Edge Function memverifikasi secret pg_cron langsung ke Vault
--      (tidak wajib lagi menyetel CRON_SECRET di Edge Function).
--   2. ensure_cron_setup(): membuat secret Vault project_url & cron_secret
--      acak bila belum ada (dipanggil sekali; idempoten).
--   3. Daftar email admin: akun Supabase Auth dengan email terdaftar
--      otomatis menjadi admin portal, baik akun lama maupun baru.
-- =====================================================================

-- 1. Verifikasi secret cron (hanya service_role / Edge Function)
create or replace function public.check_cron_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_token, '') <> ''
     and exists (
       select 1 from vault.decrypted_secrets
       where name = 'cron_secret' and decrypted_secret = p_token
     );
$$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- 2. Siapkan secret Vault untuk pg_cron
create or replace function public.ensure_cron_setup(p_project_url text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if p_project_url !~ '^https://[a-z0-9]+\.supabase\.co/?$' then
    raise exception 'URL proyek tidak valid: %', p_project_url;
  end if;
  select id into v_id from vault.secrets where name = 'project_url';
  if v_id is null then
    perform vault.create_secret(rtrim(p_project_url, '/'), 'project_url');
  else
    perform vault.update_secret(v_id, rtrim(p_project_url, '/'));
  end if;
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret');
  end if;
end;
$$;
revoke all on function public.ensure_cron_setup(text) from public, anon, authenticated;

-- 3. Daftar email admin
create table if not exists public.app_admin_emails (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  catatan    text,
  created_at timestamptz not null default now()
);
alter table public.app_admin_emails enable row level security;
grant select, insert, update, delete on public.app_admin_emails to authenticated, service_role;
drop policy if exists "admin kelola email admin" on public.app_admin_emails;
create policy "admin kelola email admin" on public.app_admin_emails
  for all using (public.is_admin()) with check (public.is_admin());

-- Akun baru / email berubah → jadi admin bila email terdaftar
create or replace function public.grant_admin_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and exists (select 1 from public.app_admin_emails where email = lower(new.email)) then
    insert into public.app_admins (user_id, nama)
    values (new.id, split_part(new.email, '@', 1))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.grant_admin_from_allowlist() from public, anon, authenticated;

drop trigger if exists on_auth_user_admin_allowlist on auth.users;
create trigger on_auth_user_admin_allowlist
  after insert or update of email on auth.users
  for each row execute function public.grant_admin_from_allowlist();

-- Email ditambahkan ke daftar → akun yang sudah ada langsung jadi admin
create or replace function public.grant_admin_for_existing_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_admins (user_id, nama)
  select u.id, split_part(u.email, '@', 1)
  from auth.users u
  where lower(u.email) = new.email
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.grant_admin_for_existing_user() from public, anon, authenticated;

drop trigger if exists on_admin_email_added on public.app_admin_emails;
create trigger on_admin_email_added
  after insert on public.app_admin_emails
  for each row execute function public.grant_admin_for_existing_user();
