-- =====================================================================
--  Migrasi 5 — pengerasan sesuai Supabase Advisor
--   - indeks untuk foreign key yang belum terindeks;
--   - kebijakan RLS dipisah per aksi dan dibatasi ke role yang tepat
--     (satu kebijakan per role+aksi, is_admin() di-cache per kueri);
--   - is_admin() tidak lagi bisa dipanggil anon.
--  Fungsi publik yang memang disengaja: get_cycle_status (status lapor tanpa
--  isi) dan submit_report (dilindungi kode akses bcrypt per bagian).
-- =====================================================================

create index if not exists monthly_cycles_opened_by_idx      on public.monthly_cycles (opened_by);
create index if not exists monthly_reports_department_idx    on public.monthly_reports (department_id);
create index if not exists notification_queue_department_idx on public.notification_queue (department_id);
create index if not exists notification_queue_sent_by_idx    on public.notification_queue (sent_by);

-- Tabel dengan baca publik: academic_periods, monthly_cycles, departments
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('academic_periods', 'periode', 'publik baca periode', 'admin kelola periode'),
      ('monthly_cycles',   'siklus',  'publik baca siklus',  'admin kelola siklus'),
      ('departments',      'bagian',  'publik baca bagian',  'admin kelola bagian')
    ) as v(tbl, label, read_policy, old_admin_policy)
  loop
    execute format('drop policy if exists %I on public.%I', t.old_admin_policy, t.tbl);
    execute format('drop policy if exists %I on public.%I', t.read_policy, t.tbl);
    execute format('drop policy if exists %I on public.%I', 'admin tambah ' || t.label, t.tbl);
    execute format('drop policy if exists %I on public.%I', 'admin ubah ' || t.label, t.tbl);
    execute format('drop policy if exists %I on public.%I', 'admin hapus ' || t.label, t.tbl);

    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t.read_policy, t.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
                   'admin tambah ' || t.label, t.tbl);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   'admin ubah ' || t.label, t.tbl);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
                   'admin hapus ' || t.label, t.tbl);
  end loop;
end $$;

-- Tabel khusus admin: satu kebijakan "for all" untuk authenticated
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('app_admins',         'admin kelola admin'),
      ('monthly_reports',    'admin kelola laporan'),
      ('priority_programs',  'admin kelola program'),
      ('notification_queue', 'admin kelola antrean'),
      ('app_admin_emails',   'admin kelola email admin')
    ) as v(tbl, pol)
  loop
    execute format('drop policy if exists %I on public.%I', t.pol, t.tbl);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   t.pol, t.tbl);
  end loop;
end $$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated, service_role;
