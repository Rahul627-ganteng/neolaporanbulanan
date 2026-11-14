-- =====================================================================
--  Migrasi 11 — Kode awal bersama, login pertama bagian, kode tercatat admin
--   1. Kode awal bersama (portal_settings): satu kode untuk semua bagian
--      yang belum membuat kode sendiri. Hanya berlaku untuk MASUK akun
--      bagian, dan sesi dari kode bersama wajib menyelesaikan login pertama
--      (buat kode sendiri) sebelum bisa memakai fitur lain.
--   2. Login pertama: bagian melengkapi nama & nomor WA Ketua/Sekretaris
--      (departments.profil_at) dan membuat kode sendiri (kode_pribadi_at).
--   3. Kode tiap bagian tercatat untuk admin (department_codes), baik dari
--      admin maupun yang dibuat bagian. Bagian diberi tahu hal ini di layar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Skema
-- ---------------------------------------------------------------------
alter table public.departments
  add column if not exists profil_at       timestamptz,  -- bagian melengkapi kontak (login pertama)
  add column if not exists kode_pribadi_at timestamptz;  -- bagian membuat kode sendiri
grant select (profil_at, kode_pribadi_at) on public.departments to authenticated;

create table if not exists public.portal_settings (
  id             boolean primary key default true check (id),
  kode_awal      text,
  kode_awal_hash text,
  updated_at     timestamptz not null default now()
);
insert into public.portal_settings (id) values (true) on conflict (id) do nothing;
alter table public.portal_settings enable row level security;
revoke all on public.portal_settings from public, anon, authenticated;
grant select on public.portal_settings to authenticated;
drop policy if exists "admin baca pengaturan" on public.portal_settings;
create policy "admin baca pengaturan" on public.portal_settings
  for select to authenticated using ((select public.is_admin()));

create table if not exists public.department_codes (
  department_id uuid primary key references public.departments (id) on delete cascade,
  kode          text not null,
  sumber        text not null check (sumber in ('admin', 'bagian')),
  updated_at    timestamptz not null default now()
);
alter table public.department_codes enable row level security;
revoke all on public.department_codes from public, anon, authenticated;
grant select on public.department_codes to authenticated;
drop policy if exists "admin baca kode bagian" on public.department_codes;
create policy "admin baca kode bagian" on public.department_codes
  for select to authenticated using ((select public.is_admin()));

alter table public.department_sessions
  add column if not exists perlu_setup boolean not null default false;

