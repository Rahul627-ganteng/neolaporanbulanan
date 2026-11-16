-- =====================================================================
--  Migrasi 13 — Laporan berurutan, input dibuka tanggal 20, pindah bulan
--   1. monthly_cycles.input_open_date: input softfile laporan bulan M
--      dibuka tanggal 20 bulan M (bawaan; admin dapat mengubah per bulan).
--      Siklus M tetap menjadi siklus aktif sejak sehari setelah tenggat
--      bulan M-1 (rundown tidak berubah), tetapi bagian baru bisa mengirim
--      mulai tanggal buka.
--   2. Berurutan: bagian tidak bisa mengirim laporan bulan M selama laporan
--      bulan sebelumnya (yang sudah dibuka) belum terkirim. Laporan susulan
--      untuk bulan yang tertunggak boleh dikirim bagian sendiri (terlambat).
--   3. move_report: admin memindahkan laporan yang salah bulan (mis. masuk
--      ke Jumadil Akhir padahal untuk Jumadil Awal), atau menukar isi dua
--      bulan bila keduanya sudah terisi.
--   4. report_outstanding: daftar bulan yang belum dilaporkan sebuah bagian
--      (status kirim memang sudah publik lewat get_cycle_status).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Format tanggal untuk pesan galat
-- ---------------------------------------------------------------------
create or replace function public.hijri_month_name(p_month int)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Muharram','Safar','Rabiul Awal','Rabiul Akhir','Jumadil Awal','Jumadil Akhir','Rajab','Sya''ban',
                'Ramadhan','Syawal','Dzulqa''dah','Dzulhijjah'])[p_month];
$$;

create or replace function public.format_tanggal_id(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select extract(day from p_date)::int || ' ' ||
         (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])
           [extract(month from p_date)::int] || ' ' || extract(year from p_date)::int;
$$;

-- ---------------------------------------------------------------------
-- 1. Tanggal buka input per bulan
-- ---------------------------------------------------------------------
alter table public.monthly_cycles add column if not exists input_open_date date;

-- Bawaan: tanggal 20 bulan Hijriah = hari ke-20 sejak tanggal 1 (start_date).
create or replace function public.monthly_cycles_default_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.input_open_date is null then
    new.input_open_date := least(new.start_date + 19, new.deadline_date);
  end if;
  return new;
end;
$$;
revoke all on function public.monthly_cycles_default_open() from public, anon, authenticated;

drop trigger if exists monthly_cycles_default_open on public.monthly_cycles;
create trigger monthly_cycles_default_open
  before insert or update on public.monthly_cycles
  for each row execute function public.monthly_cycles_default_open();

update public.monthly_cycles
   set input_open_date = least(start_date + 19, deadline_date)
 where input_open_date is null;

alter table public.monthly_cycles alter column input_open_date set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monthly_cycles_input_open_check') then
    alter table public.monthly_cycles
      add constraint monthly_cycles_input_open_check check (input_open_date <= deadline_date);
  end if;
end $$;

-- open_cycle_auto menerima tanggal buka dari Edge Function (tanggal 20 Umm al-Qura).
drop function if exists public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text);
create or replace function public.open_cycle_auto(
  p_hijri_month  smallint,
  p_hijri_year   smallint,
  p_masehi_label text,
  p_start_date   date,
  p_end_date     date,
  p_deadline     date,
  p_ta_masehi    text,
  p_ta_hijri     text,
  p_input_open   date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period uuid;
  v_old    uuid;
  v_id     uuid;
begin
  -- Idempoten: bulan yang sudah pernah dibuka tidak dibuat ulang.
  select id into v_id from public.monthly_cycles
   where hijri_month = p_hijri_month and hijri_year = p_hijri_year;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.academic_periods (label_masehi, label_hijri, is_active)
  values (p_ta_masehi, p_ta_hijri, false)
  on conflict do nothing;
  select id into v_period from public.academic_periods where label_hijri = p_ta_hijri;
  if v_period is null then
    raise exception 'Tahun ajaran % tidak dapat dibuat (label Masehi % bentrok)', p_ta_hijri, p_ta_masehi;
  end if;
  update public.academic_periods set is_active = false where is_active and id <> v_period;
  update public.academic_periods set is_active = true  where id = v_period and not is_active;

  select id into v_old from public.monthly_cycles where status = 'aktif';
  update public.monthly_cycles set status = 'arsip', archived_at = now() where status = 'aktif';
  -- Pengingat lama yang belum dikirim diganti antrean Minggu 1 bulan baru.
  if v_old is not null then
    update public.notification_queue set status = 'skipped'
     where cycle_id = v_old and status = 'pending';
  end if;

  insert into public.monthly_cycles
    (period_id, hijri_month, hijri_year, masehi_label, start_date, end_date, deadline_date, input_open_date, status)
  values
    (v_period, p_hijri_month, p_hijri_year, p_masehi_label, p_start_date, p_end_date, p_deadline,
     case when p_input_open between p_start_date and p_deadline then p_input_open end, 'aktif')
  returning id into v_id;

  insert into public.monthly_reports (cycle_id, department_id, sekretaris_nama, ketua_nama, pembimbing_nama)
  select v_id, d.id, d.sekretaris_nama, d.ketua_nama, d.pembimbing_nama
  from public.departments d
  where d.is_active
  on conflict (cycle_id, department_id) do nothing;

  return v_id;
end;
$$;
revoke all on function public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text, date) from public, anon, authenticated;
grant execute on function public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text, date) to service_role;

