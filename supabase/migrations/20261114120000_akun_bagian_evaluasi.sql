-- =====================================================================
--  Migrasi 9 — Akun bagian, dasbor bagian & evaluasi
--   1. Kolom evaluasi program bulan lalu + waktu catatan admin.
--   2. Sesi bagian: masuk dengan pilih bagian + sandi (sandi awal = kode
--      akses bagian). Token acak 30 hari, hanya hash SHA-256 yang disimpan.
--      Tidak memakai Supabase Auth: tanpa email, tanpa batas login Auth.
--   3. RPC dasbor bagian, ganti sandi, keluar, program bulan lalu,
--      catatan admin; submit_report menerima token sesi & evaluasi.
--  Satu rahasia per bagian: departments.access_code_hash. Kode akses untuk
--  formulir tanpa masuk = sandi akun bagian.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom baru laporan
-- ---------------------------------------------------------------------
alter table public.monthly_reports
  add column if not exists evaluasi_program jsonb not null default '[]'::jsonb,
  add column if not exists catatan_admin_at timestamptz;

alter table public.monthly_reports drop constraint if exists monthly_reports_evaluasi_array;
alter table public.monthly_reports
  add constraint monthly_reports_evaluasi_array check (jsonb_typeof(evaluasi_program) = 'array');

-- ---------------------------------------------------------------------
-- 2. Sesi bagian & percobaan masuk yang gagal (hanya lewat fungsi)
-- ---------------------------------------------------------------------
create table if not exists public.department_sessions (
  token_hash    text primary key,
  department_id uuid not null references public.departments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  user_agent    text
);
create index if not exists department_sessions_department_idx on public.department_sessions (department_id);
alter table public.department_sessions enable row level security;
revoke all on public.department_sessions from public, anon, authenticated;

create table if not exists public.department_login_failures (
  id            bigint generated always as identity primary key,
  department_id uuid not null references public.departments (id) on delete cascade,
  at            timestamptz not null default now()
);
create index if not exists department_login_failures_idx on public.department_login_failures (department_id, at);
alter table public.department_login_failures enable row level security;
revoke all on public.department_login_failures from public, anon, authenticated;

-- Token sesi → bagian (internal; dipanggil fungsi SECURITY DEFINER lain).
create or replace function public.department_from_token(p_token text)
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
  returning s.department_id into v_dept;
  return v_dept;
end;
$$;
revoke all on function public.department_from_token(text) from public, anon, authenticated;

-- Sandi bagian berganti (oleh admin atau bagian) → sesi lain dicabut.
-- department_change_password menandai sesi yang sedang dipakai agar tetap hidup.
create or replace function public.revoke_department_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.access_code_hash is distinct from old.access_code_hash then
    delete from public.department_sessions
     where department_id = new.id
       and token_hash <> coalesce(nullif(current_setting('kmi.keep_session', true), ''), '-');
  end if;
  return new;
end;
$$;
revoke all on function public.revoke_department_sessions() from public, anon, authenticated;

drop trigger if exists departments_revoke_sessions on public.departments;
create trigger departments_revoke_sessions
  after update of access_code_hash on public.departments
  for each row execute function public.revoke_department_sessions();

-- ---------------------------------------------------------------------
-- 3a. Masuk / keluar / ganti sandi bagian
--     Hasil berupa jsonb {ok, error?}: percobaan gagal harus tercatat,
--     jadi fungsi tidak memakai RAISE (RAISE membatalkan pencatatan).
-- ---------------------------------------------------------------------
create or replace function public.department_login(p_department_id uuid, p_password text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dept  public.departments;
  v_fail  int;
  v_token text;
  v_exp   timestamptz := now() + interval '30 days';
begin
  select * into v_dept from public.departments where id = p_department_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Bagian tidak ditemukan.');
  end if;
  select count(*) into v_fail from public.department_login_failures
   where department_id = p_department_id and at > now() - interval '15 minutes';
  if v_fail >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak percobaan sandi yang salah. Coba lagi 15 menit lagi.');
  end if;
  if v_dept.access_code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Bagian ini belum punya kode akses. Hubungi admin Sektor Guru KMI.');
  end if;
  if extensions.crypt(upper(btrim(coalesce(p_password, ''))), v_dept.access_code_hash) <> v_dept.access_code_hash then
    insert into public.department_login_failures (department_id) values (p_department_id);
    return jsonb_build_object('ok', false, 'error', 'Sandi bagian salah.');
  end if;

  delete from public.department_login_failures where department_id = p_department_id;
  delete from public.department_sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.department_sessions (token_hash, department_id, expires_at, user_agent)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_department_id, v_exp, left(p_user_agent, 200));

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_exp,
    'department', jsonb_build_object('id', v_dept.id, 'no', v_dept.no, 'nama', v_dept.nama)
  );
end;
$$;