-- ---------------------------------------------------------------------
-- 2. Pembantu internal
-- ---------------------------------------------------------------------
create or replace function public.normalize_wa(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when d = '' then null
           when d like '62%' then d
           when d like '0%' then '62' || substr(d, 2)
           when d like '8%' then '62' || d
           else d
         end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- Token → bagian. p_allow_setup: sesi kode bersama yang belum menyelesaikan login pertama.
create or replace function public.department_session(p_token text, p_allow_setup boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dept uuid;
begin
  if p_token is null or length(p_token) < 40 then
    return null;
  end if;
  update public.department_sessions s
     set last_used_at = now()
    from public.departments d
   where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and s.expires_at > now()
     and d.id = s.department_id
     and d.is_active
     and (p_allow_setup or not s.perlu_setup)
  returning s.department_id into v_dept;
  return v_dept;
end;
$$;
revoke all on function public.department_session(text, boolean) from public, anon, authenticated;

create or replace function public.department_from_token(p_token text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.department_session(p_token, false);
$$;
revoke all on function public.department_from_token(text) from public, anon, authenticated;

create or replace function public.record_department_code(p_department_id uuid, p_code text, p_sumber text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_codes (department_id, kode, sumber, updated_at)
  values (p_department_id, p_code, p_sumber, now())
  on conflict (department_id) do update
    set kode = excluded.kode, sumber = excluded.sumber, updated_at = now();
$$;
revoke all on function public.record_department_code(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Masuk akun bagian: kode bagian sendiri, atau kode awal bersama
-- ---------------------------------------------------------------------
create or replace function public.department_login(p_department_id uuid, p_password text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dept   public.departments;
  v_pw     text := upper(btrim(coalesce(p_password, '')));
  v_fail   int;
  v_own    boolean := false;
  v_shared boolean := false;
  v_hash   text;
  v_token  text;
  v_exp    timestamptz := now() + interval '30 days';
begin
  select * into v_dept from public.departments where id = p_department_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Bagian tidak ditemukan.');
  end if;
  select count(*) into v_fail from public.department_login_failures
   where department_id = p_department_id and at > now() - interval '15 minutes';
  if v_fail >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak percobaan kode yang salah. Coba lagi 15 menit lagi.');
  end if;

  v_own := v_dept.access_code_hash is not null and extensions.crypt(v_pw, v_dept.access_code_hash) = v_dept.access_code_hash;
  if not v_own and v_dept.kode_pribadi_at is null then
    select kode_awal_hash into v_hash from public.portal_settings where id;
    v_shared := v_hash is not null and extensions.crypt(v_pw, v_hash) = v_hash;
  end if;
  if not (v_own or v_shared) then
    insert into public.department_login_failures (department_id) values (p_department_id);
    return jsonb_build_object('ok', false, 'error',
      case when v_dept.kode_pribadi_at is not null
           then 'Kode salah. Bagian ini sudah membuat kode sendiri; bila lupa, minta admin mengatur ulang.'
           else 'Kode salah.' end);
  end if;

  delete from public.department_login_failures where department_id = p_department_id;
  delete from public.department_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.department_sessions (token_hash, department_id, expires_at, user_agent, perlu_setup)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_department_id, v_exp, left(p_user_agent, 200), v_shared);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_exp,
    'kode_bersama', v_shared,
    'perlu_setup', v_shared or v_dept.profil_at is null,
    'department', jsonb_build_object('id', v_dept.id, 'no', v_dept.no, 'nama', v_dept.nama)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Login pertama / ubah kontak bagian (+ kode baru)
-- ---------------------------------------------------------------------
create or replace function public.department_setup(p_token text, p_profile jsonb, p_new_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dept   uuid := public.department_session(p_token, true);
  v_thash  text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_setup  boolean;
  v_kn     text := nullif(btrim(coalesce(p_profile ->> 'ketua_nama', '')), '');
  v_sn     text := nullif(btrim(coalesce(p_profile ->> 'sekretaris_nama', '')), '');
  v_pn     text := nullif(btrim(coalesce(p_profile ->> 'pembimbing_nama', '')), '');
  v_kw     text := public.normalize_wa(p_profile ->> 'ketua_wa');
  v_sw     text := public.normalize_wa(p_profile ->> 'sekretaris_wa');
  v_new    text := upper(btrim(coalesce(p_new_code, '')));
  v_shared text;
begin
  if v_dept is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi bagian berakhir. Silakan masuk lagi.');
  end if;
  select perlu_setup into v_setup from public.department_sessions where token_hash = v_thash;

  if v_kn is null and v_sn is null then
    return jsonb_build_object('ok', false, 'error', 'Isi nama Ketua atau Sekretaris Bagian.');
  end if;
  if v_kw is not null and v_kw !~ '^62\d{8,13}$' then
    return jsonb_build_object('ok', false, 'error', 'Nomor WA Ketua tidak valid. Gunakan format 08xx atau 628xx.');
  end if;
  if v_sw is not null and v_sw !~ '^62\d{8,13}$' then
    return jsonb_build_object('ok', false, 'error', 'Nomor WA Sekretaris tidak valid. Gunakan format 08xx atau 628xx.');
  end if;
  if v_kw is null and v_sw is null then
    return jsonb_build_object('ok', false, 'error', 'Isi minimal satu nomor WA yang bisa dihubungi.');
  end if;
  if v_setup and v_new = '' then
    return jsonb_build_object('ok', false, 'error', 'Buat kode akses baru untuk bagian Anda (minimal 6 karakter).');
  end if;
  if v_new <> '' then
    if length(v_new) < 6 then
      return jsonb_build_object('ok', false, 'error', 'Kode akses minimal 6 karakter.');
    end if;
    select kode_awal_hash into v_shared from public.portal_settings where id;
    if v_shared is not null and extensions.crypt(v_new, v_shared) = v_shared then
      return jsonb_build_object('ok', false, 'error', 'Kode baru tidak boleh sama dengan kode awal bersama.');
    end if;
  end if;

  update public.departments set
    ketua_nama      = coalesce(v_kn, ketua_nama),
    sekretaris_nama = coalesce(v_sn, sekretaris_nama),
    pembimbing_nama = coalesce(v_pn, pembimbing_nama),
    ketua_wa        = coalesce(v_kw, ketua_wa),
    sekretaris_wa   = coalesce(v_sw, sekretaris_wa),
    profil_at       = now()
  where id = v_dept;

  if v_new <> '' then
    perform set_config('kmi.keep_session', v_thash, true);
    update public.departments
       set access_code_hash = extensions.crypt(v_new, extensions.gen_salt('bf')),
           kode_pribadi_at  = now()
     where id = v_dept;
    perform public.record_department_code(v_dept, v_new, 'bagian');
  end if;
  update public.department_sessions set perlu_setup = false where token_hash = v_thash;

  return jsonb_build_object('ok', true, 'kode_diganti', v_new <> '');
end;
$$;

-- Ganti kode dari dasbor (min. 6 karakter, tercatat untuk admin).
create or replace function public.department_change_password(p_token text, p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dept   uuid := public.department_from_token(p_token);
  v_hash   text;
  v_shared text;
  v_new    text := upper(btrim(coalesce(p_new, '')));
begin
  if v_dept is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi bagian berakhir. Silakan masuk lagi.');
  end if;
  select access_code_hash into v_hash from public.departments where id = v_dept;
  if v_hash is null or extensions.crypt(upper(btrim(coalesce(p_current, ''))), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'Kode lama salah.');
  end if;
  if length(v_new) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Kode baru minimal 6 karakter.');
  end if;
  if v_new = upper(btrim(p_current)) then
    return jsonb_build_object('ok', false, 'error', 'Kode baru harus berbeda dari kode lama.');
  end if;
  select kode_awal_hash into v_shared from public.portal_settings where id;
  if v_shared is not null and extensions.crypt(v_new, v_shared) = v_shared then
    return jsonb_build_object('ok', false, 'error', 'Kode baru tidak boleh sama dengan kode awal bersama.');
  end if;
  perform set_config('kmi.keep_session', encode(extensions.digest(p_token, 'sha256'), 'hex'), true);
  update public.departments
     set access_code_hash = extensions.crypt(v_new, extensions.gen_salt('bf')),
         kode_pribadi_at  = now()
   where id = v_dept;
  perform public.record_department_code(v_dept, v_new, 'bagian');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Admin: kode per bagian & kode awal bersama (tercatat)
-- ---------------------------------------------------------------------
create or replace function public.set_department_access_code(p_department_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengatur kode akses' using errcode = '42501';
  end if;
  if length(v_code) < 6 then
    raise exception 'Kode akses minimal 6 karakter';
  end if;
  update public.departments
     set access_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
         kode_pribadi_at  = null
   where id = p_department_id;
  perform public.record_department_code(p_department_id, v_code, 'admin');
end;
$$;

create or replace function public.generate_access_codes(p_only_missing boolean default true)
returns table (department_id uuid, no smallint, nama text, kode text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_dept     record;
  v_bytes    bytea;
  v_code     text;
  i          int;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat membuat kode akses' using errcode = '42501';
  end if;
  for v_dept in
    select d.id, d.no, d.nama from public.departments d
    where d.is_active and (not p_only_missing or d.access_code_hash is null)
    order by d.no
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
    end loop;
    update public.departments
       set access_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
           kode_pribadi_at  = null
     where id = v_dept.id;
    perform public.record_department_code(v_dept.id, v_code, 'admin');
    department_id := v_dept.id;
    no := v_dept.no;
    nama := v_dept.nama;
    kode := v_code;
    return next;
  end loop;
end;
$$;

create or replace function public.set_shared_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengatur kode awal bersama' using errcode = '42501';
  end if;
  if v_code <> '' and length(v_code) < 6 then
    raise exception 'Kode awal bersama minimal 6 karakter';
  end if;
  update public.portal_settings
     set kode_awal      = nullif(v_code, ''),
         kode_awal_hash = case when v_code = '' then null else extensions.crypt(v_code, extensions.gen_salt('bf')) end,
         updated_at     = now()
   where id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Konteks formulir & dasbor: termasuk kontak bagian sendiri
-- ---------------------------------------------------------------------
create or replace function public.form_context(p_department_id uuid default null, p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin boolean := public.is_admin();
  v_token boolean := false;
  v_ok    boolean;
  v_hash  text;
begin
  v_ok := v_admin;
  if not v_ok and p_department_id is not null then
    if public.department_session(p_secret, true) = p_department_id then
      v_ok := true;
      v_token := true;
    else
      select access_code_hash into v_hash from public.departments where id = p_department_id and is_active;
      v_ok := v_hash is not null and extensions.crypt(upper(btrim(coalesce(p_secret, ''))), v_hash) = v_hash;
    end if;
  end if;
  if not v_ok then
    raise exception 'Kode akses bagian tidak sesuai' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'department', (
      select jsonb_build_object('id', d.id, 'ketua_nama', d.ketua_nama, 'sekretaris_nama', d.sekretaris_nama, 'pembimbing_nama', d.pembimbing_nama)
             || case when v_admin or v_token
                     then jsonb_build_object('ketua_wa', d.ketua_wa, 'sekretaris_wa', d.sekretaris_wa, 'profil_at', d.profil_at, 'kode_pribadi_at', d.kode_pribadi_at)
                     else '{}'::jsonb end
      from public.departments d where d.id = p_department_id
    ),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object('nama', t.nama, 'tahun', t.tahun, 'kelompok', t.kelompok) order by t.urutan, t.nama)
      from public.teachers t where t.is_active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.department_dashboard(p_token text default null, p_department_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept uuid := public.department_from_token(p_token);
begin
  if v_dept is null then
    if p_department_id is not null and public.is_admin() then
      v_dept := p_department_id;
    else
      raise exception 'Sesi bagian berakhir. Silakan masuk lagi.' using errcode = '28000';
    end if;
  end if;

  return jsonb_build_object(
    'department', (
      select jsonb_build_object(
        'id', d.id, 'no', d.no, 'nama', d.nama, 'is_active', d.is_active,
        'sekretaris_nama', d.sekretaris_nama, 'ketua_nama', d.ketua_nama, 'pembimbing_nama', d.pembimbing_nama,
        'ketua_wa', d.ketua_wa, 'sekretaris_wa', d.sekretaris_wa,
        'profil_at', d.profil_at, 'kode_pribadi_at', d.kode_pribadi_at)
      from public.departments d where d.id = v_dept
    ),
    'reports', coalesce((
      select jsonb_agg(
               (to_jsonb(r) - 'created_at')
               || jsonb_build_object('programs', coalesce((
                    select jsonb_agg(jsonb_build_object('id', p.id, 'urutan', p.urutan, 'judul', p.judul, 'kategori', p.kategori, 'target', p.target)
                                     order by p.urutan)
                    from public.priority_programs p where p.report_id = r.id), '[]'::jsonb))
               order by c.start_date desc)
      from public.monthly_reports r
      join public.monthly_cycles c on c.id = r.cycle_id
      where r.department_id = v_dept
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Hak eksekusi
-- ---------------------------------------------------------------------
revoke all on function public.department_setup(text, jsonb, text) from public;
revoke all on function public.set_shared_code(text) from public, anon;
grant execute on function public.department_setup(text, jsonb, text) to anon, authenticated;
grant execute on function public.set_shared_code(text) to authenticated;
