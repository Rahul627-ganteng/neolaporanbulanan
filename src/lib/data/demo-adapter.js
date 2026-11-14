// Adapter Mode Demo: seluruh data disimpan di memori + localStorage peramban
// (khusus pengguna ini). Antarmukanya identik dengan supabase-adapter.js.
import { createDemoState, createDemoTeachers, demoUid } from './demo-seed.js';
import { normalizeWa } from '../constants.js';
import { todayIso } from '../hijri.js';

const KEY = 'kmi-laporan-demo-v4';
const clone = (v) => JSON.parse(JSON.stringify(v));

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 4) return s;
    }
  } catch {
    /* penyimpanan tidak tersedia */
  }
  return createDemoState(todayIso());
}

export function createDemoAdapter() {
  let db = load();
  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* abaikan */
    }
  };
  const findReport = (id) => db.reports.find((r) => r.id === id);

  return {
    mode: 'demo',
    async getSession() {
      return { email: 'admin.demo@kmi', isAdmin: true };
    },
    onAuthChange() {
      return () => {};
    },
    async signIn() {
      return { email: 'admin.demo@kmi', isAdmin: true };
    },
    async signOut() {},

    async loadBase() {
      return clone({ periods: db.periods, cycles: db.cycles, departments: db.departments });
    },
    async loadCycle(cycleId) {
      return clone(db.reports.filter((r) => r.cycle_id === cycleId));
    },
    async loadQueue(cycleId) {
      return clone(db.queue.filter((q) => q.cycle_id === cycleId));
    },

    async saveDepartment(dept) {
      const clean = {
        ...dept,
        ketua_wa: normalizeWa(dept.ketua_wa),
        sekretaris_wa: normalizeWa(dept.sekretaris_wa),
      };
      const i = db.departments.findIndex((d) => d.id === dept.id);
      if (i >= 0) db.departments[i] = { ...db.departments[i], ...clean };
      else db.departments.push({ ...clean, id: demoUid('dep'), has_access_code: false, is_active: true });
      persist();
      return clone(clean);
    },
    async setAccessCode(deptId, code) {
      const d = db.departments.find((x) => x.id === deptId);
      const kode = String(code || '').trim().toUpperCase();
      if (d) {
        d.has_access_code = true;
        d.kode_pribadi_at = null;
      }
      (db.passwords ||= {})[deptId] = kode;
      (db.codes ||= {})[deptId] = { kode, sumber: 'admin', updated_at: new Date().toISOString() };
      persist();
    },

    async createPeriod({ label_masehi, label_hijri }) {
      if (db.periods.some((p) => p.label_hijri === label_hijri)) throw new Error(`Tahun ajaran ${label_hijri} sudah ada.`);
      const p = { id: demoUid('per'), label_masehi, label_hijri, is_active: false };
      db.periods.push(p);
      persist();
      return clone(p);
    },
    async activatePeriod(id) {
      db.periods.forEach((p) => (p.is_active = p.id === id));
      persist();
    },

    async openCycle({ period_id, hijri_month, hijri_year, masehi_label, start_date, end_date, deadline_date }) {
      if (db.cycles.some((c) => c.hijri_month === hijri_month && c.hijri_year === hijri_year))
        throw new Error('Periode bulan tersebut sudah pernah dibuka.');
      db.cycles.forEach((c) => {
        if (c.status === 'aktif') {
          c.status = 'arsip';
          c.archived_at = new Date().toISOString();
        }
      });
      db.periods.forEach((p) => (p.is_active = p.id === period_id));
      const cycle = {
        id: demoUid('cyc'), period_id, hijri_month, hijri_year, masehi_label,
        start_date, end_date, deadline_date, status: 'aktif', active_week: null,
        opened_at: new Date().toISOString(),
      };
      db.cycles.unshift(cycle);
      for (const d of db.departments.filter((x) => x.is_active !== false)) {
        db.reports.push({
          id: demoUid('rep'), cycle_id: cycle.id, department_id: d.id, status: 'belum_lapor',
          sekretaris_nama: d.sekretaris_nama, ketua_nama: d.ketua_nama, pembimbing_nama: d.pembimbing_nama,
          hasil_usaha: [], kendala: [], solusi: [], programs: [], pernyataan_inovatif: false,
          submitted_at: null, rapat_bagian_at: null, draft_senior_at: null, pembimbing_approved_at: null,
          wapeng_received_at: null, catatan_admin: '',
        });
      }
      persist();
      return cycle.id;
    },
    async updateCycle(cycleId, patch) {
      const c = db.cycles.find((x) => x.id === cycleId);
      if (c) Object.assign(c, patch);
      persist();
    },

    async submitReport({ cycleId, departmentId, payload }) {
      let r = db.reports.find((x) => x.cycle_id === cycleId && x.department_id === departmentId);
      if (!r) {
        r = { id: demoUid('rep'), cycle_id: cycleId, department_id: departmentId };
        db.reports.push(r);
      }
      const now = new Date().toISOString();
      Object.assign(r, {
        status: 'terkirim',
        sekretaris_nama: payload.sekretaris_nama,
        ketua_nama: payload.ketua_nama,
        pembimbing_nama: payload.pembimbing_nama,
        hasil_usaha: payload.hasil_usaha,
        kendala: payload.kendala,
        solusi: payload.solusi,
        evaluasi_program: payload.evaluasi_program || [],
        pernyataan_inovatif: true,
        programs: payload.programs.map((p, i) => ({ ...p, id: demoUid('prg'), urutan: i + 1 })),
        submitted_at: r.submitted_at || now,
        pembimbing_approved_at: r.pembimbing_approved_at || now,
      });
      // Pejabat bagian diingat dari laporan terbaru (sama dengan trigger di database).
      const d = db.departments.find((x) => x.id === departmentId);
      if (d) {
        d.sekretaris_nama = payload.sekretaris_nama || d.sekretaris_nama;
        d.ketua_nama = payload.ketua_nama || d.ketua_nama;
        d.pembimbing_nama = payload.pembimbing_nama || d.pembimbing_nama;
      }
      persist();
      return clone(r);
    },
    async setStage(reportId, key, on) {
      const r = findReport(reportId);
      if (r) r[key] = on ? new Date().toISOString() : null;
      persist();
    },
    async setProgramCategory(programId, kategori) {
      for (const r of db.reports) {
        const p = (r.programs || []).find((x) => x.id === programId);
        if (p) p.kategori = kategori;
      }
      persist();
    },

    async enqueue(cycleId, items, source = 'admin') {
      let added = 0;
      for (const it of items) {
        const dup = db.queue.some(
          (q) => q.cycle_id === cycleId && q.department_id === it.department_id && q.week === it.week && q.target_role === it.target_role
        );
        if (dup) continue;
        db.queue.push({ ...it, id: demoUid('q'), cycle_id: cycleId, status: 'pending', source, created_at: new Date().toISOString() });
        added += 1;
      }
      persist();
      return added;
    },
    async setQueueStatus(id, status) {
      const q = db.queue.find((x) => x.id === id);
      if (q) {
        q.status = status;
        q.sent_at = status === 'sent' ? new Date().toISOString() : null;
      }
      persist();
    },
    async clearQueue(cycleId) {
      db.queue = db.queue.filter((q) => q.cycle_id !== cycleId || q.status === 'sent');
      persist();
    },

    async generateAccessCodes(onlyMissing = true) {
      const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const rows = [];
      for (const d of [...db.departments].sort((a, b) => a.no - b.no)) {
        if (d.is_active === false || (onlyMissing && d.has_access_code)) continue;
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        const kode = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
        d.has_access_code = true;
        d.kode_pribadi_at = null;
        (db.passwords ||= {})[d.id] = kode;
        (db.codes ||= {})[d.id] = { kode, sumber: 'admin', updated_at: new Date().toISOString() };
        rows.push({ department_id: d.id, no: d.no, nama: d.nama, kode });
      }
      persist();
      return rows;
    },

    async listAdmins() {
      db.admins ||= [{ email: 'admin.demo@kmi', catatan: 'Akun demo', punya_akun: true, terakhir_masuk: new Date().toISOString() }];
      return clone(db.admins);
    },
    async addAdmin(email, catatan) {
      db.admins ||= [];
      const e = email.trim().toLowerCase();
      if (!db.admins.some((a) => a.email === e)) db.admins.push({ email: e, catatan: catatan || '', punya_akun: true, terakhir_masuk: null });
      persist();
      return { email: e, created: true, password: 'DemoSandi2026' };
    },
    async resetAdminPassword(email) {
      return { email, password: 'DemoSandiBaru1' };
    },
    async removeAdmin(email) {
      if (email === 'admin.demo@kmi') throw new Error('Anda tidak dapat menghapus akun admin Anda sendiri');
      db.admins = (db.admins || []).filter((a) => a.email !== email);
      persist();
    },
    async changePassword() {},

    // ----- akun bagian (demo: sandi apa saja ≥ 6 karakter sampai bagian menggantinya) -----
    async departmentLogin(departmentId, password) {
      const d = db.departments.find((x) => x.id === departmentId && x.is_active !== false);
      if (!d) throw new Error('Bagian tidak ditemukan.');
      const pw = String(password || '').trim().toUpperCase();
      const own = db.passwords?.[departmentId];
      db.kodeAwal ??= 'DEMO123';
      const viaOwn = Boolean(own) && pw === own;
      const viaShared = !viaOwn && !d.kode_pribadi_at && Boolean(db.kodeAwal) && pw === db.kodeAwal;
      if (!viaOwn && !viaShared) {
        throw new Error(d.kode_pribadi_at ? 'Kode salah. Bagian ini sudah membuat kode sendiri; bila lupa, minta admin mengatur ulang.' : `Kode salah. Mode demo: kode awal bersama ${db.kodeAwal}.`);
      }
      const token = `demo-${Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
      db.sessions ||= {};
      db.sessions[token] = departmentId;
      if (viaShared) (db.pendingSetup ||= {})[token] = true;
      persist();
      return {
        token,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        department: { id: d.id, no: d.no, nama: d.nama },
        perlu_setup: viaShared || !d.profil_at,
        kode_bersama: viaShared,
      };
    },
    async departmentSetup(token, profile, newCode) {
      const id = db.sessions?.[token];
      if (!id) throw new Error('Sesi bagian berakhir. Silakan masuk lagi.');
      const d = db.departments.find((x) => x.id === id);
      const kw = normalizeWa(profile.ketua_wa);
      const sw = normalizeWa(profile.sekretaris_wa);
      const kode = String(newCode || '').trim().toUpperCase();
      if (!profile.ketua_nama?.trim() && !profile.sekretaris_nama?.trim()) throw new Error('Isi nama Ketua atau Sekretaris Bagian.');
      if ((kw && !/^62\d{8,13}$/.test(kw)) || (sw && !/^62\d{8,13}$/.test(sw))) throw new Error('Nomor WA tidak valid. Gunakan format 08xx atau 628xx.');
      if (!kw && !sw) throw new Error('Isi minimal satu nomor WA yang bisa dihubungi.');
      if (db.pendingSetup?.[token] && !kode) throw new Error('Buat kode akses baru untuk bagian Anda (minimal 6 karakter).');
      if (kode && kode.length < 6) throw new Error('Kode akses minimal 6 karakter.');
      if (kode && kode === db.kodeAwal) throw new Error('Kode baru tidak boleh sama dengan kode awal bersama.');
      Object.assign(d, {
        ketua_nama: profile.ketua_nama?.trim() || d.ketua_nama,
        sekretaris_nama: profile.sekretaris_nama?.trim() || d.sekretaris_nama,
        pembimbing_nama: profile.pembimbing_nama?.trim() || d.pembimbing_nama,
        ketua_wa: kw || d.ketua_wa,
        sekretaris_wa: sw || d.sekretaris_wa,
        profil_at: new Date().toISOString(),
      });
      if (kode) {
        (db.passwords ||= {})[id] = kode;
        (db.codes ||= {})[id] = { kode, sumber: 'bagian', updated_at: new Date().toISOString() };
        d.kode_pribadi_at = new Date().toISOString();
        d.has_access_code = true;
        for (const [t, dep] of Object.entries(db.sessions)) if (dep === id && t !== token) delete db.sessions[t];
      }
      if (db.pendingSetup) delete db.pendingSetup[token];
      persist();
      return { ok: true, kode_diganti: Boolean(kode) };
    },
    async loadAccessOverview() {
      db.kodeAwal ??= 'DEMO123';
      return clone({
        codes: Object.entries(db.codes || {}).map(([department_id, c]) => ({ department_id, ...c })),
        kode_awal: db.kodeAwal || '',
        kode_awal_at: null,
      });
    },
    async setSharedCode(code) {
      const k = String(code || '').trim().toUpperCase();
      if (k && k.length < 6) throw new Error('Kode awal bersama minimal 6 karakter');
      db.kodeAwal = k;
      persist();
    },
    async departmentLogout(token) {
      if (db.sessions) delete db.sessions[token];
      persist();
    },
    async departmentDashboard({ token, departmentId }) {
      const id = token ? (db.pendingSetup?.[token] ? null : db.sessions?.[token]) : departmentId;
      if (!id) throw new Error('Sesi bagian berakhir. Silakan masuk lagi.');
      const d = db.departments.find((x) => x.id === id);
      const start = new Map(db.cycles.map((c) => [c.id, c.start_date]));
      const reports = db.reports
        .filter((r) => r.department_id === id && start.has(r.cycle_id))
        .sort((a, b) => start.get(b.cycle_id).localeCompare(start.get(a.cycle_id)))
        .map((r) => ({ evaluasi_program: [], catatan_admin_at: null, ...r }));
      return clone({
        department: {
          id: d.id, no: d.no, nama: d.nama, is_active: d.is_active !== false,
          sekretaris_nama: d.sekretaris_nama, ketua_nama: d.ketua_nama, pembimbing_nama: d.pembimbing_nama,
          ketua_wa: d.ketua_wa || null, sekretaris_wa: d.sekretaris_wa || null,
          profil_at: d.profil_at || null, kode_pribadi_at: d.kode_pribadi_at || null,
        },
        reports,
      });
    },
    async departmentChangePassword(token, current, next) {
      const id = db.sessions?.[token];
      if (!id) throw new Error('Sesi bagian berakhir. Silakan masuk lagi.');
      const own = db.passwords?.[id];
      if (own && String(current || '').trim().toUpperCase() !== own) throw new Error('Kode lama salah.');
      const pw = String(next || '').trim().toUpperCase();
      if (pw.length < 6) throw new Error('Kode baru minimal 6 karakter.');
      if (pw === db.kodeAwal) throw new Error('Kode baru tidak boleh sama dengan kode awal bersama.');
      db.passwords ||= {};
      db.passwords[id] = pw;
      (db.codes ||= {})[id] = { kode: pw, sumber: 'bagian', updated_at: new Date().toISOString() };
      const dd = db.departments.find((x) => x.id === id);
      if (dd) dd.kode_pribadi_at = new Date().toISOString();
      for (const [t, dep] of Object.entries(db.sessions)) if (dep === id && t !== token) delete db.sessions[t];
      persist();
    },
    async previousPrograms({ cycleId, departmentId }) {
      const c = db.cycles.find((x) => x.id === cycleId);
      if (!c) return [];
      const prev = db.cycles.filter((x) => x.start_date < c.start_date).sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
      const r = prev && db.reports.find((x) => x.cycle_id === prev.id && x.department_id === departmentId && x.submitted_at);
      return clone((r?.programs || []).map(({ urutan, judul, kategori, target }) => ({ urutan, judul, kategori, target })));
    },
    async setPembimbingOptions(list) {
      const seen = new Set();
      db.pembimbingList = list.map((s) => String(s || '').replace(/\s+/g, ' ').trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
      persist();
      return clone(db.pembimbingList);
    },
    async formContext({ departmentId } = {}) {
      db.teachers ||= createDemoTeachers(db.departments);
      // Daftar Pembimbing contoh: nama pembimbing fiktif dari data demo.
      db.pembimbingList ||= [...new Set(db.departments.map((x) => x.pembimbing_nama).filter(Boolean))].sort().slice(0, 12);
      const d = departmentId ? db.departments.find((x) => x.id === departmentId) : null;
      return clone({
        department: d
          ? { id: d.id, ketua_nama: d.ketua_nama, sekretaris_nama: d.sekretaris_nama, pembimbing_nama: d.pembimbing_nama, ketua_wa: d.ketua_wa || null, sekretaris_wa: d.sekretaris_wa || null, profil_at: d.profil_at || null, kode_pribadi_at: d.kode_pribadi_at || null }
          : null,
        teachers: db.teachers.filter((t) => t.is_active !== false).map(({ nama, tahun, kelompok }) => ({ nama, tahun, kelompok })),
        pembimbing: db.pembimbingList,
      });
    },
    async replaceTeachers(rows) {
      db.teachers ||= [];
      const key = (s) => String(s || '').trim().toLowerCase();
      const incoming = new Map();
      rows.forEach((r) => {
        if (!r.nama || /senior/i.test(`${r.kelompok} ${r.tahun}`) || incoming.has(key(r.nama))) return;
        incoming.set(key(r.nama), r);
      });
      const before = new Map(db.teachers.map((t) => [key(t.nama), t]));
      let baru = 0;
      let off = 0;
      db.teachers.forEach((t) => {
        if (t.is_active !== false && !incoming.has(key(t.nama))) {
          t.is_active = false;
          off += 1;
        }
      });
      incoming.forEach((r, k) => {
        const t = before.get(k);
        if (t) Object.assign(t, { nama: r.nama, tahun: r.tahun || null, kelompok: r.kelompok || null, is_active: true });
        else {
          db.teachers.push({ nama: r.nama, tahun: r.tahun || null, kelompok: r.kelompok || null, is_active: true });
          baru += 1;
        }
      });
      persist();
      return { aktif: incoming.size, baru, dinonaktifkan: off };
    },
    async setReportFeedback(reportId, catatan) {
      const r = findReport(reportId);
      if (r) {
        r.catatan_admin = String(catatan || '').trim() || null;
        r.catatan_admin_at = r.catatan_admin ? new Date().toISOString() : null;
      }
      persist();
    },

    async resetDemo() {
      db = createDemoState(todayIso());
      persist();
    },
  };
}
