// =====================================================================
//  SUMBER TUNGGAL ATURAN RUNDOWN & TEMPLATE PESAN
//  Dipakai bersama oleh frontend (Vite/React) dan Edge Function (Deno),
//  sehingga isi pengingat otomatis (pg_cron) dan pengingat manual admin
//  selalu identik. File ini harus tetap JavaScript murni tanpa dependensi.
// =====================================================================

export const INSTITUTION = {
  sektor: 'Sektor Guru KMI',
  nama: 'Pondok Modern Darussalam Gontor Kampus 3',
  kampus: "Darul Ma'rifat Sumbercangkring Gurah Kediri",
  singkat: "PMDG Kampus 3 Darul Ma'rifat",
};

export const HIJRI_MONTHS = [
  'Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir',
  'Rajab', "Sya'ban", 'Ramadhan', 'Syawal', "Dzulqa'dah", 'Dzulhijjah',
];

export const GREGORIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Penamaan hari ala pesantren: Ahad, bukan Minggu.
export const WEEKDAYS = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

export const RUNDOWN = [
  {
    week: 1,
    title: 'Minggu Pertama',
    items: [
      'Pengumpulan laporan bulanan bagian (selambatnya tanggal 5 Hijriah di awal bulan berikutnya jika belum terlaksana di minggu keempat bulan yang lalu)',
      'Pelaksanaan program kerja bagian',
      'Monitoring program kerja bagian',
    ],
  },
  {
    week: 2,
    title: 'Minggu Kedua',
    items: ['Pelaksanaan program kerja bagian', 'Monitoring program kerja bagian'],
  },
  {
    week: 3,
    title: 'Minggu Ketiga',
    items: [
      'Pelaksanaan program kerja bagian & monitoring program kerja bagian',
      'Evaluasi pelaksanaan program kerja',
      'Perkumpulan bagian membahas program kerja bagian untuk bulan berikutnya',
      'Pelaporan laporan bulanan berisi hasil usaha dan rancangan program kerja bulan berikutnya ke Pembimbing dari Guru Senior melalui hardfile',
    ],
  },
  {
    week: 4,
    title: 'Minggu Keempat',
    items: [
      'Pelaporan laporan bulanan yang sudah direvisi ke pembimbing bagian dengan hardfile',
      'Input laporan bulanan yang sudah disetujui oleh pembimbing ke softfile laporan bulanan di portal',
      'Pelaporan laporan bulanan ke Staf Sekretaris Wakil Pengasuh secara hardfile',
    ],
  },
];

// Tahapan yang dilacak per bagian (kolom timestamp di tabel monthly_reports).
export const STAGES = [
  { key: 'rapat_bagian_at', label: 'Perkumpulan bagian membahas program bulan depan', short: 'Rapat bagian', week: 3 },
  { key: 'draft_senior_at', label: 'Hardfile draf ke Pembimbing Guru Senior', short: 'Draf ke Senior', week: 3 },
  { key: 'pembimbing_approved_at', label: 'Revisi disetujui Pembimbing Bagian', short: 'Disetujui', week: 4 },
  { key: 'submitted_at', label: 'Softfile diinput di portal', short: 'Softfile', week: 4 },
  { key: 'wapeng_received_at', label: 'Hardfile diterima Staf Sekretaris Wakil Pengasuh', short: 'Hardfile Wapeng', week: 4 },
];

export const PROGRAM_CATEGORIES = [
  { key: 'unggulan', emoji: '🌟', label: 'Program Unggulan / Prioritas Utama', short: 'Unggulan' },
  { key: 'inovasi', emoji: '🚀', label: 'Program Inovasi Baru', short: 'Inovasi' },
  { key: 'tindak_lanjut', emoji: '🛠️', label: 'Tindak Lanjut Solusi Prioritas', short: 'Tindak lanjut' },
  { key: 'reguler', emoji: '📌', label: 'Program Reguler Terukur', short: 'Reguler' },
];

export const KENDALA_CATEGORIES = [
  { key: 'sdm', label: 'SDM & personalia' },
  { key: 'dana', label: 'Dana & anggaran' },
  { key: 'sarpras', label: 'Sarana & prasarana' },
  { key: 'waktu', label: 'Waktu & jadwal' },
  { key: 'koordinasi', label: 'Koordinasi & komunikasi' },
  { key: 'teknis', label: 'Teknis & operasional' },
  { key: 'lainnya', label: 'Lainnya' },
];

export const programCategory = (key) =>
  PROGRAM_CATEGORIES.find((c) => c.key === key) || PROGRAM_CATEGORIES[3];
export const kendalaCategory = (key) =>
  KENDALA_CATEGORIES.find((c) => c.key === key) || KENDALA_CATEGORIES[6];

// ---------- tanggal (string 'YYYY-MM-DD', dihitung pada UTC agar bebas zona) ----------
const parseISO = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

export function formatGregorian(iso, withWeekday = false) {
  if (!iso) return '-';
  const dt = parseISO(iso);
  const s = `${dt.getUTCDate()} ${GREGORIAN_MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAYS[dt.getUTCDay()]}, ${s}` : s;
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000);
}

