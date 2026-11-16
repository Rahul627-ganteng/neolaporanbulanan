-- =====================================================================
--  Migrasi 14 — Kelola bulan dari Periode & Admin
--   1. activate_cycle: admin memilih bulan yang sedang berjalan (aktif).
--   2. set_cycle_input: admin membuka / menutup input laporan per bulan.
--      Bulan yang ditutup tidak bisa dikirim bagian dan tidak menahan
--      laporan bulan berikutnya.
--   3. delete_cycle: admin menghapus bulan yang tidak aktif (beserta
--      laporan & antrean pengingatnya).
--   4. open_new_cycle bisa menyiapkan bulan "belum aktif" (p_activate=false);
--      open_cycle_auto mengaktifkan bulan yang sudah disiapkan itu saat
--      waktunya tiba, tetapi tidak mengambil alih bulan yang pernah aktif.
-- =====================================================================

alter table public.monthly_cycles add column if not exists activated_at timestamptz;
alter table public.monthly_cycles add column if not exists input_closed_at timestamptz;
update public.monthly_cycles set activated_at = opened_at where activated_at is null;

-- ---------------------------------------------------------------------
-- 1. Jadikan aktif
-- ---------------------------------------------------------------------
create or replace function public.activate_cycle(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.monthly_cycles;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengaktifkan bulan' using errcode = '42501';
  end if;
  select * into v_c from public.monthly_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Bulan tidak ditemukan';
  end if;
  if v_c.status = 'aktif' then
    return;
  end if;
  update public.monthly_cycles set status = 'arsip', archived_at = now() where status = 'aktif';
  update public.monthly_cycles set status = 'aktif', archived_at = null, activated_at = now() where id = p_cycle_id;
  update public.academic_periods set is_active = false where is_active and id <> v_c.period_id;
  update public.academic_periods set is_active = true where id = v_c.period_id and not is_active;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Buka / tutup input per bulan
-- ---------------------------------------------------------------------
create or replace function public.set_cycle_input(p_cycle_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat membuka atau menutup input' using errcode = '42501';
  end if;
  if p_open then
    update public.monthly_cycles
       set input_closed_at = null,
           input_open_date = least(input_open_date, v_today)
     where id = p_cycle_id;
  else
    update public.monthly_cycles set input_closed_at = coalesce(input_closed_at, now()) where id = p_cycle_id;
  end if;
  if not found then
    raise exception 'Bulan tidak ditemukan';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Hapus bulan (bukan bulan aktif)
-- ---------------------------------------------------------------------
create or replace function public.delete_cycle(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.monthly_cycles;
  v_sent int;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menghapus bulan' using errcode = '42501';
  end if;
  select * into v_c from public.monthly_cycles where id = p_cycle_id;
  if not found then
    raise exception 'Bulan tidak ditemukan';
  end if;
  if v_c.status = 'aktif' then
    raise exception 'Bulan % % H sedang aktif. Jadikan bulan lain aktif dulu sebelum menghapusnya.',
      public.hijri_month_name(v_c.hijri_month), v_c.hijri_year;
  end if;
  select count(*) into v_sent from public.monthly_reports where cycle_id = p_cycle_id and submitted_at is not null;
  delete from public.monthly_cycles where id = p_cycle_id;  -- laporan, program & antrean ikut terhapus (cascade)
  return jsonb_build_object('deleted', p_cycle_id, 'laporan_terhapus', v_sent);
end;
$$;

-- ---------------------------------------------------------------------
-- 4a. open_new_cycle: bisa menyiapkan bulan belum aktif
-- ---------------------------------------------------------------------
drop function if exists public.open_new_cycle(uuid, smallint, smallint, text, date, date, date);
create or replace function public.open_new_cycle(
  p_period_id    uuid,
  p_hijri_month  smallint,
  p_hijri_year   smallint,
  p_masehi_label text,
  p_start_date   date,
  p_end_date     date,
  p_deadline     date,
  p_activate     boolean default true
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

  if coalesce(p_activate, true) then
    update public.monthly_cycles set status = 'arsip', archived_at = now() where status = 'aktif';
    perform public.activate_period(p_period_id);
  end if;

  insert into public.monthly_cycles
    (period_id, hijri_month, hijri_year, masehi_label, start_date, end_date, deadline_date, status, opened_by, activated_at)
  values
    (p_period_id, p_hijri_month, p_hijri_year, p_masehi_label, p_start_date, p_end_date, p_deadline,
     case when coalesce(p_activate, true) then 'aktif' else 'arsip' end::public.cycle_status, auth.uid(),
     case when coalesce(p_activate, true) then now() end)
  returning id into v_id;

  insert into public.monthly_reports (cycle_id, department_id, sekretaris_nama, ketua_nama, pembimbing_nama)
  select v_id, d.id, d.sekretaris_nama, d.ketua_nama, d.pembimbing_nama
  from public.departments d
  where d.is_active
  on conflict (cycle_id, department_id) do nothing;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4b. open_cycle_auto: aktifkan bulan yang sudah disiapkan (belum pernah aktif)
-- ---------------------------------------------------------------------
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
  v_c      public.monthly_cycles;
begin
  select * into v_c from public.monthly_cycles
   where hijri_month = p_hijri_month and hijri_year = p_hijri_year;
  if found then
    -- Bulan yang disiapkan admin (belum pernah aktif) diaktifkan saat waktunya tiba.
    -- Bulan yang pernah aktif tidak diambil alih (pilihan admin dihormati).
    if v_c.status <> 'aktif' and v_c.activated_at is null then
      select id into v_old from public.monthly_cycles where status = 'aktif';
      update public.monthly_cycles set status = 'arsip', archived_at = now() where status = 'aktif';
      if v_old is not null then
        update public.notification_queue set status = 'skipped' where cycle_id = v_old and status = 'pending';
      end if;
      update public.monthly_cycles set status = 'aktif', archived_at = null, activated_at = now() where id = v_c.id;
      update public.academic_periods set is_active = false where is_active and id <> v_c.period_id;
      update public.academic_periods set is_active = true where id = v_c.period_id and not is_active;
    end if;
    return v_c.id;
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
  if v_old is not null then
    update public.notification_queue set status = 'skipped'
     where cycle_id = v_old and status = 'pending';
  end if;

  insert into public.monthly_cycles
    (period_id, hijri_month, hijri_year, masehi_label, start_date, end_date, deadline_date, input_open_date, status, activated_at)
  values
    (v_period, p_hijri_month, p_hijri_year, p_masehi_label, p_start_date, p_end_date, p_deadline,
     case when p_input_open between p_start_date and p_deadline then p_input_open end, 'aktif', now())
  returning id into v_id;

  insert into public.monthly_reports (cycle_id, department_id, sekretaris_nama, ketua_nama, pembimbing_nama)
  select v_id, d.id, d.sekretaris_nama, d.ketua_nama, d.pembimbing_nama
  from public.departments d
  where d.is_active
  on conflict (cycle_id, department_id) do nothing;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Bulan yang ditutup tidak dihitung tertunggak dan tidak bisa dikirim bagian
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
    and c.input_closed_at is null
  order by c.hijri_year, c.hijri_month;
$$;

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
    -- a. Input ditutup admin, atau baru dibuka pada tanggal buka (bawaan tanggal 20 Hijriah).
    if v_cycle.input_closed_at is not null then
      raise exception 'Input laporan bulan % % H sedang ditutup admin. Hubungi admin Sektor Guru KMI.',
        public.hijri_month_name(v_cycle.hijri_month), v_cycle.hijri_year;
    end if;
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
       and c.input_closed_at is null
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
-- Hak eksekusi
-- ---------------------------------------------------------------------
revoke all on function public.activate_cycle(uuid) from public, anon;
revoke all on function public.set_cycle_input(uuid, boolean) from public, anon;
revoke all on function public.delete_cycle(uuid) from public, anon;
revoke all on function public.open_new_cycle(uuid, smallint, smallint, text, date, date, date, boolean) from public, anon;
revoke all on function public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text, date) from public, anon, authenticated;
grant execute on function public.activate_cycle(uuid) to authenticated;
grant execute on function public.set_cycle_input(uuid, boolean) to authenticated;
grant execute on function public.delete_cycle(uuid) to authenticated;
grant execute on function public.open_new_cycle(uuid, smallint, smallint, text, date, date, date, boolean) to authenticated;
grant execute on function public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text, date) to service_role;
