// Adapter Mode Demo: seluruh data disimpan di memori + localStorage peramban
// (khusus pengguna ini). Antarmukanya identik dengan supabase-adapter.js.
import { createDemoState, demoUid } from './demo-seed.js';
import { normalizeWa } from '../constants.js';
import { todayIso } from '../hijri.js';

const KEY = 'kmi-laporan-demo-v1';
const clone = (v) => JSON.parse(JSON.stringify(v));

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1) return s;
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
    async setAccessCode(deptId) {
      const d = db.departments.find((x) => x.id === deptId);
      if (d) d.has_access_code = true; // demo: kode tidak diperiksa
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
        pernyataan_inovatif: true,
        programs: payload.programs.map((p, i) => ({ ...p, id: demoUid('prg'), urutan: i + 1 })),
        submitted_at: r.submitted_at || now,
        pembimbing_approved_at: r.pembimbing_approved_at || now,
      });
      const d = db.departments.find((x) => x.id === departmentId);
      if (d) {
        d.sekretaris_nama ||= payload.sekretaris_nama;
        d.ketua_nama ||= payload.ketua_nama;
        d.pembimbing_nama ||= payload.pembimbing_nama;
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

    async resetDemo() {
      db = createDemoState(todayIso());
      persist();
    },
  };
}
