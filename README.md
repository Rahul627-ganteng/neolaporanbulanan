# Portal Laporan Bulanan Sektor Guru KMI
**Pondok Modern Darussalam Gontor Kampus 3 (Darul Ma'rifat) · Sumbercangkring, Gurah, Kediri**

Sistem informasi pelaporan bulanan untuk 48 bagian Sektor Guru KMI: formulir softfile resmi, pelacak Rundown 4 minggu, pengingat WhatsApp dengan konfirmasi admin, kartu pengingat target program, dokumen Word resmi, daftar belum lapor, dan panel admin bergrafik. Satu kode sumber berjalan dalam dua mode:

| Mode | Kapan aktif | Penyimpanan |
|---|---|---|
| **Demo** | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` kosong, atau prototipe artefak | Peramban (localStorage), berisi data contoh |
| **Produksi** | Kedua variabel terisi | Supabase (Postgres + Auth + RPC + Edge Function + pg_cron) |

---

## Struktur repositori

```
.github/workflows/deploy.yml        CI/CD: build → migrasi Supabase → Edge Function → Netlify
netlify.toml                        build, SPA redirect, header keamanan, cache
supabase/
  config.toml
  migrations/
    20261103000001_schema.sql       tabel, RLS, RPC (open_new_cycle, submit_report, …)
    20261103000002_seed_departments.sql   48 bagian + tahun ajaran 2026-2027 / 1447-1448
    20261103000003_cron_reminders.sql     pg_cron harian 06.05 WIB → Edge Function
  functions/
    _shared/rundown.js              aturan rundown & template WA (dipakai frontend + Edge Function)
    weekly-reminder/index.ts        menyiapkan antrean pengingat setiap pergantian minggu
  scripts/sync_vault.sql            menyimpan secret Vault yang dibaca pg_cron
src/                                aplikasi React (Vite + Tailwind v4 + Recharts + Lucide + docx)
scripts/build-artifact.mjs          membangun prototipe single-file dari kode yang sama
```

### Tabel utama
- `academic_periods` — tahun ajaran lintas periode (tambah 2027-2028 / 1448-1449 dst. dari menu **Periode**).
- `monthly_cycles` — satu bulan Hijriah = satu siklus; `deadline_date` = tanggal 5 bulan berikutnya; `active_week` opsional (manual).
- `departments` — 48 bagian + nama & WA Ketua/Sekretaris, nama Pembimbing, hash kode akses.
- `monthly_reports` — Hasil Usaha, Kendala (berkategori), Solusi, status, dan cap waktu tahapan rundown (rapat bagian, draf ke Guru Senior, persetujuan Pembimbing, softfile, hardfile Staf Sekretaris Wakil Pengasuh).
- `priority_programs` — Program Kerja Satu Bulan ke Depan + klasifikator 🌟 Unggulan / 🚀 Inovasi / 🛠️ Tindak Lanjut / 📌 Reguler.
- `notification_queue` — antrean pengingat WA (diisi pg_cron atau admin, dikirim manual).
- `app_admins` — akun Supabase Auth yang berhak mengelola.

---

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local     # kosongkan 2 baris pertama untuk Mode Demo
npm run dev                    # http://localhost:5173
```

---

## Deploy produksi (sekali siapkan, selanjutnya otomatis)

### 1. Supabase
1. Buat proyek di supabase.com (region **Southeast Asia (Singapore)**).
2. **Database → Extensions**: pastikan `pg_cron` dan `pg_net` dapat diaktifkan (migrasi 3 mengaktifkannya).
3. **Authentication → Providers → Email**: aktif; matikan *Allow new users to sign up*.
4. **Authentication → Users → Add user**: buat akun admin (email + kata sandi).
5. Catat: *Project ref*, *Database password*, *Project URL*, *anon public key*, dan string koneksi **Session pooler** (Settings → Database).

### 2. Netlify
1. Buat situs baru (boleh "Deploy manually" kosong) → catat **Site ID** (Site configuration → General).
2. User settings → Applications → **Personal access token** → catat.
3. Bila memilih Git-integration Netlify (tanpa job deploy di Actions), isi env di Netlify:
   ```bash
   npx netlify-cli env:set VITE_SUPABASE_URL https://<ref>.supabase.co
   npx netlify-cli env:set VITE_SUPABASE_ANON_KEY <anon-key>
   npx netlify-cli env:set VITE_PORTAL_URL https://<situs>.netlify.app
   ```

### 3. GitHub
Push repositori, lalu isi **Settings → Secrets and variables → Actions**:

| Secret | Isi |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token dari supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | ref proyek |
| `SUPABASE_DB_PASSWORD` | kata sandi database |
| `SUPABASE_DB_URL` | string koneksi Session pooler (untuk sinkron Vault) |
| `CRON_SECRET` | string acak ≥ 32 karakter (`openssl rand -hex 32`) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | URL & anon key |
| `VITE_PORTAL_URL` | alamat situs (opsional, dicantumkan di pesan WA) |
| `NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID` | dari langkah 2 |

Setiap push ke `main` menjalankan: build & uji → `supabase db push` → deploy Edge Function `weekly-reminder` + secret → sinkron Vault → `netlify deploy --prod`. Pull request hanya di-build.

### 4. Daftarkan admin (sekali, di SQL Editor)
```sql
insert into public.app_admins (user_id, nama)
select id, 'Admin Sektor Guru KMI' from auth.users where email = 'admin@contoh.sch.id';
```

### 5. Mulai pakai
1. Masuk sebagai admin → **Periode → Buka Periode Bulan Baru** (tanggal awal bulan dihitung dari Umm al-Qura; sesuaikan dengan penetapan pondok bila berbeda).
2. **Data Bagian**: isi nama & WA Ketua/Sekretaris, nama Pembimbing, dan **kode akses** tiap bagian. Bagikan kode ke Sekretaris Bagian.
3. Sekretaris membuka portal → **Input Laporan** → pilih bagian → isi kode akses → kirim.

---

## Otomatisasi pengingat (pg_cron + Edge Function)
- Setiap hari 06.05 WIB, `cron.schedule('kmi-weekly-reminder')` memanggil `public.trigger_weekly_reminder()` → `net.http_post` ke Edge Function dengan `CRON_SECRET` dari Vault.
- Edge Function menghitung minggu rundown (hari ke-0/7/14/21 sejak awal bulan = pergantian minggu) dan mengisi `notification_queue` sesuai kebijakan:

| Minggu | Penerima | Bagian |
|---|---|---|
| 1 | Sekretaris & Ketua | belum melapor untuk **bulan lalu** (selama belum lewat tanggal 5) |
| 2 | Ketua | semua (pelaksanaan & monitoring program) |
| 3 | Ketua | semua (evaluasi, rapat bagian, draf ke Guru Senior) |
| 4 | Sekretaris & Ketua | belum menginput softfile bulan ini |

- Pesan **tidak** dikirim otomatis. Admin membuka **Rundown & Pengingat → Antrean**, meninjau/menyunting, membuka WhatsApp, lalu menandai terkirim.
- Uji manual: `select public.trigger_weekly_reminder();` atau tombol **Jalankan Edge Function** di aplikasi.
- Bila kelak memakai gateway WA (mis. layanan pihak ketiga), tambahkan pengiriman di Edge Function setelah upsert antrean — tetap sarankan persetujuan admin.

## Keamanan
- RLS aktif di semua tabel. Publik hanya membaca nama bagian, tahun ajaran, dan siklus; isi laporan & nomor WA hanya untuk admin.
- Sekretaris mengirim laporan lewat RPC `submit_report` dengan kode akses bagian (bcrypt). Laporan bulan lalu tetap diterima sampai tanggal 5 bulan berikutnya.
- `service_role` key hanya dipakai di Edge Function (otomatis dari Supabase), tidak pernah di frontend atau Netlify.

## Prototipe single-file
`npm run build:artifact` menghasilkan `artifact/portal-laporan-kmi.html`: aplikasi yang sama dalam Mode Demo, pustaka dimuat dari CDN, ditambah tab **Blueprint Produksi** berisi seluruh berkas repositori.