export function nextHijriMonth(month, year) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

export function prevHijriMonth(month, year) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

/** "Jumadil Awal 1448 H / 2026 M" */
export function cycleLabel(cycle) {
  if (!cycle) return '-';
  return `${HIJRI_MONTHS[cycle.hijri_month - 1]} ${cycle.hijri_year} H / ${cycle.masehi_label} M`;
}

export function cycleMonthName(cycle) {
  return cycle ? HIJRI_MONTHS[cycle.hijri_month - 1] : '-';
}

/** Bulan untuk "Program Kerja Satu Bulan ke Depan". */
export function nextMonthLabel(cycle) {
  if (!cycle) return '-';
  const n = nextHijriMonth(cycle.hijri_month, cycle.hijri_year);
  return `${HIJRI_MONTHS[n.month - 1]} ${n.year} H`;
}

/** "5 Jumadil Akhir 1448 H (Ahad, 15 November 2026)" */
export function deadlineText(cycle) {
  if (!cycle) return '-';
  const n = nextHijriMonth(cycle.hijri_month, cycle.hijri_year);
  return `5 ${HIJRI_MONTHS[n.month - 1]} ${n.year} H (${formatGregorian(cycle.deadline_date, true)})`;
}

/** Minggu rundown (1-4) berdasarkan tanggal mulai siklus; tanggal 22 dst. = Minggu 4. */
export function computeWeek(cycle, todayIso) {
  if (!cycle) return 1;
  if (cycle.active_week) return cycle.active_week;
  const diff = daysBetween(cycle.start_date, todayIso);
  if (diff < 0) return 1;
  return Math.min(4, Math.floor(diff / 7) + 1);
}

