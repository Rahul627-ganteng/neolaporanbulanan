import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createAdapter } from './data/index.js';
import { computeWeek, prevHijriMonth } from './constants.js';
import { todayIso } from './hijri.js';
import { clearBagianSession, isExpiredSessionError, loadBagianSession, saveBagianSession } from './bagian-session.js';

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

export function StoreProvider({ children }) {
  const [adapter, setAdapter] = useState(null);
  const [session, setSession] = useState(null);
  // Akun bagian: token sesi (bukan Supabase Auth) + data dasbor per bagian.
  const [bagian, setBagian] = useState(() => loadBagianSession());
  const [departmentData, setDepartmentData] = useState({});
  const [dashboardDeptId, setDashboardDeptId] = useState(null);
  // Direktori guru (nama Ketua/Sekretaris); dibuka setelah kode/sesi/admin terverifikasi.
  const [teachers, setTeachers] = useState(null);
  const [pembimbingOptions, setPembimbingOptions] = useState(null);
  const [base, setBase] = useState({ periods: [], cycles: [], departments: [] });
  const [viewCycleId, setViewCycleId] = useState(null);
  const [reportsByCycle, setReportsByCycle] = useState({});
  const [queue, setQueue] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const today = useMemo(() => todayIso(), []);

  const notify = useCallback((message, tone = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, tone, at: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const cycles = base.cycles;
  const activeCycle = cycles.find((c) => c.status === 'aktif') || null;
  const viewCycle = cycles.find((c) => c.id === viewCycleId) || activeCycle || cycles[0] || null;
  const prevOf = useCallback(
    (cycle) => {
      if (!cycle) return null;
      const p = prevHijriMonth(cycle.hijri_month, cycle.hijri_year);
      return cycles.find((c) => c.hijri_month === p.month && c.hijri_year === p.year) || null;
    },
    [cycles]
  );
  const prevCycle = prevOf(viewCycle);
  const period = viewCycle ? base.periods.find((p) => p.id === viewCycle.period_id) : null;
  const activePeriod = base.periods.find((p) => p.is_active) || base.periods[0] || null;

  const loadReports = useCallback(
    async (ad, cycleId, force = false) => {
      if (!cycleId) return [];
      if (!force && reportsByCycle[cycleId]) return reportsByCycle[cycleId];
      const rows = await ad.loadCycle(cycleId);
      setReportsByCycle((m) => ({ ...m, [cycleId]: rows }));
      return rows;
    },
    [reportsByCycle]
  );

  const refreshBase = useCallback(async (ad = adapter) => {
    const b = await ad.loadBase();
    setBase(b);
    return b;
  }, [adapter]);

  // ------- boot -------
  useEffect(() => {
    let off = () => {};
    (async () => {
      try {
        const ad = await createAdapter();
        setAdapter(ad);
        const s = await ad.getSession();
        setSession(s);
        // Cache laporan dikosongkan & dimuat ulang oleh efek sessionKey di bawah.
        off = ad.onAuthChange((info) => setSession(info));
        const b = await ad.loadBase();
        setBase(b);
        const act = b.cycles.find((c) => c.status === 'aktif') || b.cycles[0];
        if (act) {
          setViewCycleId(act.id);
          const rows = await ad.loadCycle(act.id);
          const p = prevHijriMonth(act.hijri_month, act.hijri_year);
          const prev = b.cycles.find((c) => c.hijri_month === p.month && c.hijri_year === p.year);
          const prevRows = prev ? await ad.loadCycle(prev.id) : null;
          setReportsByCycle(prev ? { [act.id]: rows, [prev.id]: prevRows } : { [act.id]: rows });
          setQueue(await ad.loadQueue(act.id));
        }
        setPhase('ready');
      } catch (e) {
        setLoadError(e.message || String(e));
        setPhase('error');
      }
    })();
    return () => off();
  }, []);

  // muat ulang data ketika sesi admin berubah (login/logout di produksi)
  // Hak akses efektif (Mode Demo: mencoba akun bagian = tampilan non-admin).
  const sessionKey = `${session?.email || 'anon'}:${Boolean(session?.isAdmin) && !(adapter?.mode === 'demo' && bagian)}`;
  const firstSession = useRef(true);
  useEffect(() => {
    if (!adapter || phase !== 'ready') return;
    if (firstSession.current) {
      firstSession.current = false;
      return;
    }
    // Data laporan bergantung pada hak akses: kosongkan cache (isi laporan admin tidak
    // tertinggal setelah keluar), lalu muat ulang siklus tampilan DAN siklus sebelumnya
    // (target program & laporan terlambat bulan lalu).
    setReportsByCycle({});
    (async () => {
      const b = await refreshBase(adapter);
      const cyc = b.cycles.find((c) => c.id === viewCycleId) || b.cycles.find((c) => c.status === 'aktif');
      if (cyc) {
        const p = prevHijriMonth(cyc.hijri_month, cyc.hijri_year);
        const prev = b.cycles.find((c) => c.hijri_month === p.month && c.hijri_year === p.year);
        await Promise.all([loadReports(adapter, cyc.id, true), prev && loadReports(adapter, prev.id, true)]);
        setQueue(await adapter.loadQueue(cyc.id));
      }
    })().catch((e) => notify(e.message || String(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // saat siklus tampilan berubah, pastikan laporan siklus itu & sebelumnya termuat
  useEffect(() => {
    if (!adapter || !viewCycle) return;
    loadReports(adapter, viewCycle.id);
    if (prevCycle) loadReports(adapter, prevCycle.id);
    adapter.loadQueue(viewCycle.id).then(setQueue).catch(() => setQueue([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, viewCycle?.id, prevCycle?.id]);

  const reports = (viewCycle && reportsByCycle[viewCycle.id]) || [];
  const prevReports = (prevCycle && reportsByCycle[prevCycle.id]) || [];
  const reportByDept = useMemo(() => new Map(reports.map((r) => [r.department_id, r])), [reports]);
  const prevReportByDept = useMemo(() => new Map(prevReports.map((r) => [r.department_id, r])), [prevReports]);
  const targetsByDept = useMemo(
    () => new Map(prevReports.filter((r) => r.submitted_at).map((r) => [r.department_id, r.programs || []])),
    [prevReports]
  );
  const departments = useMemo(() => [...base.departments].sort((a, b) => a.no - b.no), [base.departments]);
  const activeDepartments = useMemo(() => departments.filter((d) => d.is_active !== false), [departments]);
  const week = computeWeek(viewCycle, today);
  // Mode Demo selalu admin; saat mencoba akun bagian, tampilan berubah menjadi tampilan bagian.
  const isAdmin = Boolean(session?.isAdmin) && !(adapter?.mode === 'demo' && bagian);

  const dropBagian = useCallback(() => {
    clearBagianSession();
    setBagian(null);
  }, []);

  /** Data dasbor satu bagian: lewat token sesi bagian, atau jalur admin. */
  const loadDepartmentData = useCallback(
    async (departmentId, force = false) => {
      if (!adapter || !departmentId) return null;
      if (!force && departmentData[departmentId]) return departmentData[departmentId];
      const own = bagian && bagian.department.id === departmentId;
      // Sesi dari kode awal bersama baru bisa membuka data setelah login pertama selesai.
      if (own && bagian.perlu_setup && bagian.kode_bersama) return null;
      try {
        const data = await adapter.departmentDashboard({ token: own ? bagian.token : null, departmentId: own ? null : departmentId });
        setDepartmentData((m) => ({ ...m, [departmentId]: data }));
        return data;
      } catch (e) {
        if (own && isExpiredSessionError(e)) dropBagian();
        throw e;
      }
    },
    [adapter, bagian, departmentData, dropBagian]
  );

  // ------- actions -------
  const run = useCallback(
    async (fn, okMessage) => {
      try {
        const out = await fn();
        if (okMessage) notify(okMessage);
        return out;
      } catch (e) {
        notify(e.message || String(e), 'error');
        throw e;
      }
    },
    [notify]
  );

  const reloadCycle = useCallback(
    async (cycleId) => {
      const rows = await adapter.loadCycle(cycleId);
      setReportsByCycle((m) => ({ ...m, [cycleId]: rows }));
      return rows;
    },
    [adapter]
  );

  const actions = {
    notify,
    setViewCycleId,
    signIn: (email, pw) => run(async () => setSession(await adapter.signIn(email, pw)), 'Berhasil masuk sebagai admin.'),
    signOut: () => run(async () => {
      await adapter.signOut();
      setSession(null);
    }, 'Anda telah keluar.'),

    saveDepartment: (d) => run(async () => {
      await adapter.saveDepartment(d);
      await refreshBase();
    }, `Data ${d.nama} tersimpan.`),
    generateAccessCodes: (onlyMissing) => run(async () => {
      const rows = await adapter.generateAccessCodes(onlyMissing);
      await refreshBase();
      return rows;
    }, null),
    importDepartments: (rows) => run(async () => {
      let n = 0;
      for (const d of rows) {
        await adapter.saveDepartment(d);
        n += 1;
      }
      await refreshBase();
      return n;
    }, `Data ${rows.length} bagian tersimpan.`),
    listAdmins: () => adapter.listAdmins(),
    addAdmin: (email, catatan) => run(() => adapter.addAdmin(email, catatan), null),
    resetAdminPassword: (email) => run(() => adapter.resetAdminPassword(email), null),
    removeAdmin: (email) => run(() => adapter.removeAdmin(email), `${email} tidak lagi menjadi admin.`),
    changePassword: (pw) => run(() => adapter.changePassword(pw), 'Kata sandi diperbarui.'),
    setAccessCode: (deptId, code) => run(async () => {
      await adapter.setAccessCode(deptId, code);
      await refreshBase();
    }, 'Kode akses bagian diperbarui.'),

    createPeriod: (p) => run(async () => {
      const created = await adapter.createPeriod(p);
      await refreshBase();
      return created;
    }, `Tahun ajaran ${p.label_masehi} / ${p.label_hijri} ditambahkan.`),
    activatePeriod: (id) => run(async () => {
      await adapter.activatePeriod(id);
      await refreshBase();
    }, 'Tahun ajaran aktif diperbarui.'),
    openCycle: (c) => run(async () => {
      const id = await adapter.openCycle(c);
      await refreshBase();
      setViewCycleId(id);
      await reloadCycle(id);
      setQueue([]);
      return id;
    }, 'Periode bulan baru dibuka. Status semua bagian telah direset dan bulan sebelumnya diarsipkan.'),
    setCycleWeek: (cycleId, w) => run(async () => {
      await adapter.updateCycle(cycleId, { active_week: w });
      await refreshBase();
    }, w ? `Minggu aktif diatur manual ke Minggu ${w}.` : 'Minggu aktif kembali otomatis mengikuti tanggal.'),
    updateCycleDates: (cycleId, patch) => run(async () => {
      await adapter.updateCycle(cycleId, patch);
      await refreshBase();
    }, 'Tanggal periode diperbarui.'),

    submitReport: (args) => run(async () => {
      let r;
      try {
        r = await adapter.submitReport(args);
      } catch (e) {
        if (bagian && isExpiredSessionError(e)) dropBagian();
        throw e;
      }
      await reloadCycle(args.cycleId);
      if (isAdmin) refreshBase().catch(() => {}); // pejabat bagian yang tersimpan ikut diperbarui
      if (departmentData[args.departmentId] || bagian?.department.id === args.departmentId) {
        loadDepartmentData(args.departmentId, true).catch(() => {});
      }
      return r;
    }),

    // ----- akun bagian -----
    bagianLogin: (departmentId, password, remember = true) => run(async () => {
      const s = await adapter.departmentLogin(departmentId, password);
      saveBagianSession(s, remember);
      setBagian(s);
      setDepartmentData((m) => {
        const next = { ...m };
        delete next[departmentId];
        return next;
      });
      return s;
    }, null),
    bagianLogout: () => run(async () => {
      const token = bagian?.token;
      const id = bagian?.department.id;
      dropBagian();
      if (id) setDepartmentData((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      if (token) await adapter.departmentLogout(token).catch(() => {});
    }, 'Anda telah keluar dari akun bagian.'),
    bagianSetup: (profile, newCode) => run(async () => {
      const out = await adapter.departmentSetup(bagian?.token, profile, newCode);
      const s = { ...bagian, perlu_setup: false, kode_bersama: false };
      saveBagianSession(s, true);
      setBagian(s);
      setDepartmentData((m) => {
        const next = { ...m };
        delete next[s.department.id];
        return next;
      });
      refreshBase().catch(() => {});
      return out;
    }, null),
    loadAccessOverview: () => adapter.loadAccessOverview(),
    setSharedCode: (code) => run(() => adapter.setSharedCode(code), code ? 'Kode awal bersama disimpan.' : 'Kode awal bersama dinonaktifkan.'),
    bagianChangePassword: (current, next) => run(async () => {
      try {
        await adapter.departmentChangePassword(bagian?.token, current, next);
      } catch (e) {
        if (isExpiredSessionError(e)) dropBagian();
        throw e;
      }
    }, 'Kode bagian diganti dan tercatat di data admin. Perangkat lain yang memakai akun ini perlu masuk ulang.'),
    loadDepartmentData,
    setDashboardDeptId,
    previousPrograms: (args) => adapter.previousPrograms(args),
    loadFormContext: async (args = {}) => {
      const ctx = await adapter.formContext(args);
      if (Array.isArray(ctx?.teachers)) setTeachers(ctx.teachers);
      if (Array.isArray(ctx?.pembimbing)) setPembimbingOptions(ctx.pembimbing);
      return ctx;
    },
    setPembimbingOptions: (list) => run(async () => {
      const saved = await adapter.setPembimbingOptions(list);
      setPembimbingOptions(saved || list);
      return saved;
    }, 'Daftar Pembimbing Bagian disimpan.'),
    replaceTeachers: (rows) => run(async () => {
      const out = await adapter.replaceTeachers(rows);
      const ctx = await adapter.formContext({});
      setTeachers(ctx?.teachers || []);
      return out;
    }, null),
    setReportFeedback: (report, catatan) => run(async () => {
      await adapter.setReportFeedback(report.id, catatan);
      await loadDepartmentData(report.department_id, true);
    }, catatan.trim() ? 'Catatan untuk bagian tersimpan.' : 'Catatan dihapus.'),
    setStage: (report, key, on) => run(async () => {
      await adapter.setStage(report.id, key, on);
      setReportsByCycle((m) => ({
        ...m,
        [report.cycle_id]: (m[report.cycle_id] || []).map((r) => (r.id === report.id ? { ...r, [key]: on ? new Date().toISOString() : null } : r)),
      }));
    }),
    setProgramCategory: (report, programId, kategori) => run(async () => {
      await adapter.setProgramCategory(programId, kategori);
      setReportsByCycle((m) => ({
        ...m,
        [report.cycle_id]: (m[report.cycle_id] || []).map((r) =>
          r.id === report.id ? { ...r, programs: r.programs.map((p) => (p.id === programId ? { ...p, kategori } : p)) } : r
        ),
      }));
    }, 'Klasifikasi program diperbarui.'),

    enqueue: (items) => run(async () => {
      const n = await adapter.enqueue(viewCycle.id, items, 'admin');
      setQueue(await adapter.loadQueue(viewCycle.id));
      return n;
    }),
    setQueueStatus: (id, st) => run(async () => {
      await adapter.setQueueStatus(id, st);
      setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: st, sent_at: st === 'sent' ? new Date().toISOString() : null } : x)));
    }),
    markSent: (item) => run(async () => {
      let id = item.id;
      if (!id) {
        const { department_id, week: w, target_role, phone, message } = item;
        await adapter.enqueue(viewCycle.id, [{ department_id, week: w, target_role, phone: phone || null, message }], 'admin');
        const fresh = await adapter.loadQueue(viewCycle.id);
        id = fresh.find((x) => x.department_id === department_id && x.week === w && x.target_role === target_role)?.id;
      }
      if (id) await adapter.setQueueStatus(id, 'sent');
      setQueue(await adapter.loadQueue(viewCycle.id));
    }, 'Pengingat ditandai terkirim.'),
    clearQueue: () => run(async () => {
      await adapter.clearQueue(viewCycle.id);
      setQueue(await adapter.loadQueue(viewCycle.id));
    }, 'Antrean yang belum terkirim dikosongkan.'),
    runCron: adapter?.runCron
      ? (w) => run(async () => {
          const out = await adapter.runCron(w);
          setQueue(await adapter.loadQueue(viewCycle.id));
          return out;
        })
      : null,
    resetDemo: adapter?.resetDemo
      ? () => run(async () => {
          await adapter.resetDemo();
          const b = await refreshBase();
          const act = b.cycles.find((c) => c.status === 'aktif');
          setReportsByCycle({});
          setViewCycleId(act?.id || null);
          setQueue([]);
        }, 'Data contoh dikembalikan ke keadaan awal.')
      : null,
    reloadCycle,
  };

  const value = {
    phase, loadError, toast, today, mode: adapter?.mode || 'demo', session, isAdmin,
    bagian, departmentData, dashboardDeptId, teachers, pembimbingOptions,
    // Login pertama: kode bersama belum diganti, atau kontak bagian belum dilengkapi.
    needsSetup: Boolean(
      bagian &&
        (bagian.perlu_setup && bagian.kode_bersama ? true : departmentData[bagian.department.id]?.department ? !departmentData[bagian.department.id].department.profil_at : bagian.perlu_setup)
    ),
    periods: base.periods, cycles, departments, activeDepartments,
    activeCycle, viewCycle, prevCycle, period, activePeriod, prevOf,
    reports, prevReports, reportByDept, prevReportByDept, targetsByDept, reportsByCycle, queue, week,
    loadReports: (id) => loadReports(adapter, id),
    actions,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
