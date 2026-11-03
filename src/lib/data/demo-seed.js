// DATA CONTOH untuk Mode Demo / prototipe. Nama pejabat bagian dan isi laporan
// di sini fiktif dan hanya untuk memperlihatkan alur; nomor WA sengaja kosong
// agar tombol pengingat tidak pernah mengirim ke nomor orang sungguhan.
import { DEPARTMENT_NAMES, prevHijriMonth } from '../constants.js';
import { academicYearFor, addDays, hijriMonthRange, masehiLabelFor, toHijri } from '../hijri.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ahmad', 'Muhammad', 'Abdullah', 'Hasan', 'Fathurrahman', 'Ilham', 'Zainal', 'Rahmat', 'Faiz', 'Luthfi', 'Nur', 'Syamsul', 'Yusuf', 'Hafidz', 'Rizal', 'Imam', 'Akmal', 'Habib', 'Fikri', 'Ridwan', 'Arif', 'Taufiq', 'Wildan', 'Ghozali'];
const LAST = ['Fauzi', 'Rizki', 'Hanif', 'Basri', 'Rahman', 'Maulana', 'Abidin', 'Hidayat', 'Ramadhan', 'Hakim', 'Kholis', 'Arifin', 'Habibi', 'Anwar', 'Fahmi', 'Mubarok', 'Zuhdi', 'Nawawi', 'Syarif', 'Mahfud'];

const CLUSTER = {
  pendidikan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 19],
  layanan: [10, 11, 12, 15, 21, 22, 44],
  media: [16, 18, 23, 24, 45],
  pembinaan: [14, 17, 20, 25, 26, 27, 46, 47],
  yayasan: [28, 29, 30, 31],
  usaha: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 48],
};
const clusterOf = (no) => Object.keys(CLUSTER).find((k) => CLUSTER[k].includes(no)) || 'usaha';

const K = (teks, kategori) => ({ teks, kategori });
const P = (judul, kategori, target = '') => ({ judul, kategori, target });

