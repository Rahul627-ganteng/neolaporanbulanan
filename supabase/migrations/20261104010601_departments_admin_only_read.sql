-- Nama pejabat & nomor WA bagian hanya terbaca oleh admin, termasuk bila
-- suatu saat ada akun non-admin yang berhasil login. Publik (anon) tetap
-- hanya melihat kolom non-sensitif lewat hak kolom.
drop policy if exists "publik baca bagian" on public.departments;
drop policy if exists "admin baca bagian" on public.departments;
create policy "publik baca bagian" on public.departments
  for select to anon using (true);
create policy "admin baca bagian" on public.departments
  for select to authenticated using ((select public.is_admin()));