// ---------- WhatsApp ----------
export function normalizeWa(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

export function formatWa(phone) {
  const p = normalizeWa(phone);
  if (!p) return '';
  const local = '0' + p.slice(2);
  return local.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

export function waLink(phone, text) {
  const p = normalizeWa(phone);
  const q = `text=${encodeURIComponent(text)}`;
  return p ? `https://wa.me/${p}?${q}` : `https://wa.me/?${q}`;
}

export const ROLE_LABEL = { ketua: 'Ketua', sekretaris: 'Sekretaris' };

/**
 * Kebijakan antrean pengingat per minggu (dipakai pg_cron & tombol admin):
 *  - Minggu 1: bagian yang laporan bulan lalunya belum masuk (tenggat tgl 5).
 *  - Minggu 2: Ketua seluruh bagian (pelaksanaan & monitoring program).
 *  - Minggu 3: Ketua seluruh bagian (evaluasi, rapat, draf ke Guru Senior).
 *  - Minggu 4: bagian yang softfile bulan ini belum masuk.
 */
export const REMINDER_POLICY = {
  1: { scope: 'belum', reportCycle: 'prev', roles: ['sekretaris', 'ketua'] },
  2: { scope: 'semua', reportCycle: 'current', roles: ['ketua'] },
  3: { scope: 'semua', reportCycle: 'current', roles: ['ketua'] },
  4: { scope: 'belum', reportCycle: 'current', roles: ['sekretaris', 'ketua'] },
};

/**
 * Pesan pengingat mingguan yang menyesuaikan agenda minggu aktif.
 * cycle        = siklus berjalan (judul & agenda)
 * reportCycle  = siklus laporan yang ditagih (Minggu 1 = bulan lalu); default cycle
 * programs     = Program Kerja Satu Bulan ke Depan dari laporan bulan lalu
 *                (yaitu target bulan berjalan), opsional.
 */
export function buildReminderMessage({ week, role, department, cycle, reportCycle, reportSubmitted, programs = [], portalUrl = '' }) {
  const rd = RUNDOWN.find((r) => r.week === week) || RUNDOWN[0];
  const billed = reportCycle || cycle;
  const nama = role === 'ketua' ? department.ketua_nama : department.sekretaris_nama;
  const sapaan = nama ? `Ust. ${nama.replace(/^Ust\.?\s*/i, '')}` : `${ROLE_LABEL[role]} Bagian`;
  const lines = [
    "Assalamu'alaikum warahmatullahi wabarakatuh.",
    `Yth. ${sapaan}, ${ROLE_LABEL[role]} ${department.nama}.`,
    '',
    `*Pengingat Rundown Laporan Bulanan ${INSTITUTION.sektor}*`,
    `Bulan ${cycleLabel(cycle)} · *${rd.title}*`,
    '',
    'Agenda pekan ini:',
    ...rd.items.map((t, i) => `${i + 1}. ${t}`),
  ];

  if ((week === 4 || week === 1) && billed) {
    lines.push('');
    const which = billed === cycle ? 'bulan ini' : `bulan ${cycleMonthName(billed)} ${billed.hijri_year} H`;
    lines.push(
      reportSubmitted
        ? `Status softfile laporan ${which}: *SUDAH DIINPUT*. Jazakumullah khairan, mohon pastikan hardfile juga sampai ke Staf Sekretaris Wakil Pengasuh.`
        : `Status softfile laporan ${which}: *BELUM DIINPUT*.`
    );
    lines.push(`Tenggat: ${deadlineText(billed)}.`);
  }

  if (week === 3) {
    lines.push('');
    lines.push(`Mohon jadwalkan perkumpulan bagian untuk menyusun program kerja ${nextMonthLabel(cycle)} dan serahkan draf hardfile kepada Pembimbing Guru Senior.`);
  }

  const targets = programs.filter((p) => p && p.judul);
  if (targets.length && week <= 3) {
    lines.push('');
    lines.push('Target program kerja bulan ini:');
    const ordered = [...targets].sort((a, b) => (a.kategori === 'unggulan' ? -1 : 0) - (b.kategori === 'unggulan' ? -1 : 0));
    ordered.slice(0, 6).forEach((p, i) => {
      const c = programCategory(p.kategori);
      lines.push(`${i + 1}. ${c.emoji} ${p.judul}${p.target ? ` (target: ${p.target})` : ''}`);
    });
  }

  if (portalUrl) {
    lines.push('');
    lines.push(`Portal laporan: ${portalUrl}`);
  }
  lines.push('');
  lines.push('Jazakumullah khairan katsiran.');
  lines.push(`— Admin Laporan Bulanan ${INSTITUTION.sektor}`);
  return lines.join('\n');
}

/** Teks siap tempel ke grup WhatsApp KMI. */
export function buildBelumLaporText({ cycle, departments, total, portalUrl = '' }) {
  const lines = [
    '*DAFTAR BAGIAN YANG BELUM MENGUMPULKAN LAPORAN BULANAN*',
    `${INSTITUTION.sektor} · ${INSTITUTION.singkat}`,
    `Bulan: ${cycleLabel(cycle)}`,
    `Tenggat: ${deadlineText(cycle)}`,
    '',
  ];
  if (!departments.length) {
    lines.push('Alhamdulillah, seluruh bagian telah menginput softfile laporan bulanan.');
  } else {
    departments.forEach((d, i) => lines.push(`${i + 1}. ${d.nama}`));
    lines.push('');
    lines.push(`Jumlah: ${departments.length} dari ${total} bagian belum menginput softfile.`);
    lines.push('Mohon segera menginput laporan yang telah disetujui Pembimbing Bagian.');
  }
  if (portalUrl) lines.push(`Portal: ${portalUrl}`);
  lines.push('');
  lines.push('Jazakumullah khairan.');
  return lines.join('\n');
}

/** Teks kartu pengingat untuk dikirim ke Ketua & Sekretaris. */
export function buildProgramCardText({ department, cycle, programs, ketua, sekretaris }) {
  const lines = [
    `*KARTU PENGINGAT TARGET PROGRAM — ${department.nama.toUpperCase()}*`,
    `Program kerja ${nextMonthLabel(cycle)} (dari laporan bulan ${cycleLabel(cycle)})`,
    '',
  ];
  const ordered = [...programs].sort((a, b) => order(a.kategori) - order(b.kategori));
  ordered.forEach((p, i) => {
    const c = programCategory(p.kategori);
    lines.push(`${i + 1}. ${c.emoji} ${p.judul}${p.target ? ` — target: ${p.target}` : ''}`);
  });
  lines.push('');
  lines.push(`Ketua: ${ketua || '-'} · Sekretaris: ${sekretaris || '-'}`);
  lines.push('Semoga Allah memudahkan. Barakallahu fiikum.');
  return lines.join('\n');
}

function order(k) {
  return ['unggulan', 'inovasi', 'tindak_lanjut', 'reguler'].indexOf(k);
}

/**
 * Susun antrean pengingat untuk satu minggu (dipakai Edge Function & Panel Admin).
 * reportByDept / prevReportByDept: Map(department_id → {submitted_at})
 * targetsByDept: Map(department_id → programs[]) dari laporan bulan lalu.
 */
export function planReminderQueue({
  week, cycle, prevCycle, departments, reportByDept, prevReportByDept, targetsByDept, today, portalUrl = '',
}) {
  const policy = REMINDER_POLICY[week] || REMINDER_POLICY[1];
  const billPrev = policy.reportCycle === 'prev';
  const billed = billPrev ? prevCycle : cycle;
  if (billPrev && (!prevCycle || (today && today > prevCycle.deadline_date))) return [];
  const reports = billPrev ? prevReportByDept : reportByDept;
  const items = [];
  for (const d of departments) {
    if (d.is_active === false) continue;
    const submitted = Boolean(reports?.get(d.id)?.submitted_at);
    if (policy.scope === 'belum' && submitted) continue;
    for (const role of policy.roles) {
      const phone = normalizeWa(role === 'ketua' ? d.ketua_wa : d.sekretaris_wa);
      items.push({
        department_id: d.id,
        week,
        target_role: role,
        phone: phone || null,
        message: buildReminderMessage({
          week, role, department: d, cycle, reportCycle: billed, reportSubmitted: submitted,
          programs: targetsByDept?.get(d.id) || [], portalUrl,
        }),
      });
    }
  }
  return items;
}