const CONTENT = {
  pendidikan: [
    {
      hasil: [
        'Menyusun bank soal digital per jenjang kelas dan membagikannya ke wali kelas melalui folder bersama, dipakai pada ujian lisan pertengahan.',
        'Mengadakan klinik bimbingan bahasa bagi 36 santri yang nilainya di bawah standar, dengan peningkatan rata-rata 14 poin pada evaluasi akhir.',
        'Merintis format evaluasi kinerja guru berbasis lembar observasi kelas yang disepakati bersama Pembimbing.',
      ],
      kendala: [K('Jadwal guru pengampu bentrok dengan kegiatan kepanitiaan kampus.', 'waktu'), K('Perangkat komputer di ruang data sering lambat saat rekap nilai.', 'sarpras')],
      solusi: ['Membuat kalender koordinasi bersama Majlis Pembimbing Koordinator Harian.', 'Mengajukan pembaruan RAM dan pembersihan perangkat ke Bagian Pusat Data dan IT.'],
      programs: [P('Pelatihan pembuatan soal HOTS untuk guru kelas 1–3', 'unggulan', '40 guru'), P('Dasbor nilai santri berbasis spreadsheet', 'inovasi', 'Aktif pekan ke-2'), P('Kalender koordinasi bersama MPKH', 'tindak_lanjut'), P('Rekap kehadiran guru pekanan', 'reguler', '4 rekap')],
    },
    {
      hasil: [
        'Meluncurkan program "Satu Pekan Satu Kosakata Tematik" di asrama kelas 1 dengan pemantauan buku saku harian oleh mudabbir.',
        'Melakukan digitalisasi arsip surat keluar-masuk tahun ajaran berjalan sehingga pencarian dokumen kini di bawah satu menit.',
        'Menyelenggarakan forum diskusi guru muda tentang metode pengajaran aktif bersama dua narasumber Guru Senior.',
      ],
      kendala: [K('Sebagian anggota bagian merangkap tugas di bagian lain sehingga rapat tidak lengkap.', 'sdm'), K('Anggaran cetak materi pelatihan belum turun tepat waktu.', 'dana')],
      solusi: ['Membagi penanggung jawab program per anggota dengan notulen tertulis.', 'Mengalihkan materi ke format digital dan mencetak hanya lembar kerja inti.'],
      programs: [P('Lomba pidato tiga bahasa tingkat asrama', 'unggulan', '12 asrama'), P('Arsip digital surat terpadu', 'inovasi', '100% surat bulan ini'), P('Notulen rapat bagian terdokumentasi', 'tindak_lanjut'), P('Pemeriksaan buku saku kosakata', 'reguler', 'Tiap Kamis')],
    },
  ],
  layanan: [
    {
      hasil: [
        'Menerapkan sistem antrean bernomor saat jam makan guru sehingga waktu tunggu turun dari sekitar 15 menjadi 6 menit.',
        'Menyusun menu dua pekanan bersama ahli gizi klinik dengan variasi lauk yang lebih seimbang.',
        'Menata ulang gudang perlengkapan dengan label rak dan kartu stok sehingga barang hilang berkurang.',
      ],
      kendala: [K('Pasokan sayur dari pemasok luar terlambat saat musim hujan.', 'koordinasi'), K('Satu tabung gas besar bocor dan harus diganti.', 'sarpras')],
      solusi: ['Bekerja sama dengan Yayasan Pertanian dan Perikanan untuk pasokan sayur cadangan.', 'Pemeriksaan selang dan regulator gas tiap pekan.'],
      programs: [P('Pasokan sayur dari kebun Yayasan Pertanian', 'unggulan', '60% kebutuhan'), P('Survei kepuasan layanan via formulir daring', 'inovasi', '80 responden'), P('Pemeriksaan instalasi gas pekanan', 'tindak_lanjut', '4 kali'), P('Kartu stok gudang diperbarui', 'reguler')],
    },
    {
      hasil: [
        'Membuka layanan pemesanan kamar tamu melalui formulir daring, 27 pemesanan tercatat rapi dalam bulan ini.',
        'Menyelenggarakan pelatihan pertolongan pertama untuk 20 anggota bagian bekerja sama dengan Klinik Pratama Darussyifa.',
        'Membuat papan informasi jadwal pemakaian fasilitas yang diperbarui setiap Ahad.',
      ],
      kendala: [K('Kunjungan tamu mendadak di luar jadwal menyulitkan penyiapan kamar.', 'waktu'), K('Kurangnya tenaga saat pergantian semester.', 'sdm')],
      solusi: ['Menyiapkan dua kamar cadangan siap pakai setiap hari.', 'Merekrut tenaga bantu dari santri kelas 6 dengan jadwal bergilir.'],
      programs: [P('Standar layanan tamu tertulis (SOP)', 'unggulan', 'Disahkan Pembimbing'), P('Pemesanan kamar daring terintegrasi kalender', 'inovasi'), P('Kamar cadangan siap pakai', 'tindak_lanjut', '2 kamar'), P('Laporan okupansi pekanan', 'reguler', '4 laporan')],
    },
  ],
  media: [
    {
      hasil: [
        'Memproduksi seri video profil enam bagian unit usaha untuk kanal resmi kampus dengan total 4.800 tayangan.',
        'Membentuk tim liputan santri yang terlatih menulis berita singkat; 14 berita terbit bulan ini.',
        'Menyusun pedoman gaya penulisan dan desain agar seluruh publikasi seragam.',
      ],
      kendala: [K('Kamera utama mengalami kerusakan lensa.', 'sarpras'), K('Proses persetujuan konten memakan waktu lama.', 'koordinasi')],
      solusi: ['Menggunakan kamera cadangan dan mengajukan perbaikan lensa.', 'Menetapkan jadwal tinjauan konten tiap Selasa bersama Pembimbing.'],
      programs: [P('Liputan khusus Pekan Perkenalan Khutbatul Arsy', 'unggulan', '5 video'), P('Buletin digital bulanan', 'inovasi', '1 edisi'), P('Jadwal tinjauan konten tiap Selasa', 'tindak_lanjut'), P('Arsip foto kegiatan terkurasi', 'reguler', '200 foto')],
    },
    {
      hasil: [
        'Menerbitkan edisi khusus majalah berisi profil alumni pengajar dengan oplah 600 eksemplar.',
        'Menata ulang tata suara aula sehingga gema berkurang saat acara besar.',
        'Merintis siaran radio pagi berisi kosakata harian bahasa Arab dan Inggris.',
      ],
      kendala: [K('Harga kertas naik sehingga biaya cetak bertambah.', 'dana'), K('Jadwal siaran terganggu pemadaman listrik.', 'teknis')],
      solusi: ['Mengurangi halaman berwarna dan menjajaki sponsor unit usaha.', 'Menyiapkan UPS untuk perangkat siaran.'],
      programs: [P('Edisi majalah tematik ekonomi pesantren', 'unggulan', '600 eksemplar'), P('Podcast santri berprestasi', 'inovasi', '2 episode'), P('Pengadaan UPS ruang siaran', 'tindak_lanjut'), P('Siaran pagi kosakata', 'reguler', '24 siaran')],
    },
  ],
  pembinaan: [
    {
      hasil: [
        'Mengadakan pembinaan tahsin bagi 45 santri dengan ujian kenaikan level di akhir bulan; 31 santri naik level.',
        'Menyusun modul pembinaan organisasi mahasiswa berisi tata kelola rapat dan laporan keuangan sederhana.',
        'Menjalin kerja sama pengajar tamu dengan dua lembaga mitra di Kediri.',
      ],
      kendala: [K('Kehadiran peserta menurun menjelang ujian.', 'waktu'), K('Ruang pembinaan dipakai bersamaan dengan kegiatan lain.', 'sarpras')],
      solusi: ['Memindahkan jadwal pembinaan ke ba\'da Subuh pada pekan ujian.', 'Membuat jadwal pemakaian ruang bersama bagian terkait.'],
      programs: [P('Wisuda tahsin level dasar', 'unggulan', '30 santri'), P('Kelas daring pengajar tamu', 'inovasi', '2 sesi'), P('Jadwal pemakaian ruang bersama', 'tindak_lanjut'), P('Absensi pembinaan pekanan', 'reguler')],
    },
    {
      hasil: [
        'Membentuk forum komunikasi orang tua santri luar negeri melalui grup terkurasi dengan laporan perkembangan bulanan.',
        'Menyelenggarakan pelatihan kepemimpinan untuk pengurus baru dengan simulasi penyelesaian masalah.',
        'Merapikan basis data anggota dan kontak darurat seluruh peserta binaan.',
      ],
      kendala: [K('Perbedaan zona waktu menyulitkan koordinasi dengan wali santri.', 'koordinasi'), K('Pengurus baru belum memahami alur administrasi.', 'sdm')],
      solusi: ['Menetapkan jam layanan komunikasi tetap dua kali sepekan.', 'Pendampingan administrasi oleh pengurus lama selama satu bulan.'],
      programs: [P('Laporan perkembangan santri untuk wali', 'unggulan', 'Semua wali'), P('Formulir izin digital', 'inovasi'), P('Pendampingan pengurus baru', 'tindak_lanjut', '4 pertemuan'), P('Pembaruan data kontak darurat', 'reguler')],
    },
  ],
  yayasan: [
    {
      hasil: [
        'Menyelesaikan pengecoran lantai dua gedung asrama sisi timur sesuai jadwal dengan pengawasan mutu harian.',
        'Menerapkan kartu perawatan kendaraan sehingga jadwal servis tidak terlewat.',
        'Membuka petak kebun hidroponik percontohan untuk pasokan sayur Dapur Guru.',
      ],
      kendala: [K('Curah hujan tinggi menghambat pekerjaan luar ruang.', 'waktu'), K('Harga material besi naik.', 'dana')],
      solusi: ['Mengalihkan tenaga ke pekerjaan dalam ruang saat hujan.', 'Pembelian material sekaligus untuk dua bulan.'],
      programs: [P('Penyelesaian atap asrama sisi timur', 'unggulan', '100% rangka'), P('Panen perdana hidroponik', 'inovasi', '50 kg'), P('Pembelian material terjadwal', 'tindak_lanjut'), P('Servis kendaraan operasional', 'reguler', '6 unit')],
    },
    {
      hasil: [
        'Meningkatkan bobot rata-rata sapi penggemukan 0,8 kg per hari setelah perubahan pakan fermentasi.',
        'Memulai budidaya ikan lele sistem bioflok di dua kolam baru.',
        'Mencatat penggunaan bahan bakar kendaraan per perjalanan untuk menekan pemborosan.',
      ],
      kendala: [K('Pasokan pakan fermentasi kadang terlambat.', 'koordinasi'), K('Pompa air kolam sering mati.', 'teknis')],
      solusi: ['Membuat stok pakan cadangan dua pekan.', 'Mengganti pompa dengan unit hemat energi.'],
      programs: [P('Persiapan hewan kurban tahun ini', 'unggulan', '25 ekor'), P('Bioflok lele kolam ketiga', 'inovasi'), P('Stok pakan cadangan', 'tindak_lanjut', '2 pekan'), P('Rekap BBM per perjalanan', 'reguler')],
    },
  ],
  usaha: [
    {
      hasil: [
        'Meluncurkan produk baru dengan kemasan berlabel tanggal produksi; penjualan naik 18% dibanding bulan lalu.',
        'Menerapkan pencatatan kas harian digital sehingga selisih kas dapat dilacak per sif.',
        'Membuka layanan pesan-antar internal ke kantor bagian dengan formulir pesanan sederhana.',
      ],
      kendala: [K('Bahan baku utama sempat kosong dari distributor.', 'koordinasi'), K('Mesin produksi utama perlu perawatan.', 'sarpras')],
      solusi: ['Menambah satu distributor cadangan melalui Darul Ma\'rifat Distributor Center.', 'Jadwal perawatan mesin setiap Kamis bersama Bagian KUK Besi.'],
      programs: [P('Paket produk khusus kunjungan wali santri', 'unggulan', '300 paket'), P('Pembayaran nontunai di kasir', 'inovasi', '1 kasir'), P('Distributor cadangan bahan baku', 'tindak_lanjut'), P('Stok opname bulanan', 'reguler', '1 kali')],
    },
    {
      hasil: [
        'Menata ulang tata letak toko berdasarkan data barang terlaris; waktu belanja santri lebih singkat.',
        'Mengadakan pelatihan pelayanan pelanggan untuk 12 pramuniaga.',
        'Merintis kerja sama pemasok lokal Gurah untuk produk camilan.',
      ],
      kendala: [K('Antrean panjang saat jam istirahat.', 'teknis'), K('Modal persediaan terbatas menjelang akhir bulan.', 'dana')],
      solusi: ['Membuka kasir tambahan pada jam ramai.', 'Mengatur ulang siklus pembelian per dua pekan.'],
      programs: [P('Bazar produk unit usaha kampus', 'unggulan', '15 tenant'), P('Program poin loyalitas guru', 'inovasi'), P('Kasir tambahan jam ramai', 'tindak_lanjut'), P('Laporan laba rugi bulanan', 'reguler')],
    },
  ],
};

