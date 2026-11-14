-- =====================================================================
--  Migrasi 10 — Direktori guru & ingatan pejabat bagian
--   1. Tabel teachers: daftar guru KMI (tanpa Guru Senior) untuk mencari
--      nama Ketua & Sekretaris Bagian di formulir.
--      DATA TIDAK DISIMPAN DI REPO (repo publik). Admin memuatnya dari
--      Excel absen guru lewat Data Bagian → Daftar guru (replace_teachers).
--   2. form_context: pejabat bagian yang tersimpan + daftar guru; hanya
--      untuk admin, sesi akun bagian, atau kode akses bagian yang benar.
--   3. Pejabat bagian diingat: setiap laporan terkirim menyimpan nama
--      Ketua, Sekretaris, dan Pembimbing terbaru ke data bagian.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Direktori guru
-- ---------------------------------------------------------------------
create table if not exists public.teachers (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null check (length(btrim(nama)) > 0),
  kelompok   text,              -- mis. "Guru Tahun Kedua", "Guru Asyab"
  tahun      text,              -- tahun pengabdian (angka Romawi: I, II, …)
  urutan     int not null default 0,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists teachers_nama_key on public.teachers (lower(nama));
alter table public.teachers enable row level security;
revoke all on public.teachers from public, anon, authenticated;
grant select on public.teachers to authenticated;
drop policy if exists "admin baca guru" on public.teachers;
create policy "admin baca guru" on public.teachers
  for select to authenticated using ((select public.is_admin()));

-- Ganti daftar guru aktif dengan isi Excel terbaru (admin).
-- Nama yang tidak ada lagi dinonaktifkan (tidak dihapus); Guru Senior dibuang.
create or replace function public.replace_teachers(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_new   int;
  v_off   int;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat memperbarui daftar guru' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Daftar guru kosong';
  end if;

  with src as (
    select btrim(regexp_replace(coalesce(e ->> 'nama', ''), '\s+', ' ', 'g')) as nama,
           coalesce(e ->> 'kelompok', '') as kelompok,
           coalesce(e ->> 'tahun', '') as tahun
      from jsonb_array_elements(p_rows) e
  )
  update public.teachers t
     set is_active = false, updated_at = now()
   where t.is_active
     and lower(t.nama) not in (
       select lower(nama) from src
        where nama <> '' and kelompok !~* 'senior' and tahun !~* 'senior');
  get diagnostics v_off = row_count;

  with src as (
    select distinct on (lower(nama)) nama, kelompok, tahun, ord
      from (
        select btrim(regexp_replace(coalesce(e ->> 'nama', ''), '\s+', ' ', 'g')) as nama,
               nullif(btrim(coalesce(e ->> 'kelompok', '')), '') as kelompok,
               nullif(upper(btrim(coalesce(e ->> 'tahun', ''))), '') as tahun,
               x.ord
          from jsonb_array_elements(p_rows) with ordinality as x(e, ord)
      ) s
     where nama <> '' and coalesce(kelompok, '') !~* 'senior' and coalesce(tahun, '') !~* 'senior'
     order by lower(nama), ord
  ), up as (
    insert into public.teachers as t (nama, kelompok, tahun, urutan, is_active, updated_at)
    select nama, kelompok, tahun, ord::int, true, now() from src
    on conflict (lower(nama)) do update
      set nama = excluded.nama, kelompok = excluded.kelompok, tahun = excluded.tahun,
          urutan = excluded.urutan, is_active = true, updated_at = now()
    returning (xmax = 0) as baru
  )
  select count(*), count(*) filter (where baru) into v_total, v_new from up;

  return jsonb_build_object('aktif', v_total, 'baru', v_new, 'dinonaktifkan', v_off);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Konteks formulir: pejabat tersimpan + daftar guru
-- ---------------------------------------------------------------------
create or replace function public.form_context(p_department_id uuid default null, p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok   boolean := public.is_admin();
  v_hash text;
begin
  if not v_ok and p_department_id is not null then
    if public.department_from_token(p_secret) = p_department_id then
      v_ok := true;
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
      from public.departments d where d.id = p_department_id
    ),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object('nama', t.nama, 'tahun', t.tahun, 'kelompok', t.kelompok) order by t.urutan, t.nama)
      from public.teachers t where t.is_active
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Ingat pejabat bagian dari laporan terkirim terbaru
-- ---------------------------------------------------------------------
create or replace function public.remember_department_officials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.submitted_at is null then
    return new;
  end if;
  update public.departments d set
    ketua_nama      = coalesce(nullif(btrim(new.ketua_nama), ''), d.ketua_nama),
    sekretaris_nama = coalesce(nullif(btrim(new.sekretaris_nama), ''), d.sekretaris_nama),
    pembimbing_nama = coalesce(nullif(btrim(new.pembimbing_nama), ''), d.pembimbing_nama)
  where d.id = new.department_id
    and (d.ketua_nama, d.sekretaris_nama, d.pembimbing_nama) is distinct from
        (coalesce(nullif(btrim(new.ketua_nama), ''), d.ketua_nama),
         coalesce(nullif(btrim(new.sekretaris_nama), ''), d.sekretaris_nama),
         coalesce(nullif(btrim(new.pembimbing_nama), ''), d.pembimbing_nama));
  return new;
end;
$$;
revoke all on function public.remember_department_officials() from public, anon, authenticated;

drop trigger if exists monthly_reports_remember_officials on public.monthly_reports;
create trigger monthly_reports_remember_officials
  after insert or update of ketua_nama, sekretaris_nama, pembimbing_nama, submitted_at on public.monthly_reports
  for each row execute function public.remember_department_officials();

-- ---------------------------------------------------------------------
-- Hak eksekusi
-- ---------------------------------------------------------------------
revoke all on function public.replace_teachers(jsonb) from public, anon;
revoke all on function public.form_context(uuid, text) from public;
grant execute on function public.replace_teachers(jsonb) to authenticated;
grant execute on function public.form_context(uuid, text) to anon, authenticated;
