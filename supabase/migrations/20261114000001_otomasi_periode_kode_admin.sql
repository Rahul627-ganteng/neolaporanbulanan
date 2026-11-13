-- =====================================================================
--  Migrasi 7 — Otomatisasi penuh
--   1. open_cycle_auto: Edge Function membuka bulan Hijriah berikutnya
--      (dan tahun ajaran baru) tanpa campur tangan admin.
--   2. generate_access_codes: admin membuat kode akses 48 bagian sekaligus.
--   3. Kelola admin dari aplikasi: list_admins + pencabutan otomatis.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pembukaan periode otomatis (hanya service_role / Edge Function)
-- ---------------------------------------------------------------------
create or replace function public.open_cycle_auto(
  p_hijri_month  smallint,
  p_hijri_year   smallint,
  p_masehi_label text,
  p_start_date   date,
  p_end_date     date,
  p_deadline     date,
  p_ta_masehi    text,
  p_ta_hijri     text
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
    (period_id, hijri_month, hijri_year, masehi_label, start_date, end_date, deadline_date, status)
  values
    (v_period, p_hijri_month, p_hijri_year, p_masehi_label, p_start_date, p_end_date, p_deadline, 'aktif')
  returning id into v_id;

  insert into public.monthly_reports (cycle_id, department_id, sekretaris_nama, ketua_nama, pembimbing_nama)
  select v_id, d.id, d.sekretaris_nama, d.ketua_nama, d.pembimbing_nama
  from public.departments d
  where d.is_active
  on conflict (cycle_id, department_id) do nothing;

  return v_id;
end;
$$;
revoke all on function public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text) from public, anon, authenticated;
grant execute on function public.open_cycle_auto(smallint, smallint, text, date, date, date, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 2. Kode akses: dinormalisasi (huruf besar, tanpa spasi) & dibuat massal
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
     set access_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf'))
   where id = p_department_id;
end;
$$;

-- Kode 6 karakter tanpa huruf/angka yang mirip (0/O, 1/I/L).
-- Kode asli hanya dikembalikan sekali; database menyimpan hash bcrypt.
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
       set access_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf'))
     where id = v_dept.id;
    department_id := v_dept.id;
    no := v_dept.no;
    nama := v_dept.nama;
    kode := v_code;
    return next;
  end loop;
end;
$$;
revoke all on function public.generate_access_codes(boolean) from public, anon;
grant execute on function public.generate_access_codes(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Kelola admin dari aplikasi
-- ---------------------------------------------------------------------
create or replace function public.list_admins()
returns table (email text, catatan text, punya_akun boolean, terakhir_masuk timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.email, e.catatan, u.id is not null, u.last_sign_in_at, e.created_at
  from public.app_admin_emails e
  left join auth.users u on lower(u.email) = e.email
  where public.is_admin()
  order by e.created_at;
$$;
revoke all on function public.list_admins() from public, anon;
grant execute on function public.list_admins() to authenticated;

-- Email yang dihapus dari daftar langsung kehilangan hak admin.
-- Admin tidak bisa menghapus emailnya sendiri, dan daftar tidak boleh kosong.
create or replace function public.revoke_admin_for_removed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) = old.email then
    raise exception 'Anda tidak dapat menghapus akun admin Anda sendiri';
  end if;
  if not exists (select 1 from public.app_admin_emails) then
    raise exception 'Minimal harus ada satu admin';
  end if;
  delete from public.app_admins a
   using auth.users u
   where a.user_id = u.id and lower(u.email) = old.email;
  return old;
end;
$$;
revoke all on function public.revoke_admin_for_removed_email() from public, anon, authenticated;

drop trigger if exists on_admin_email_removed on public.app_admin_emails;
create trigger on_admin_email_removed
  after delete on public.app_admin_emails
  for each row execute function public.revoke_admin_for_removed_email();


-- ---------------------------------------------------------------------
-- 4. submit_report: kode akses tidak peka huruf besar/kecil & spasi;
--    laporan bulan sebelumnya tetap bisa dikirim setelah tenggat
--    (tercatat terlambat), karena periode baru dibuka otomatis
--    sehari setelah tanggal 5.
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

  if not public.is_admin() then
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
