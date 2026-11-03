-- =====================================================================
--  Sistem Informasi & Portal Pelaporan Bulanan Sektor Guru KMI
--  Pondok Modern Darussalam Gontor Kampus 3 (Darul Ma'rifat)
--  Migrasi 1/3 — skema relasional, RLS, dan RPC
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Tipe enumerasi
-- ---------------------------------------------------------------------
create type public.cycle_status        as enum ('aktif', 'arsip');
create type public.report_status       as enum ('belum_lapor', 'terkirim');
create type public.program_category    as enum ('unggulan', 'inovasi', 'tindak_lanjut', 'reguler');
create type public.contact_role        as enum ('ketua', 'sekretaris');
create type public.notification_status as enum ('pending', 'sent', 'skipped');

-- ---------------------------------------------------------------------
--  Admin portal (akun Supabase Auth yang boleh mengelola semua data)
-- ---------------------------------------------------------------------
create table public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nama       text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
--  Tahun ajaran (lintas periode, tanpa batas)
--  Contoh: 2026-2027 / 1447-1448 → 2027-2028 / 1448-1449 → dst.
-- ---------------------------------------------------------------------
create table public.academic_periods (
  id            uuid primary key default gen_random_uuid(),
  label_masehi  text not null unique check (label_masehi ~ '^\d{4}-\d{4}$'),
  label_hijri   text not null unique check (label_hijri ~ '^\d{4}-\d{4}$'),
  is_active     boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index academic_periods_one_active on public.academic_periods (is_active) where is_active;

-- ---------------------------------------------------------------------
--  Siklus bulanan (satu bulan Hijriah = satu siklus pelaporan)
--  deadline_date = tanggal 5 bulan Hijriah berikutnya (dalam Masehi)
-- ---------------------------------------------------------------------
create table public.monthly_cycles (
  id             uuid primary key default gen_random_uuid(),
  period_id      uuid not null references public.academic_periods (id) on delete restrict,
  hijri_month    smallint not null check (hijri_month between 1 and 12),
  hijri_year     smallint not null check (hijri_year between 1400 and 1700),
  masehi_label   text not null check (masehi_label ~ '^\d{4}(/\d{4})?$'),
  start_date     date not null,
  end_date       date not null,
  deadline_date  date not null,
  status         public.cycle_status not null default 'aktif',
  active_week    smallint check (active_week between 1 and 4), -- NULL = otomatis dari tanggal
  opened_by      uuid references auth.users (id) on delete set null,
  opened_at      timestamptz not null default now(),
  archived_at    timestamptz,
  unique (hijri_year, hijri_month),
  check (end_date >= start_date),
  check (deadline_date > end_date)
);
create unique index monthly_cycles_one_active on public.monthly_cycles (status) where status = 'aktif';
create index monthly_cycles_period_idx on public.monthly_cycles (period_id);

-- ---------------------------------------------------------------------
--  48 bagian Sektor Guru KMI (seed di migrasi 2)
-- ---------------------------------------------------------------------
create table public.departments (
  id               uuid primary key default gen_random_uuid(),
  no               smallint not null unique check (no > 0),
  nama             text not null unique,
  sekretaris_nama  text,
  sekretaris_wa    text check (sekretaris_wa is null or sekretaris_wa ~ '^62\d{8,13}$'),
  ketua_nama       text,
  ketua_wa         text check (ketua_wa is null or ketua_wa ~ '^62\d{8,13}$'),
  pembimbing_nama  text,
  access_code_hash text, -- kode akses input laporan, di-hash bcrypt
  has_access_code  boolean generated always as (access_code_hash is not null) stored,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Laporan bulanan: satu baris per bagian per siklus (dibuat saat periode dibuka)
-- ---------------------------------------------------------------------
create table public.monthly_reports (
  id                      uuid primary key default gen_random_uuid(),
  cycle_id                uuid not null references public.monthly_cycles (id) on delete cascade,
  department_id           uuid not null references public.departments (id) on delete restrict,
  status                  public.report_status not null default 'belum_lapor',
  sekretaris_nama         text,
  ketua_nama              text,
  pembimbing_nama         text,
  hasil_usaha             text[] not null default '{}',
  kendala                 jsonb  not null default '[]'::jsonb
                          check (jsonb_typeof(kendala) = 'array'),   -- [{teks, kategori}]
  solusi                  text[] not null default '{}',
  pernyataan_inovatif     boolean not null default false,
  submitted_at            timestamptz,  -- Minggu 4: softfile diinput
  rapat_bagian_at         timestamptz,  -- Minggu 3: perkumpulan bagian
  draft_senior_at         timestamptz,  -- Minggu 3: hardfile draf ke Pembimbing Guru Senior
  pembimbing_approved_at  timestamptz,  -- Minggu 4: verifikasi hardfile oleh Pembimbing Bagian
  wapeng_received_at      timestamptz,  -- Minggu 4: verifikasi hardfile Staf Sekretaris Wakil Pengasuh
  catatan_admin           text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (cycle_id, department_id)
);
create index monthly_reports_cycle_idx on public.monthly_reports (cycle_id, status);
create trigger monthly_reports_touch before update on public.monthly_reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Program Kerja Satu Bulan ke Depan + klasifikator program unggulan
-- ---------------------------------------------------------------------
create table public.priority_programs (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.monthly_reports (id) on delete cascade,
  urutan      smallint not null default 1,
  judul       text not null check (length(trim(judul)) > 0),
  kategori    public.program_category not null default 'reguler',
  target      text,
  created_at  timestamptz not null default now()
);
create index priority_programs_report_idx on public.priority_programs (report_id, urutan);
create index priority_programs_unggulan_idx on public.priority_programs (kategori) where kategori = 'unggulan';

-- ---------------------------------------------------------------------
--  Antrean pengingat WA (diisi pg_cron/Edge Function atau admin;
--  dikirim manual oleh admin = human-in-the-loop)
-- ---------------------------------------------------------------------
create table public.notification_queue (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references public.monthly_cycles (id) on delete cascade,
  department_id  uuid not null references public.departments (id) on delete cascade,
  week           smallint not null check (week between 1 and 4),
  target_role    public.contact_role not null,
  phone          text,
  message        text not null,
  status         public.notification_status not null default 'pending',
  source         text not null default 'cron' check (source in ('cron', 'admin')),
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  sent_by        uuid references auth.users (id) on delete set null,
  unique (cycle_id, department_id, week, target_role)
);
create index notification_queue_pending_idx on public.notification_queue (cycle_id, status);

-- =====================================================================
--  Row Level Security
--  - Admin (app_admins): akses penuh.
--  - Publik (anon): baca tahun ajaran, siklus, nama bagian; kirim laporan
--    hanya via RPC submit_report dengan kode akses bagian.
-- =====================================================================
alter table public.app_admins         enable row level security;
alter table public.academic_periods   enable row level security;
alter table public.monthly_cycles     enable row level security;
alter table public.departments        enable row level security;
alter table public.monthly_reports    enable row level security;
alter table public.priority_programs  enable row level security;
alter table public.notification_queue enable row level security;

create policy "admin kelola admin"      on public.app_admins         for all using (public.is_admin()) with check (public.is_admin());
create policy "publik baca periode"     on public.academic_periods   for select using (true);
create policy "admin kelola periode"    on public.academic_periods   for all using (public.is_admin()) with check (public.is_admin());
create policy "publik baca siklus"      on public.monthly_cycles     for select using (true);
create policy "admin kelola siklus"     on public.monthly_cycles     for all using (public.is_admin()) with check (public.is_admin());
create policy "publik baca bagian"      on public.departments        for select using (true);
create policy "admin kelola bagian"     on public.departments        for all using (public.is_admin()) with check (public.is_admin());
create policy "admin kelola laporan"    on public.monthly_reports    for all using (public.is_admin()) with check (public.is_admin());
create policy "admin kelola program"    on public.priority_programs  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin kelola antrean"    on public.notification_queue for all using (public.is_admin()) with check (public.is_admin());

-- Hak kolom departments:
--  - anon hanya melihat kolom non-sensitif (tanpa nomor WA & nama pejabat);
--  - hash kode akses tidak pernah keluar lewat API, termasuk untuk admin
--    (admin cukup melihat has_access_code). Hak tingkat tabel dicabut lebih
--    dulu karena hak tabel selalu menimpa pencabutan per kolom.
revoke select, update on public.departments from anon, authenticated;
grant  select (id, no, nama, is_active) on public.departments to anon;
grant  select (id, no, nama, sekretaris_nama, sekretaris_wa, ketua_nama, ketua_wa,
               pembimbing_nama, has_access_code, is_active, created_at, updated_at)
  on public.departments to authenticated;
grant  update (no, nama, sekretaris_nama, sekretaris_wa, ketua_nama, ketua_wa,
               pembimbing_nama, is_active)
  on public.departments to authenticated;

-- =====================================================================
--  RPC
-- =====================================================================

-- Status pelaporan publik (tanpa isi laporan)
create or replace function public.get_cycle_status(p_cycle_id uuid)
returns table (department_id uuid, no smallint, nama text, status public.report_status, submitted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.no, d.nama, r.status, r.submitted_at
  from public.monthly_reports r
  join public.departments d on d.id = r.department_id
  where r.cycle_id = p_cycle_id
  order by d.no;
$$;

-- Jadikan satu tahun ajaran aktif (dua langkah agar indeks unik parsial tidak bentrok)
create or replace function public.activate_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengubah tahun ajaran aktif' using errcode = '42501';
  end if;
  update public.academic_periods set is_active = false where is_active and id <> p_period_id;
  update public.academic_periods set is_active = true  where id = p_period_id;
end;
$$;

-- Buka periode bulan baru: arsipkan siklus aktif, buat siklus baru,
-- dan reset status pelaporan seluruh bagian aktif (48 baris belum_lapor).
create or replace function public.open_new_cycle(
  p_period_id    uuid,
  p_hijri_month  smallint,
  p_hijri_year   smallint,
  p_masehi_label text,
  p_start_date   date,
  p_end_date     date,
  p_deadline     date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat membuka periode baru' using errcode = '42501';
  end if;

  update public.monthly_cycles
     set status = 'arsip', archived_at = now()
   where status = 'aktif';

  perform public.activate_period(p_period_id);

  insert into public.monthly_cycles
    (period_id, hijri_month, hijri_year, masehi_label, start_date, end_date, deadline_date, status, opened_by)
  values
    (p_period_id, p_hijri_month, p_hijri_year, p_masehi_label, p_start_date, p_end_date, p_deadline, 'aktif', auth.uid())
  returning id into v_id;

  insert into public.monthly_reports (cycle_id, department_id, sekretaris_nama, ketua_nama, pembimbing_nama)
  select v_id, d.id, d.sekretaris_nama, d.ketua_nama, d.pembimbing_nama
  from public.departments d
  where d.is_active;

  return v_id;
end;
$$;

-- Atur / ganti kode akses input laporan sebuah bagian (admin)
create or replace function public.set_department_access_code(p_department_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengatur kode akses' using errcode = '42501';
  end if;
  if p_code is null or length(p_code) < 6 then
    raise exception 'Kode akses minimal 6 karakter';
  end if;
  update public.departments
     set access_code_hash = extensions.crypt(p_code, extensions.gen_salt('bf'))
   where id = p_department_id;
end;
$$;

-- Kirim / perbarui softfile laporan (dipanggil Sekretaris dengan kode akses, atau admin)
-- p_payload: {sekretaris_nama, ketua_nama, pembimbing_nama, hasil_usaha[], kendala[{teks,kategori}],
--             solusi[], programs[{judul,kategori,target}], pernyataan_inovatif}
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
  v_i       int := 0;
begin
  select * into v_cycle from public.monthly_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Periode laporan tidak ditemukan';
  end if;
  -- Siklus aktif selalu terbuka (lewat tenggat = tercatat terlambat).
  -- Siklus yang sudah diarsipkan masih menerima laporan sampai tanggal 5
  -- bulan berikutnya, sesuai Rundown Minggu Pertama. Admin selalu boleh.
  if not public.is_admin()
     and v_cycle.status <> 'aktif'
     and (now() at time zone 'Asia/Jakarta')::date > v_cycle.deadline_date then
    raise exception 'Periode % sudah ditutup (lewat tenggat). Hubungi admin.', v_cycle.hijri_month || '/' || v_cycle.hijri_year;
  end if;

  select * into v_dept from public.departments where id = p_department_id and is_active;
  if not found then
    raise exception 'Bagian tidak ditemukan';
  end if;

  if not public.is_admin() then
    if v_dept.access_code_hash is null
       or extensions.crypt(coalesce(p_access_code, ''), v_dept.access_code_hash) <> v_dept.access_code_hash then
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

  insert into public.monthly_reports as r
    (cycle_id, department_id, status, sekretaris_nama, ketua_nama, pembimbing_nama,
     hasil_usaha, kendala, solusi, pernyataan_inovatif, submitted_at, pembimbing_approved_at)
  values
    (p_cycle_id, p_department_id, 'terkirim',
     p_payload ->> 'sekretaris_nama', p_payload ->> 'ketua_nama', p_payload ->> 'pembimbing_nama',
     array(select jsonb_array_elements_text(p_payload -> 'hasil_usaha')),
     coalesce(p_payload -> 'kendala', '[]'::jsonb),
     array(select jsonb_array_elements_text(coalesce(p_payload -> 'solusi', '[]'::jsonb))),
     true, now(), now())
  on conflict (cycle_id, department_id) do update set
     status                 = 'terkirim',
     sekretaris_nama        = excluded.sekretaris_nama,
     ketua_nama             = excluded.ketua_nama,
     pembimbing_nama        = excluded.pembimbing_nama,
     hasil_usaha            = excluded.hasil_usaha,
     kendala                = excluded.kendala,
     solusi                 = excluded.solusi,
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

-- Hak eksekusi RPC
revoke all on function public.open_new_cycle(uuid, smallint, smallint, text, date, date, date) from public, anon;
revoke all on function public.set_department_access_code(uuid, text) from public, anon;
revoke all on function public.activate_period(uuid) from public, anon;
grant execute on function public.activate_period(uuid) to authenticated;
grant execute on function public.open_new_cycle(uuid, smallint, smallint, text, date, date, date) to authenticated;
grant execute on function public.set_department_access_code(uuid, text) to authenticated;
grant execute on function public.submit_report(uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.get_cycle_status(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- =====================================================================
--  View rekap untuk Panel Admin (mewarisi RLS pemanggil)
-- =====================================================================
create view public.v_report_recap
with (security_invoker = true) as
select
  r.id                as report_id,
  c.id                as cycle_id,
  c.hijri_month,
  c.hijri_year,
  c.masehi_label,
  c.deadline_date,
  d.no,
  d.nama              as bagian,
  r.status,
  r.submitted_at,
  case
    when r.submitted_at is null and (now() at time zone 'Asia/Jakarta')::date > c.deadline_date then 'terlambat_belum'
    when r.submitted_at is null then 'belum'
    when (r.submitted_at at time zone 'Asia/Jakarta')::date <= c.deadline_date then 'tepat_waktu'
    else 'terlambat'
  end                 as kepatuhan,
  r.hasil_usaha,
  r.kendala,
  r.solusi,
  (select count(*) from public.priority_programs p where p.report_id = r.id and p.kategori = 'unggulan') as jumlah_unggulan
from public.monthly_reports r
join public.monthly_cycles c on c.id = r.cycle_id
join public.departments d on d.id = r.department_id;
