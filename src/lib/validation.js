// Validasi formulir laporan. Detektor rutinitas memberi peringatan bila
// "Hasil Usaha" terbaca sebagai kegiatan rutin, bukan program inovatif.

const ROUTINE_PATTERNS = [
  [/\brutin(itas)?\b/i, 'rutin'],
  [/seperti biasa(nya)?/i, 'seperti biasa'],
  [/sebagaimana biasa(nya)?/i, 'sebagaimana biasanya'],
  [/\bsetiap (hari|pagi|sore|malam|pekan|minggu|bulan)\b/i, 'setiap hari/pekan'],
  [/\bharian\b/i, 'harian'],
  [/\bpiket\b/i, 'piket'],
  [/\bmenjalankan tugas\b/i, 'menjalankan tugas'],
  [/\bmelaksanakan tugas\b/i, 'melaksanakan tugas'],
  [/\bjaga (malam|pos|kantor)\b/i, 'jaga'],
  [/\bmembersihkan\b/i, 'membersihkan'],
  [/\bbersih-bersih\b/i, 'bersih-bersih'],
  [/\bkegiatan biasa\b/i, 'kegiatan biasa'],
  [/\bmelayani (tamu|pembeli|santri)\b/i, 'melayani'],
  [/\bberjalan (lancar|dengan baik)\b/i, 'berjalan lancar'],
];

/** Kata pemicu rutinitas yang ditemukan dalam teks. */
export function routineHits(text) {
  const hits = [];
  for (const [re, label] of ROUTINE_PATTERNS) if (re.test(text || '')) hits.push(label);
  return hits;
}

const clean = (arr) => arr.map((s) => (typeof s === 'string' ? s.trim() : s)).filter(Boolean);

export function validateReport(form, { requireCode = false } = {}) {
  const errors = [];
  const warnings = [];
  if (!form.department_id) errors.push('Pilih bagian terlebih dahulu.');
  if (requireCode && !form.access_code) errors.push('Masukkan kode akses bagian.');
  if (!form.sekretaris_nama?.trim()) errors.push('Nama Sekretaris Bagian wajib diisi.');
  if (!form.ketua_nama?.trim()) errors.push('Nama Ketua Bagian wajib diisi.');
  if (!form.pembimbing_nama?.trim()) errors.push('Nama Pembimbing Bagian wajib diisi.');

  const hasil = clean(form.hasil_usaha);
  if (!hasil.length) errors.push('Isi minimal satu Hasil Usaha.');
  hasil.forEach((h, i) => {
    if (h.length < 25) warnings.push(`Hasil Usaha ${i + 1} terlalu singkat; jelaskan program yang terlaksana dan hasilnya.`);
    const r = routineHits(h);
    if (r.length) warnings.push(`Hasil Usaha ${i + 1} terbaca sebagai rutinitas (${r.join(', ')}).`);
  });

  const kendala = form.kendala.filter((k) => k.teks.trim());
  const solusi = clean(form.solusi);
  if (kendala.length && !solusi.length) errors.push('Setiap kendala perlu solusi; isi minimal satu Solusi dari Kendala.');

  const programs = form.programs.filter((p) => p.judul.trim());
  if (!programs.length) errors.push('Isi minimal satu Program Kerja Satu Bulan ke Depan.');
  if (programs.length && !programs.some((p) => p.kategori === 'unggulan'))
    warnings.push('Belum ada program bertanda 🌟 Program Unggulan / Prioritas Utama.');

  if (!form.pernyataan_inovatif) errors.push('Centang pernyataan bahwa laporan sudah disetujui Pembimbing dan Hasil Usaha bersifat inovatif.');
  return { errors, warnings };
}

/** Bentuk payload yang dikirim ke adapter / RPC submit_report. */
export function toPayload(form) {
  return {
    sekretaris_nama: form.sekretaris_nama.trim(),
    ketua_nama: form.ketua_nama.trim(),
    pembimbing_nama: form.pembimbing_nama.trim(),
    hasil_usaha: clean(form.hasil_usaha),
    kendala: form.kendala.filter((k) => k.teks.trim()).map((k) => ({ teks: k.teks.trim(), kategori: k.kategori })),
    solusi: clean(form.solusi),
    programs: form.programs
      .filter((p) => p.judul.trim())
      .map((p) => ({ judul: p.judul.trim(), kategori: p.kategori, target: p.target?.trim() || '' })),
    pernyataan_inovatif: Boolean(form.pernyataan_inovatif),
  };
}
