// Konversi kalender Hijriah ↔ Masehi (dipakai frontend & Edge Function).
// Memakai Intl (kalender Umm al-Qura) bila tersedia, dengan cadangan
// perhitungan tabular. Hasilnya perkiraan: penetapan Kemenag (rukyat/hisab)
// bisa berbeda ±1 hari, karena itu tanggal siklus selalu dapat diedit admin.
import { HIJRI_MONTHS, GREGORIAN_MONTHS, WEEKDAYS, nextHijriMonth } from './rundown.js';

const DAY = 86400000;

export function parseISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  return toISO(new Date(parseISO(iso).getTime() + n * DAY));
}

export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

let intlFmt = null;
try {
  intlFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  const probe = intlFmt.formatToParts(new Date(Date.UTC(2026, 10, 3, 12)));
  const y = Number(probe.find((p) => p.type === 'year')?.value);
  if (!(y > 1400 && y < 1500)) intlFmt = null;
} catch {
  intlFmt = null;
}

// ---- cadangan tabular (Islamic civil) ----
const EPOCH = 1948439.5;
const jdFromIso = (iso) => parseISO(iso).getTime() / DAY + 2440587.5 - 0.5;
const isoFromJd = (jd) => toISO(new Date((jd - 2440587.5) * DAY + DAY / 2));
const tabularToJd = (y, m, d) =>
  d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + EPOCH - 1;

function tabularFromIso(iso) {
  const jd = Math.floor(jdFromIso(iso)) + 0.5;
  const year = Math.floor((30 * (jd - EPOCH) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jd - (29 + tabularToJd(year, 1, 1))) / 29.5) + 1);
  const day = jd - tabularToJd(year, month, 1) + 1;
  return { day, month, year };
}

/** Tanggal Hijriah dari 'YYYY-MM-DD'. */
export function toHijri(iso) {
  if (intlFmt) {
    const parts = intlFmt.formatToParts(parseISO(iso));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    return { day: get('day'), month: get('month'), year: get('year') };
  }
  return tabularFromIso(iso);
}

/** 'YYYY-MM-DD' Masehi untuk tanggal Hijriah tertentu. */
export function hijriToIso(year, month, day) {
  const estimate = isoFromJd(tabularToJd(year, month, day));
  for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const cand = addDays(estimate, off);
    const h = toHijri(cand);
    if (h.year === year && h.month === month && h.day === day) return cand;
  }
  return estimate;
}

/** Rentang satu bulan Hijriah + tenggat tanggal 5 bulan berikutnya. */
export function hijriMonthRange(month, year) {
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  const start = hijriToIso(year, month, 1);
  const nextStart = hijriToIso(next.year, next.month, 1);
  return { start, end: addDays(nextStart, -1), deadline: hijriToIso(next.year, next.month, 5) };
}

export function masehiLabelFor(startIso, endIso) {
  const a = startIso.slice(0, 4);
  const b = endIso.slice(0, 4);
  return a === b ? a : `${a}/${b}`;
}

/** Tahun ajaran Gontor dimulai bulan Syawal. */
export function academicYearFor(month, year) {
  const h = month >= 10 ? year : year - 1;
  const syawalStart = hijriToIso(h, 10, 1);
  const m = Number(syawalStart.slice(0, 4));
  return { label_hijri: `${h}-${h + 1}`, label_masehi: `${m}-${m + 1}` };
}

export function nextAcademicLabels(period) {
  const [h1] = period.label_hijri.split('-').map(Number);
  const [m1] = period.label_masehi.split('-').map(Number);
  return { label_hijri: `${h1 + 1}-${h1 + 2}`, label_masehi: `${m1 + 1}-${m1 + 2}` };
}

export function formatHijri(iso) {
  const h = toHijri(iso);
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} H`;
}

export function formatMasehi(iso, weekday = false) {
  const d = parseISO(iso);
  const s = `${d.getUTCDate()} ${GREGORIAN_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return weekday ? `${WEEKDAYS[d.getUTCDay()]}, ${s}` : s;
}

export function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(d);
  return `${formatMasehi(iso)} · ${time}`;
}

export function isoOfTimestamp(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(ts));
}

