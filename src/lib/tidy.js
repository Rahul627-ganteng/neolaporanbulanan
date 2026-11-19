// Merapikan isi laporan: spasi, penomoran ketikan sendiri, huruf besar di awal,
// tanda baca, butir kosong/ganda, dan butir yang ditempel beberapa baris sekaligus.

const MARKER = /^\s*(?:\(?\d{1,2}[.)]|\(?[a-z][.)]|[-–—•*·▪●◦>]+)\s+/i;

/** Rapikan satu baris (tanpa menambah titik). */
export function tidyLine(s) {
  let t = String(s ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
  // Penomoran/bullet yang diketik sendiri (daftar sudah bernomor otomatis).
  for (let i = 0; i < 2 && MARKER.test(t); i++) t = t.replace(MARKER, '');
  t = t
    .replace(/\s+([,.;:!?])/g, '$1') // spasi sebelum tanda baca
    .replace(/([,;:])(?=[A-Za-z])/g, '$1 ') // spasi sesudah koma/titik koma
    .replace(/\.{4,}/g, '...')
    .replace(/([!?,;:])\1+/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
  if (/^[a-z]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
  return t;
}

/** Rapikan kalimat (hasil usaha, kendala, solusi, catatan): diakhiri titik bila belum ada tanda akhir. */
export function tidySentence(s) {
  const t = tidyLine(s);
  return t.length > 3 && /[\p{L}\p{N})"'”]$/u.test(t) ? `${t}.` : t;
}

/** Rapikan nama orang: spasi & huruf besar di awal kata yang diketik kecil semua. */
export function tidyName(s) {
  return tidyLine(s).replace(/(^|[\s.(])([a-z])([a-z']*)/g, (m, a, b, c) => a + b.toUpperCase() + c);
}

/** Rapikan judul (program kerja): tanpa titik di akhir. */
export function tidyTitle(s) {
  return tidyLine(s).replace(/[.;,]+$/, '');
}

const key = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Pecah butir yang berisi beberapa baris, rapikan, buang yang kosong & ganda. */
function tidyStrings(list, fn) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const parts = String(raw ?? '').split(/\r?\n+/);
    for (const p of parts) {
      const t = fn(p);
      if (!t || seen.has(key(t))) continue;
      seen.add(key(t));
      out.push(t);
    }
  }
  return out.length ? out : [''];
}

/** Rapikan seluruh isi formulir laporan. Mengembalikan { form, changes }. */
export function tidyReport(form) {
  const next = { ...form };
  next.sekretaris_nama = tidyName(form.sekretaris_nama || '');
  next.ketua_nama = tidyName(form.ketua_nama || '');
  next.pembimbing_nama = tidyName(form.pembimbing_nama || '');
  next.hasil_usaha = tidyStrings(form.hasil_usaha, tidySentence);
  next.solusi = tidyStrings(form.solusi, tidySentence);

  const kendala = [];
  const seenK = new Set();
  for (const k of form.kendala || []) {
    for (const p of String(k.teks ?? '').split(/\r?\n+/)) {
      const teks = tidySentence(p);
      if (!teks || seenK.has(key(teks))) continue;
      seenK.add(key(teks));
      kendala.push({ ...k, teks });
    }
  }
  next.kendala = kendala.length ? kendala : [{ teks: '', kategori: (form.kendala?.[0]?.kategori) || 'sdm' }];

  const programs = [];
  const seenP = new Set();
  for (const p of form.programs || []) {
    const judul = tidyTitle(p.judul);
    if (!judul || seenP.has(key(judul))) continue;
    seenP.add(key(judul));
    programs.push({ ...p, judul, target: tidyLine(p.target || '') });
  }
  next.programs = programs.length ? programs : [{ judul: '', kategori: 'unggulan', target: '' }];

  next.evaluasi = (form.evaluasi || []).map((e) => ({ ...e, catatan: e.catatan ? tidySentence(e.catatan) : e.catatan }));

  const changes = countChanges(form, next);
  return { form: next, changes };
}

function flat(f) {
  return [
    f.sekretaris_nama, f.ketua_nama, f.pembimbing_nama,
    ...(f.hasil_usaha || []), ...(f.solusi || []),
    ...(f.kendala || []).map((k) => `${k.kategori}|${k.teks}`),
    ...(f.programs || []).map((p) => `${p.kategori}|${p.judul}|${p.target || ''}`),
    ...(f.evaluasi || []).map((e) => e.catatan || ''),
  ].map((x) => String(x ?? ''));
}

function countChanges(a, b) {
  const x = flat(a);
  const y = flat(b);
  const setY = new Set(y);
  const setX = new Set(x);
  let n = 0;
  for (const s of x) if (!setY.has(s)) n += 1;
  for (const s of y) if (!setX.has(s)) n += 0; // perubahan sudah terhitung dari sisi lama
  return n || (x.length !== y.length ? Math.abs(x.length - y.length) : 0);
}