create or replace function public.department_logout(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.department_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.department_change_password(p_token text, p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dept uuid := public.department_from_token(p_token);
  v_hash text;
  v_new  text := upper(btrim(coalesce(p_new, '')));
begin
  if v_dept is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi bagian berakhir. Silakan masuk lagi.');
  end if;
  select access_code_hash into v_hash from public.departments where id = v_dept;
  if v_hash is null or extensions.crypt(upper(btrim(coalesce(p_current, ''))), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'Sandi lama salah.');
  end if;
  if length(v_new) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Sandi baru minimal 8 karakter.');
  end if;
  if v_new = upper(btrim(p_current)) then
    return jsonb_build_object('ok', false, 'error', 'Sandi baru harus berbeda dari sandi lama.');
  end if;
  perform set_config('kmi.keep_session', encode(extensions.digest(p_token, 'sha256'), 'hex'), true);
  update public.departments
     set access_code_hash = extensions.crypt(v_new, extensions.gen_salt('bf'))
   where id = v_dept;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 3b. Data dasbor bagian (bagian lewat token; admin lewat p_department_id)
-- ---------------------------------------------------------------------
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
        'sekretaris_nama', d.sekretaris_nama, 'ketua_nama', d.ketua_nama, 'pembimbing_nama', d.pembimbing_nama)
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
-- 3c. Program kerja bulan lalu untuk dievaluasi di formulir
--     (admin, sesi bagian, atau kode akses bagian yang benar)
-- ---------------------------------------------------------------------
create or replace function public.previous_programs(p_cycle_id uuid, p_department_id uuid, p_secret text default null)
returns table (urutan smallint, judul text, kategori public.program_category, target text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_start date;
  v_prev  uuid;
  v_hash  text;
begin
  if not public.is_admin() and public.department_from_token(p_secret) is distinct from p_department_id then
    select access_code_hash into v_hash from public.departments where id = p_department_id and is_active;
    if v_hash is null or extensions.crypt(upper(btrim(coalesce(p_secret, ''))), v_hash) <> v_hash then
      raise exception 'Kode akses bagian tidak sesuai' using errcode = '28000';
    end if;
  end if;
  select start_date into v_start from public.monthly_cycles where id = p_cycle_id;
  select c.id into v_prev from public.monthly_cycles c
   where c.start_date < v_start order by c.start_date desc limit 1;
  return query
    select p.urutan, p.judul, p.kategori, p.target
      from public.priority_programs p
      join public.monthly_reports r on r.id = p.report_id
     where r.cycle_id = v_prev and r.department_id = p_department_id and r.submitted_at is not null
     order by p.urutan;
end;
$$;

-- ---------------------------------------------------------------------
-- 3d. Catatan / tanggapan admin untuk satu laporan
-- ---------------------------------------------------------------------
create or replace function public.set_report_feedback(p_report_id uuid, p_catatan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menulis catatan laporan' using errcode = '42501';
  end if;
  update public.monthly_reports
     set catatan_admin = v_text,
         catatan_admin_at = case when v_text is null then null else now() end
   where id = p_report_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3e. submit_report: sesi bagian (token) setara kode akses; evaluasi program
-- ---------------------------------------------------------------------
create or replace function public.submit_report(
  p_cycle_id      uuid,
  p_department_id uuid,
  p_access_code   text,
  p_payload       jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cycle   public.monthly_cycles;
  v_dept    public.departments;
  v_report  uuid;
  v_prog    jsonb;
  v_eval    jsonb;
  v_i       int := 0;
begin
  select * into v_cycle from public.monthly_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Periode laporan tidak ditemukan';
  end if;
  -- Sekretaris boleh mengirim untuk siklus aktif dan satu siklus sebelumnya.
  -- Lewat tenggat tanggal 5 tetap diterima dan tercatat terlambat.
  -- Siklus yang lebih lama hanya dapat diinput admin (susulan).
  if not public.is_admin()
     and v_cycle.status <> 'aktif'
     and v_cycle.start_date < (select max(c.start_date) from public.monthly_cycles c where c.status = 'arsip') then
    raise exception 'Laporan bulan % % H sudah ditutup. Hubungi admin Sektor Guru KMI untuk input susulan.',
      (array['Muharram','Safar','Rabiul Awal','Rabiul Akhir','Jumadil Awal','Jumadil Akhir','Rajab','Sya''ban',
             'Ramadhan','Syawal','Dzulqa''dah','Dzulhijjah'])[v_cycle.hijri_month],
      v_cycle.hijri_year;
  end if;

  select * into v_dept from public.departments where id = p_department_id and is_active;
  if not found then
    raise exception 'Bagian tidak ditemukan';
  end if;

  if not public.is_admin() and public.department_from_token(p_access_code) is distinct from p_department_id then
    if length(coalesce(p_access_code, '')) >= 40 then
      raise exception 'Sesi bagian berakhir. Silakan masuk lagi.' using errcode = '28000';
    end if;
    if v_dept.access_code_hash is null
       or extensions.crypt(upper(btrim(coalesce(p_access_code, ''))), v_dept.access_code_hash) <> v_dept.access_code_hash then
      raise exception 'Kode akses bagian tidak sesuai' using errcode = '28000';
    end if;
  end if;

  if coalesce((p_payload ->> 'pernyataan_inovatif')::boolean, false) is not true then
    raise exception 'Pernyataan hasil usaha inovatif (bukan rutinitas) wajib dicentang';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'hasil_usaha', '[]')) = 0 then
    raise exception 'Hasil usaha wajib diisi';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'programs', '[]')) = 0 then
    raise exception 'Program kerja satu bulan ke depan wajib diisi';
  end if;

  -- Evaluasi program bulan lalu (opsional): hanya butir dengan status sah.
  v_eval := coalesce(p_payload -> 'evaluasi_program', '[]'::jsonb);
  if jsonb_typeof(v_eval) <> 'array' then
    v_eval := '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'judul',    left(btrim(e ->> 'judul'), 300),
           'kategori', case when e ->> 'kategori' in ('unggulan', 'inovasi', 'tindak_lanjut', 'reguler') then e ->> 'kategori' else 'reguler' end,
           'target',   nullif(left(btrim(coalesce(e ->> 'target', '')), 300), ''),
           'status',   e ->> 'status',
           'catatan',  nullif(left(btrim(coalesce(e ->> 'catatan', '')), 1000), ''))), '[]'::jsonb)
    into v_eval
    from jsonb_array_elements(v_eval) e
   where jsonb_typeof(e) = 'object'
     and coalesce(btrim(e ->> 'judul'), '') <> ''
     and e ->> 'status' in ('terlaksana', 'sebagian', 'belum');

  insert into public.monthly_reports as r
    (cycle_id, department_id, status, sekretaris_nama, ketua_nama, pembimbing_nama,
     hasil_usaha, kendala, solusi, evaluasi_program, pernyataan_inovatif, submitted_at, pembimbing_approved_at)
  values
    (p_cycle_id, p_department_id, 'terkirim',
     p_payload ->> 'sekretaris_nama', p_payload ->> 'ketua_nama', p_payload ->> 'pembimbing_nama',
     array(select jsonb_array_elements_text(p_payload -> 'hasil_usaha')),
     coalesce(p_payload -> 'kendala', '[]'::jsonb),
     array(select jsonb_array_elements_text(coalesce(p_payload -> 'solusi', '[]'::jsonb))),
     v_eval, true, now(), now())
  on conflict (cycle_id, department_id) do update set
     status                 = 'terkirim',
     sekretaris_nama        = excluded.sekretaris_nama,
     ketua_nama             = excluded.ketua_nama,
     pembimbing_nama        = excluded.pembimbing_nama,
     hasil_usaha            = excluded.hasil_usaha,
     kendala                = excluded.kendala,
     solusi                 = excluded.solusi,
     evaluasi_program       = excluded.evaluasi_program,
     pernyataan_inovatif    = true,
     submitted_at           = coalesce(r.submitted_at, now()),          -- waktu kirim pertama dipertahankan
     pembimbing_approved_at = coalesce(r.pembimbing_approved_at, now()) -- softfile = sudah disetujui pembimbing
  returning id into v_report;

  delete from public.priority_programs where report_id = v_report;
  for v_prog in select * from jsonb_array_elements(p_payload -> 'programs') loop
    v_i := v_i + 1;
    insert into public.priority_programs (report_id, urutan, judul, kategori, target)
    values (v_report, v_i, trim(v_prog ->> 'judul'),
            coalesce(nullif(v_prog ->> 'kategori', ''), 'reguler')::public.program_category,
            nullif(trim(coalesce(v_prog ->> 'target', '')), ''));
  end loop;

  -- Lengkapi data pejabat bagian bila masih kosong
  update public.departments set
    sekretaris_nama = coalesce(sekretaris_nama, nullif(p_payload ->> 'sekretaris_nama', '')),
    ketua_nama      = coalesce(ketua_nama,      nullif(p_payload ->> 'ketua_nama', '')),
    pembimbing_nama = coalesce(pembimbing_nama, nullif(p_payload ->> 'pembimbing_nama', ''))
  where id = p_department_id;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------
-- Hak eksekusi
-- ---------------------------------------------------------------------
revoke all on function public.department_login(uuid, text, text) from public;
revoke all on function public.department_logout(text) from public;
revoke all on function public.department_change_password(text, text, text) from public;
revoke all on function public.department_dashboard(text, uuid) from public;
revoke all on function public.previous_programs(uuid, uuid, text) from public;
revoke all on function public.set_report_feedback(uuid, text) from public, anon;

grant execute on function public.department_login(uuid, text, text) to anon, authenticated;
grant execute on function public.department_logout(text) to anon, authenticated;
grant execute on function public.department_change_password(text, text, text) to anon, authenticated;
grant execute on function public.department_dashboard(text, uuid) to anon, authenticated;
grant execute on function public.previous_programs(uuid, uuid, text) to anon, authenticated;
grant execute on function public.set_report_feedback(uuid, text) to authenticated;
