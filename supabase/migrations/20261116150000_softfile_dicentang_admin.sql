-- =====================================================================
--  Migrasi 15 — Softfile dicentang admin (hardfile sudah diserahkan)
--   Admin dapat mencentang tahap "Softfile" untuk bagian yang sudah
--   menyerahkan hardfile tetapi belum bisa menginput softfile. Laporan itu
--   dihitung sudah lapor (tidak masuk rekap Belum Lapor dan tidak menahan
--   bulan berikutnya), ditandai softfile_manual. Bila bagian kemudian
--   mengirim softfile, tanda itu hilang dan isinya tersimpan seperti biasa.
-- =====================================================================

alter table public.monthly_reports add column if not exists softfile_manual boolean not null default false;

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
     pembimbing_approved_at = coalesce(r.pembimbing_approved_at, now()),  -- softfile = sudah disetujui pembimbing
     softfile_manual        = false
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

-- Tanda softfile_manual ikut saat laporan dipindah/ditukar bulan.
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
     wapeng_received_at, catatan_admin, catatan_admin_at, softfile_manual) =
    (s.status, s.sekretaris_nama, s.ketua_nama, s.pembimbing_nama, s.hasil_usaha, s.kendala, s.solusi, s.evaluasi_program,
     s.pernyataan_inovatif, s.submitted_at, s.rapat_bagian_at, s.draft_senior_at, s.pembimbing_approved_at,
     s.wapeng_received_at, s.catatan_admin, s.catatan_admin_at, s.softfile_manual)
  where id = t.id;

  update public.monthly_reports set
    (status, sekretaris_nama, ketua_nama, pembimbing_nama, hasil_usaha, kendala, solusi, evaluasi_program,
     pernyataan_inovatif, submitted_at, rapat_bagian_at, draft_senior_at, pembimbing_approved_at,
     wapeng_received_at, catatan_admin, catatan_admin_at, softfile_manual) =
    (t.status, t.sekretaris_nama, t.ketua_nama, t.pembimbing_nama, t.hasil_usaha, t.kendala, t.solusi, t.evaluasi_program,
     t.pernyataan_inovatif, t.submitted_at, t.rapat_bagian_at, t.draft_senior_at, t.pembimbing_approved_at,
     t.wapeng_received_at, t.catatan_admin, t.catatan_admin_at, t.softfile_manual)
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
