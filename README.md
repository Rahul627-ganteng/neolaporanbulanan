# Portal Laporan Bulanan Sektor Guru KMI
**Pondok Modern Darussalam Gontor Kampus 3 (Darul Ma'rifat) · Sumbercangkring, Gurah, Kediri**

Sistem informasi pelaporan bulanan untuk 48 bagian Sektor Guru KMI: formulir softfile resmi, pelacak Rundown 4 minggu, pengingat WhatsApp dengan konfirmasi admin, kartu pengingat target program, dokumen Word resmi, daftar belum lapor, dan panel admin bergrafik. Satu kode sumber berjalan dalam dua mode:

**Alur laporan.** Laporan bulan M berisi *hasil usaha selama bulan M* dan *program kerja bulan M+1*. Laporan dikerjakan di akhir bulan M (Minggu 3–4) dan dikumpulkan paling lambat **tanggal 5 bulan M+1**. Siklus M tetap aktif sampai tenggat itu; sehari setelahnya Edge Function membuka siklus M+1 otomatis. Laporan M yang terlambat tetap diterima dan ditandai *terlambat*.

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
    20261104000001_cron_secret_admin_allowlist.sql  verifikasi secret lewat Vault + daftar email admin
    20261104000002_hardening.sql          indeks FK & RLS per aksi (saran Supabase Advisor)
    20261104010601_departments_admin_only_read.sql  nama & WA pejabat bagian hanya untuk admin
    20261114000001_otomasi_periode_kode_admin.sql   buka periode otomatis, kode akses massal, kelola admin
  functions/
    _shared/rundown.js              aturan rundown & template WA (dipakai frontend + Edge Function)
    _shared/hijri.js                kalender Hijriah (Umm al-Qura) & rencana pembukaan periode
    weekly-reminder/index.ts        buka periode baru otomatis + antrean pengingat mingguan
    admin-users/index.ts            tambah admin & kata sandi sementara dari aplikasi
src/                                aplikasi React (Vite + Tailwind v4 + Recharts + Lucide + docx)
src/assets/                         logo Darul Ma'rifat (putih & navy, PNG transparan)
scripts/apply-migrations.mjs        migrasi lewat Management API (tanpa kata sandi database)
scripts/build-artifact.mjs          membangun prototipe single-file dari kode yang sama
```

### Tabel utama
- `academic_periods` — tahun ajaran lintas periode (dibuat otomatis tiap Syawal, atau manual dari menu **Periode & Admin**).
- `monthly_cycles` — satu bulan Hijriah = satu siklus; `deadline_date` = tanggal 5 bulan berikutnya; `active_week` opsional (manual).
- `departments` — 48 bagian + nama & WA Ketua/Sekretaris, nama Pembimbing, hash kode akses.
- `monthly_reports` — Hasil Usaha, Kendala (berkategori), Solusi, status, dan cap waktu tahapan rundown (rapat bagian, draf ke Guru Senior, persetujuan Pembimbing, softfile, hardfile Staf Sekretaris Wakil Pengasuh).
- `priority_programs` — Program Kerja Satu Bulan ke Depan + klasifikator 🌟 Unggulan / 🚀 Inovasi / 🛠️ Tindak Lanjut / 📌 Reguler.
- `notification_queue` — antrean pengingat WA (diisi pg_cron atau admin, dikirim manual).
- `app_admins` — akun Supabase Auth yang berhak mengelola; diisi otomatis dari `app_admin_emails`.

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
| `CRON_SECRET` | opsional; pg_cron memakai secret Vault `cron_secret` yang dibuat otomatis |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | URL & anon key |
| `VITE_PORTAL_URL` | alamat situs (opsional, dicantumkan di pesan WA) |
| `NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID` | dari langkah 2 |

Setiap push ke `main` menjalankan: build & uji → `scripts/apply-migrations.mjs` (migrasi + secret Vault lewat Management API, cukup access token) → deploy Edge Function `weekly-reminder` & `admin-users`. Netlify yang terhubung ke repo membangun & merilis situs sendiri dari `netlify.toml`; job `Deploy Netlify (manual)` di Actions hanya untuk rilis manual. Pull request hanya di-build. Kata sandi database tidak diperlukan lagi.

Proyek ini juga terhubung ke **integrasi GitHub Supabase** (cek "Supabase Preview"), yang menerapkan `supabase/migrations` dan Edge Function dari `main` dengan sendirinya. Karena itu, bila `SUPABASE_ACCESS_TOKEN` ditolak (HTTP 401), job migrasi di Actions hanya memberi peringatan, tidak gagal. Untuk mengaktifkan jalur CI juga, buat Personal Access Token baru (diawali `sbp_`) lalu simpan ulang sebagai secret tersebut.

### 4. Admin pertama (sekali saja, di SQL Editor)
Buat akun di **Authentication → Users → Add user** (centang *Auto Confirm User*), lalu:
```sql
insert into public.app_admin_emails (email, catatan) values
  ('admin@contoh.sch.id', 'Admin Sektor Guru KMI')
on conflict (email) do nothing;
```
Admin berikutnya ditambahkan dari aplikasi (**Periode & Admin → Akun admin**): akun dibuat otomatis dengan kata sandi sementara.

### 5. Mulai pakai
1. **Data Bagian → Impor dari spreadsheet**: unduh templat 48 bagian, isi nama & WA Ketua/Sekretaris dan Pembimbing, tempel/unggah kembali.
2. **Data Bagian → Kode akses massal**: buat kode 6 karakter untuk semua bagian, unduh Excel-nya, kirim ke tiap Sekretaris lewat tombol WA.
3. Sekretaris membuka portal → **Input Laporan** → pilih bagian → isi kode akses → kirim.
4. Periode bulan berikutnya dibuka otomatis sehari setelah tenggat tanggal 5 (tanggal Umm al-Qura; admin dapat menyesuaikan di **Periode & Admin** bila penetapan pondok berbeda).

---

## Otomatisasi pengingat (pg_cron + Edge Function)
- Setiap hari 06.05 WIB, `cron.schedule('kmi-weekly-reminder')` memanggil `public.trigger_weekly_reminder()` → `net.http_post` ke Edge Function dengan secret `cron_secret` dari Vault. Edge Function mencocokkan token itu langsung ke Vault (`check_cron_secret`), jadi `CRON_SECRET` di env fungsi bersifat opsional.
- Edge Function pertama-tama membuka periode bulan baru bila tenggat siklus aktif sudah lewat (`open_cycle_auto`; tahun ajaran baru dibuat otomatis di bulan Syawal; pengingat lama yang belum terkirim ditandai dilewati).
- Lalu menghitung minggu rundown (hari ke-0/7/14/21 sejak awal bulan = pergantian minggu) dan mengisi `notification_queue` sesuai kebijakan:

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
- Sekretaris mengirim laporan lewat RPC `submit_report` dengan kode akses bagian (bcrypt, tidak peka huruf besar/kecil). Sekretaris dapat mengirim untuk siklus aktif dan satu siklus sebelumnya; yang lebih lama hanya lewat admin.
- Admin tidak dapat mencabut hak adminnya sendiri, dan daftar admin tidak boleh kosong.
- `service_role` key hanya dipakai di Edge Function (otomatis dari Supabase), tidak pernah di frontend atau Netlify.

## Prototipe single-file
`npm run build:artifact` menghasilkan `artifact/portal-laporan-kmi.html`: aplikasi yang sama dalam Mode Demo, pustaka dimuat dari CDN, ditambah tab **Blueprint Produksi** berisi seluruh berkas repositori.