-- ---------------------------------------------------------------------
-- 2. Bulan yang belum dilaporkan sebuah bagian (sudah dibuka, belum terkirim)
-- ---------------------------------------------------------------------
create or replace function public.report_outstanding(p_department_id uuid)
returns table (cycle_id uuid, hijri_month smallint, hijri_year smallint, deadline_date date, input_open_date date)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.hijri_month, c.hijri_year, c.deadline_date, c.input_open_date
  from public.monthly_reports r
  join public.monthly_cycles c on c.id = r.cycle_id
  where r.department_id = p_department_id
    and r.submitted_at is null
    and c.input_open_date <= (now() at time zone 'Asia/Jakarta')::date
  order by c.hijri_year, c.hijri_month;
$$;
revoke all on function public.report_outstanding(uuid) from public;
grant execute on function public.report_outstanding(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. submit_report: tanggal buka + berurutan
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
  v_block   public.monthly_cycles;
  v_sent    boolean;
  v_today   date := (now() at time zone 'Asia/Jakarta')::date;
  v_report  uuid;
  v_prog    jsonb;
  v_eval    jsonb;
  v_i       int := 0;
begin
  select * into v_cycle from public.monthly_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Periode laporan tidak ditemukan';
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

  if not public.is_admin() then
    -- a. Input bulan ini baru dibuka pada tanggal buka (bawaan tanggal 20 Hijriah).
    if v_cycle.input_open_date > v_today then
      raise exception 'Input laporan bulan % % H baru dibuka %. Sebelum itu laporan belum bisa dikirim.',
        public.hijri_month_name(v_cycle.hijri_month), v_cycle.hijri_year, public.format_tanggal_id(v_cycle.input_open_date);
    end if;

    -- b. Berurutan: laporan bulan sebelumnya yang sudah dibuka harus terkirim dulu.
    select c.* into v_block
      from public.monthly_reports r
      join public.monthly_cycles c on c.id = r.cycle_id
     where r.department_id = p_department_id
       and r.submitted_at is null
       and c.input_open_date <= v_today
       and (c.hijri_year * 12 + c.hijri_month) < (v_cycle.hijri_year * 12 + v_cycle.hijri_month)
     order by c.hijri_year, c.hijri_month
     limit 1;
    if found then
      raise exception 'Laporan bulan % % H belum dikirim. Selesaikan laporan itu dulu, baru laporan bulan % % H.',
        public.hijri_month_name(v_block.hijri_month), v_block.hijri_year,
        public.hijri_month_name(v_cycle.hijri_month), v_cycle.hijri_year;
    end if;

    -- c. Perbaikan laporan yang sudah terkirim hanya untuk bulan aktif dan satu bulan sebelumnya.
    --    Laporan susulan yang belum pernah dikirim tetap diterima (tercatat terlambat).
    select r.submitted_at is not null into v_sent
      from public.monthly_reports r
     where r.cycle_id = p_cycle_id and r.department_id = p_department_id;
    if coalesce(v_sent, false)
       and v_cycle.status <> 'aktif'
       and v_cycle.start_date < (select max(c.start_date) from public.monthly_cycles c where c.status = 'arsip') then
      raise exception 'Laporan bulan % % H sudah ditutup. Hubungi admin Sektor Guru KMI untuk perbaikan.',
        public.hijri_month_name(v_cycle.hijri_month), v_cycle.hijri_year;
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
-- 4. Pindahkan laporan ke bulan lain (admin)
--    Isi laporan (beserta program kerja, tahapan, dan catatan admin)
--    dipindah ke baris bagian itu di bulan tujuan; baris asal menjadi
--    kosong (belum lapor). Bila bulan tujuan juga sudah terisi, isinya
--    hanya ditukar bila p_swap = true.
-- ---------------------------------------------------------------------
create or replace function public.move_report(p_report_id uuid, p_target_cycle_id uuid, p_swap boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.monthly_reports;
  t public.monthly_reports;
  v_tc public.monthly_cycles;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat memindahkan laporan' using errcode = '42501';
  end if;

  select * into s from public.monthly_reports where id = p_report_id for update;
  if not found then
    raise exception 'Laporan tidak ditemukan';
  end if;
  if s.submitted_at is null then
    raise exception 'Laporan ini belum dikirim, jadi belum ada isi yang bisa dipindahkan';
  end if;

  select * into v_tc from public.monthly_cycles where id = p_target_cycle_id;
  if not found then
    raise exception 'Bulan tujuan tidak ditemukan';
  end if;
  if v_tc.id = s.cycle_id then
    raise exception 'Bulan tujuan sama dengan bulan laporan ini';
  end if;

  select * into t from public.monthly_reports
   where cycle_id = p_target_cycle_id and department_id = s.department_id
   for update;
  if not found then
    insert into public.monthly_reports (cycle_id, department_id, sekretaris_nama, ketua_nama, pembimbing_nama)
    select p_target_cycle_id, d.id, d.sekretaris_nama, d.ketua_nama, d.pembimbing_nama
      from public.departments d where d.id = s.department_id
    returning * into t;
  end if;

  if t.submitted_at is not null and not coalesce(p_swap, false) then
    raise exception 'Bagian ini sudah punya laporan terkirim di bulan % % H. Pilih tukar isi bila keduanya memang tertukar.',
      public.hijri_month_name(v_tc.hijri_month), v_tc.hijri_year;
  end if;

  update public.monthly_reports set
    (status, sekretaris_nama, ketua_nama, pembimbing_nama, hasil_usaha, kendala, solusi, evaluasi_program,
     pernyataan_inovatif, submitted_at, rapat_bagian_at, draft_senior_at, pembimbing_approved_at,
     wapeng_received_at, catatan_admin, catatan_admin_at) =
    (s.status, s.sekretaris_nama, s.ketua_nama, s.pembimbing_nama, s.hasil_usaha, s.kendala, s.solusi, s.evaluasi_program,
     s.pernyataan_inovatif, s.submitted_at, s.rapat_bagian_at, s.draft_senior_at, s.pembimbing_approved_at,
     s.wapeng_received_at, s.catatan_admin, s.catatan_admin_at)
  where id = t.id;

  update public.monthly_reports set
    (status, sekretaris_nama, ketua_nama, pembimbing_nama, hasil_usaha, kendala, solusi, evaluasi_program,
     pernyataan_inovatif, submitted_at, rapat_bagian_at, draft_senior_at, pembimbing_approved_at,
     wapeng_received_at, catatan_admin, catatan_admin_at) =
    (t.status, t.sekretaris_nama, t.ketua_nama, t.pembimbing_nama, t.hasil_usaha, t.kendala, t.solusi, t.evaluasi_program,
     t.pernyataan_inovatif, t.submitted_at, t.rapat_bagian_at, t.draft_senior_at, t.pembimbing_approved_at,
     t.wapeng_received_at, t.catatan_admin, t.catatan_admin_at)
  where id = s.id;

  update public.priority_programs
     set report_id = case when report_id = s.id then t.id else s.id end
   where report_id in (s.id, t.id);

  return jsonb_build_object(
    'report_id', t.id,
    'cycle_id', t.cycle_id,
    'from_cycle_id', s.cycle_id,
    'swapped', t.submitted_at is not null
  );
end;
$$;
revoke all on function public.move_report(uuid, uuid, boolean) from public, anon;
grant execute on function public.move_report(uuid, uuid, boolean) to authenticated;
