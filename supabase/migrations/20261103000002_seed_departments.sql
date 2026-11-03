-- =====================================================================
--  Migrasi 2/3 — Data master 48 bagian Sektor Guru KMI PMDG Kampus 3
--  Kolom nama & nomor WA Sekretaris/Ketua serta nama Pembimbing sengaja
--  dikosongkan; isi lewat menu "Data Bagian" di Panel Admin.
-- =====================================================================

insert into public.departments (no, nama) values
  ( 1, 'Bagian Pengasuhan Santri'),
  ( 2, 'Bagian Kulliyatu-l-Mu''allimin Al-Islamiyyah'),
  ( 3, 'Bagian Labolatorium KMI'),
  ( 4, 'Bagian Administrasi'),
  ( 5, 'Language Advisory Council'),
  ( 6, 'Public Speaking & Discussion Advisory Council'),
  ( 7, 'Afternoon Lesson Advisory Council'),
  ( 8, 'Majlis Pembimbing Koordinator Harian'),
  ( 9, 'Bagian Pusat Data dan IT'),
  (10, 'Bagian Dapur Guru'),
  (11, 'Bagian Guest House'),
  (12, 'Bagian Klinik Pratama Darussyifa'),
  (13, 'Bagian BKSM'),
  (14, 'Pembimbing JMQ'),
  (15, 'Bagian Pemeliharaan Lingkungan'),
  (16, 'Bagian Gontor TV'),
  (17, 'Pembimbing GCNM'),
  (18, 'Bagian Majalah Al Qolam'),
  (19, 'Staf BAAK UNIDA Kelas D'),
  (20, 'Pembimbing Konsulat Luar Negeri'),
  (21, 'Bagian Sport Hall'),
  (22, 'Bagian Stadion Kampus 3'),
  (23, 'Bagian Sound System & Lighting'),
  (24, 'Bagian Recording & Radio Suargo F.M.'),
  (25, 'Dewan Mahasiswa'),
  (26, 'Bagian MAHADAMA'),
  (27, 'Pembimbing TPQ Sayyidah Fatimah'),
  (28, 'Yayasan Pembangunan'),
  (29, 'Yayasan Pertanian dan Perikanan'),
  (30, 'Yayasan Kendaraan'),
  (31, 'Yayasan Peternakan Sapi dan Kambing'),
  (32, 'Bagian Pemotongan Ayam'),
  (33, 'Bagian Pabrik Minuman'),
  (34, 'Bagian Pabrik Roti'),
  (35, 'Darul Ma''rifat Distributor Center'),
  (36, 'Ma''rifat Accessories'),
  (37, 'Bagian KUK Besi'),
  (38, 'Bagian KUK Palen'),
  (39, 'Bagian Wartel La Tansa'),
  (40, 'Bagian Ma''rifat Café'),
  (41, 'Bagian Ma''rifat Bakso dan Mie Ayam'),
  (42, 'Bagian La Tansa Mart'),
  (43, 'Bagian La Tansa Café'),
  (44, 'Bagian Penerimaan Tamu'),
  (45, 'Bagian Darul Ma''rifat Press'),
  (46, 'Koperasi Mahasiswa'),
  (47, 'Islamic Center Nganjuk'),
  (48, 'Ngohwah Coffee')
on conflict (no) do update set nama = excluded.nama;

-- Tahun ajaran awal. Tahun berikutnya (2027-2028 / 1448-1449, dst.)
-- ditambahkan dari menu "Periode" tanpa perlu migrasi baru.
insert into public.academic_periods (label_masehi, label_hijri, is_active)
values ('2026-2027', '1447-1448', true)
on conflict (label_masehi) do nothing;