let idSeq = 0;
const uid = (p) => `${p}-${(++idSeq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function makeReport({ cycle, dept, rand, submitted, submittedIso, stages }) {
  const sets = CONTENT[clusterOf(dept.no)];
  const c = sets[(dept.no + cycle.hijri_month) % sets.length];
  const ts = (iso, h) => (iso ? `${iso}T${String(h).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00+07:00` : null);
  const base = {
    id: uid('rep'),
    cycle_id: cycle.id,
    department_id: dept.id,
    status: submitted ? 'terkirim' : 'belum_lapor',
    sekretaris_nama: dept.sekretaris_nama,
    ketua_nama: dept.ketua_nama,
    pembimbing_nama: dept.pembimbing_nama,
    hasil_usaha: [],
    kendala: [],
    solusi: [],
    programs: [],
    pernyataan_inovatif: false,
    submitted_at: null,
    rapat_bagian_at: stages.rapat ? ts(addDays(cycle.start_date, 15), 20) : null,
    draft_senior_at: stages.draft ? ts(addDays(cycle.start_date, 18), 10) : null,
    pembimbing_approved_at: stages.approved ? ts(addDays(cycle.start_date, 22), 9) : null,
    wapeng_received_at: stages.wapeng ? ts(submittedIso, 14) : null,
    catatan_admin: '',
  };
  if (!submitted) return base;
  return {
    ...base,
    hasil_usaha: [...c.hasil],
    kendala: c.kendala.map((k) => ({ ...k })),
    solusi: [...c.solusi],
    programs: c.programs.map((p, i) => ({ ...p, id: uid('prg'), urutan: i + 1 })),
    pernyataan_inovatif: true,
    submitted_at: ts(submittedIso, 8 + Math.floor(rand() * 10)),
  };
}

function makeCycle(month, year, periodId, status) {
  const r = hijriMonthRange(month, year);
  return {
    id: uid('cyc'),
    period_id: periodId,
    hijri_month: month,
    hijri_year: year,
    masehi_label: masehiLabelFor(r.start, r.end),
    start_date: r.start,
    end_date: r.end,
    deadline_date: r.deadline,
    status,
    active_week: null,
    opened_at: `${r.start}T07:00:00+07:00`,
  };
}

export function createDemoState(today) {
  idSeq = 0;
  const rand = rng(1448);
  const h = toHijri(today);
  const prev = prevHijriMonth(h.month, h.year);

  const ta = academicYearFor(h.month, h.year);
  const taPrev = academicYearFor(prev.month, prev.year);
  const periods = [{ id: uid('per'), ...ta, is_active: true }];
  if (taPrev.label_hijri !== ta.label_hijri) periods.push({ id: uid('per'), ...taPrev, is_active: false });

  const departments = DEPARTMENT_NAMES.map((nama, i) => {
    const no = i + 1;
    const pick = (arr, k) => arr[(no * 7 + k * 5) % arr.length];
    return {
      id: `dep-${String(no).padStart(2, '0')}`,
      no,
      nama,
      ketua_nama: `Ust. ${pick(FIRST, 1)} ${pick(LAST, 2)}`,
      ketua_wa: '',
      sekretaris_nama: `Ust. ${pick(FIRST, 3)} ${pick(LAST, 4)}`,
      sekretaris_wa: '',
      pembimbing_nama: `Ust. ${pick(FIRST, 5)} ${pick(LAST, 6)}`,
      has_access_code: false,
      is_active: true,
    };
  });

  const prevCycle = makeCycle(prev.month, prev.year, periods[periods.length - 1].id, 'arsip');
  const cycle = makeCycle(h.month, h.year, periods[0].id, 'aktif');

  const reports = [];
  // Bulan lalu: hampir semua sudah lapor.
  const prevLate = new Set([9, 26, 38, 47]);
  for (const d of departments) {
    const submitted = !prevLate.has(d.no);
    const day = 21 + Math.floor(rand() * 8);
    const iso = addDays(prevCycle.start_date, Math.min(day + (d.no % 7 === 0 ? 10 : 0), 33));
    reports.push(
      makeReport({
        cycle: prevCycle, dept: d, rand, submitted, submittedIso: iso,
        stages: { rapat: true, draft: true, approved: submitted, wapeng: submitted && d.no % 9 !== 0 },
      })
    );
  }
  // Bulan berjalan: sebagian sudah menginput softfile.
  const dayIndex = Math.max(0, Math.round((Date.parse(today) - Date.parse(cycle.start_date)) / 86400000));
  for (const d of departments) {
    const r = rand();
    const submitted = r < 0.6;
    const lastDay = Math.max(21, Math.min(dayIndex, 29));
    const iso = addDays(cycle.start_date, Math.min(21 + Math.floor(rand() * (lastDay - 20)), lastDay));
    const stages = submitted
      ? { rapat: true, draft: true, approved: true, wapeng: rand() < 0.45 }
      : { rapat: r < 0.85, draft: r < 0.75, approved: r < 0.66, wapeng: false };
    reports.push(makeReport({ cycle, dept: d, rand, submitted, submittedIso: iso, stages }));
  }

  return {
    version: 1,
    seededFor: today,
    periods,
    cycles: [cycle, prevCycle],
    departments,
    reports,
    queue: [],
  };
}

export const demoUid = uid;