/**
 * Rencana pembukaan periode otomatis.
 * Laporan bulan M dikerjakan di akhir M dan dikumpulkan sampai tanggal 5 bulan M+1,
 * jadi siklus M tetap aktif sampai tenggatnya lewat. Sehari setelah tenggat,
 * bulan Hijriah yang sedang berjalan dibuka sebagai siklus baru (rundown
 * berjalan), sedangkan input softfile-nya baru dibuka tanggal 20 (input_open_date).
 * Mengembalikan null bila tidak perlu membuka apa pun.
 */
export function planCycleRollover({ active, latest, latestActivated, today }) {
  // Patokan tenggat: bulan aktif, kecuali ada bulan lebih baru yang pernah aktif
  // (admin mengaktifkan kembali bulan lama) — bulan baru baru dibuka setelah
  // tenggat bulan terbaru itu. Bulan yang hanya disiapkan (activated_at kosong)
  // tidak menjadi patokan agar tetap diaktifkan saat waktunya.
  const key = (c) => c.hijri_year * 12 + c.hijri_month;
  const cand = latestActivated || (latest && latest.activated_at ? latest : null);
  const newer = cand && (!active || key(cand) > key(active)) ? cand : null;
  const ref = newer || active || latest || null;
  if (ref && today <= ref.deadline_date) return null;
  const h = toHijri(today);
  let target = { month: h.month, year: h.year };
  if (ref) {
    const refKey = ref.hijri_year * 12 + ref.hijri_month;
    if (target.year * 12 + target.month <= refKey) {
      target = nextHijriMonth(ref.hijri_month, ref.hijri_year);
    }
  }
  const range = hijriMonthRange(target.month, target.year);
  // Bila admin menggeser akhir bulan sebelumnya (penetapan Kemenag), jangan tumpang tindih.
  let start = range.start;
  if (ref && ref.end_date >= start) start = addDays(ref.end_date, 1);
  if (start > range.end) start = range.end;
  const ta = academicYearFor(target.month, target.year);
  let open = inputOpenDateFor(target.month, target.year, range.deadline);
  if (open < start) open = start;
  return {
    hijri_month: target.month,
    hijri_year: target.year,
    masehi_label: masehiLabelFor(start, range.end),
    start_date: start,
    end_date: range.end,
    deadline_date: range.deadline,
    input_open_date: open,
    ta_masehi: ta.label_masehi,
    ta_hijri: ta.label_hijri,
  };
}

/** Input softfile laporan bulan M dibuka tanggal 20 bulan M (bawaan; admin dapat mengubah per bulan). */
export const INPUT_OPEN_DAY = 20;

export function inputOpenDateFor(month, year, deadlineIso) {
  const iso = hijriToIso(year, month, INPUT_OPEN_DAY);
  return deadlineIso && iso > deadlineIso ? deadlineIso : iso;
}

/** Tanggal buka input sebuah siklus (kolom input_open_date; cadangan: tanggal 20). */
export function cycleOpenDate(cycle) {
  if (!cycle) return null;
  return cycle.input_open_date || addDays(cycle.start_date, INPUT_OPEN_DAY - 1);
}

export function isInputOpen(cycle, today) {
  if (!cycle || cycle.input_closed_at) return false;
  const d = cycleOpenDate(cycle);
  return Boolean(d) && today >= d;
}

/** Status bulan untuk admin: aktif / belum aktif (disiapkan, belum pernah aktif) / arsip. */
export function cycleStateOf(cycle, today) {
  if (cycle.status === 'aktif') return 'aktif';
  // Bulan yang disiapkan tetapi belum pernah aktif dan belum lewat = belum aktif; bulan lama = arsip.
  return cycle.activated_at === null && (!today || cycle.end_date >= today) ? 'belum' : 'arsip';
}

/** "20 Jumadil Akhir 1448 H (Senin, 30 November 2026)" */
export function inputOpenText(cycle) {
  const d = cycleOpenDate(cycle);
  return d ? `${formatHijri(d)} (${formatMasehi(d, true)})` : '';
}

/** Urutan bulan untuk perbandingan (tahun × 12 + bulan). */
export const cycleKey = (c) => Number(c.hijri_year) * 12 + Number(c.hijri_month);

/** Siklus yang sedang dalam masa pengumpulan (sudah lewat akhir bulan, belum lewat tenggat). */
export function inCollectionWindow(cycle, today) {
  return Boolean(cycle && today > cycle.end_date && today <= cycle.deadline_date);
}
