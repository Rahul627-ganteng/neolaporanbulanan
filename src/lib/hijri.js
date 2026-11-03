// Konversi kalender Hijriah ↔ Masehi.
// Memakai Intl (kalender Umm al-Qura) bila tersedia, dengan cadangan
// perhitungan tabular. Hasilnya perkiraan: penetapan Kemenag (rukyat/hisab)
// bisa berbeda ±1 hari, karena itu tanggal siklus selalu dapat diedit admin.
import { HIJRI_MONTHS, GREGORIAN_MONTHS, WEEKDAYS } from './constants.js';

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
