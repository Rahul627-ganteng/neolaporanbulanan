// Direktori guru: pencarian nama & pembacaan Excel absen guru per angkatan.

// Sapaan/gelar di depan nama yang diabaikan saat mencari ("Ust. Ahmad" → "ahmad").
const PREFIX = /^(al[\s-]*)?(ustadz|ustad|ust|h|hj|kh|drs|dra|dr|ir|prof)\.?\s+/i;

/** Bentuk pembanding: huruf kecil, tanpa diakritik, tanpa gelar di belakang koma. */
export function normName(s) {
  let out = String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/,.*$/, '')
    .toLowerCase()
    .replace(/['’`ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (let i = 0; i < 3 && PREFIX.test(out); i += 1) out = out.replace(PREFIX, '');
  return out;
}

/** Cari guru: setiap kata yang diketik harus menjadi awal salah satu kata nama. */
export function searchTeachers(list, query, limit = 8) {
  const q = normName(query);
  if (!q) return [];
  const qt = q.split(' ');
  const scored = [];
  for (const t of list) {
    const n = t._n || (t._n = normName(t.nama));
    const words = n.split(' ');
    let score = 0;
    if (n.startsWith(q)) score = 3;
    else if (qt.every((w) => words.some((x) => x.startsWith(w)))) score = 2;
    else if (n.includes(q)) score = 1;
    if (score) scored.push([score, t]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].nama.length - b[1].nama.length || a[1].nama.localeCompare(b[1].nama));
  return scored.slice(0, limit).map((x) => x[1]);
}

export const isKnownTeacher = (list, nama) => {
  const n = normName(nama);
  return Boolean(n) && list.some((t) => (t._n || (t._n = normName(t.nama))) === n);
};

/**
 * Baca tabel dari Excel "Absen Guru per Angkatan": blok "Guru …" diikuti baris
 * judul "No | Nama | Tahun/Keterangan". Guru Senior dibuang.
 * Juga menerima tabel sederhana berkolom "Nama" (tanpa blok).
 */
export function parseTeacherTable(table) {
  let group = '';
  let nameCol = -1;
  let yearCol = -1;
  const seen = new Set();
  const teachers = [];
  let senior = 0;
  for (const raw of table) {
    const r = raw.map((c) => String(c ?? '').trim());
    const first = r[0] || '';
    const filled = r.filter(Boolean).length;
    if (/^guru\b/i.test(first) && filled === 1) {
      group = first.replace(/\s+/g, ' ');
      continue;
    }
    const lower = r.map((c) => c.toLowerCase());
    const ni = lower.findIndex((c) => c === 'nama' || c === 'nama guru' || c === 'nama lengkap');
    if (ni >= 0) {
      nameCol = ni;
      yearCol = lower.findIndex((c) => /^(tahun|angkatan|keterangan|ket\.?)$/.test(c));
      continue;
    }
    if (nameCol < 0) continue;
    const nama = (r[nameCol] || '').replace(/\s+/g, ' ').trim();
    if (!nama || /^\d+([.,]\d+)?$/.test(nama)) continue;
    if (r[0] && !/^\d+$/.test(r[0]) && nameCol !== 0) continue;
    const tahun = yearCol >= 0 ? r[yearCol] || '' : '';
    if (/senior/i.test(group) || /senior/i.test(tahun)) {
      senior += 1;
      continue;
    }
    const key = normName(nama) || nama.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    teachers.push({ nama, kelompok: group || null, tahun: /^[ivxl]+$/i.test(tahun) ? tahun.toUpperCase() : null });
  }
  return { teachers, senior };
}

/** Ringkasan per kelompok untuk pratinjau impor. */
export function groupCounts(teachers) {
  const m = new Map();
  for (const t of teachers) m.set(t.kelompok || 'Tanpa kelompok', (m.get(t.kelompok || 'Tanpa kelompok') || 0) + 1);
  return [...m.entries()];
}
