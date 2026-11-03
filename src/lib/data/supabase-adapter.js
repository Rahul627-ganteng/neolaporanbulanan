// Adapter produksi: Supabase (Postgres + Auth + RPC + Edge Function).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../env.js';
import { normalizeWa } from '../constants.js';

// Kolom eksplisit: hash kode akses tidak pernah dipilih (lihat grant kolom di skema).
const DEPT_ADMIN_COLS =
  'id,no,nama,sekretaris_nama,sekretaris_wa,ketua_nama,ketua_wa,pembimbing_nama,has_access_code,is_active';
const DEPT_PUBLIC_COLS = 'id,no,nama,is_active';

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const mapReport = (r) => ({
  ...r,
  programs: [...(r.priority_programs || [])].sort((a, b) => a.urutan - b.urutan),
  priority_programs: undefined,
});

export function createSupabaseAdapter() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  let isAdmin = false;

  async function sessionInfo(session) {
    if (!session) {
      isAdmin = false;
      return null;
    }
    const { data } = await sb.rpc('is_admin');
    isAdmin = data === true;
    return { email: session.user.email, isAdmin };
  }

  return {
    mode: 'supabase',
    client: sb,

    async getSession() {
      const { data } = await sb.auth.getSession();
      return sessionInfo(data.session);
    },
    onAuthChange(cb) {
      // Jangan memanggil API Supabase langsung di dalam callback auth (bisa deadlock);
      // tunda ke tick berikutnya. TOKEN_REFRESHED tidak mengubah status admin.
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
        setTimeout(async () => cb(await sessionInfo(session)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : error.message);
      const info = await sessionInfo(data.session);
      if (!info?.isAdmin) {
        await sb.auth.signOut();
        throw new Error('Akun ini belum terdaftar sebagai admin portal.');
      }
      return info;
    },
    async signOut() {
      await sb.auth.signOut();
      isAdmin = false;
    },

    async loadBase() {
      const [periods, cycles, departments] = await Promise.all([
        sb.from('academic_periods').select('*').order('label_hijri', { ascending: false }).then(must),
        sb.from('monthly_cycles').select('*').order('hijri_year', { ascending: false }).order('hijri_month', { ascending: false }).then(must),
        sb.from('departments').select(isAdmin ? DEPT_ADMIN_COLS : DEPT_PUBLIC_COLS).order('no').then(must),
      ]);
      return { periods, cycles, departments };
    },

    async loadCycle(cycleId) {
      if (!isAdmin) {
        // Publik: hanya status (tanpa isi laporan) lewat RPC aman.
        const rows = must(await sb.rpc('get_cycle_status', { p_cycle_id: cycleId }));
        return rows.map((r) => ({ id: `${cycleId}:${r.department_id}`, cycle_id: cycleId, ...r, programs: [] }));
      }
      const rows = must(
        await sb.from('monthly_reports').select('*, priority_programs(*)').eq('cycle_id', cycleId)
      );
      return rows.map(mapReport);
    },
    async loadQueue(cycleId) {
      if (!isAdmin) return [];
      return must(await sb.from('notification_queue').select('*').eq('cycle_id', cycleId).order('created_at'));
    },

    async saveDepartment(dept) {
      const row = {
        no: dept.no,
        nama: dept.nama,
        sekretaris_nama: dept.sekretaris_nama || null,
        sekretaris_wa: normalizeWa(dept.sekretaris_wa) || null,
        ketua_nama: dept.ketua_nama || null,
        ketua_wa: normalizeWa(dept.ketua_wa) || null,
        pembimbing_nama: dept.pembimbing_nama || null,
        is_active: dept.is_active !== false,
      };
      if (dept.id) return must(await sb.from('departments').update(row).eq('id', dept.id).select(DEPT_ADMIN_COLS).single());
      return must(await sb.from('departments').insert(row).select(DEPT_ADMIN_COLS).single());
    },
    async setAccessCode(deptId, code) {
      must(await sb.rpc('set_department_access_code', { p_department_id: deptId, p_code: code }));
    },

    async createPeriod({ label_masehi, label_hijri }) {
      return must(await sb.from('academic_periods').insert({ label_masehi, label_hijri, is_active: false }).select().single());
    },
    async activatePeriod(id) {
      must(await sb.rpc('activate_period', { p_period_id: id }));
    },

    async openCycle(c) {
      return must(
        await sb.rpc('open_new_cycle', {
          p_period_id: c.period_id,
          p_hijri_month: c.hijri_month,
          p_hijri_year: c.hijri_year,
          p_masehi_label: c.masehi_label,
          p_start_date: c.start_date,
          p_end_date: c.end_date,
          p_deadline: c.deadline_date,
        })
      );
    },
    async updateCycle(cycleId, patch) {
      must(await sb.from('monthly_cycles').update(patch).eq('id', cycleId));
    },

    async submitReport({ cycleId, departmentId, accessCode, payload }) {
      const id = must(
        await sb.rpc('submit_report', {
          p_cycle_id: cycleId,
          p_department_id: departmentId,
          p_access_code: accessCode || null,
          p_payload: payload,
        })
      );
      return { id, cycle_id: cycleId, department_id: departmentId, status: 'terkirim', submitted_at: new Date().toISOString(), ...payload };
    },
    async setStage(reportId, key, on) {
      must(await sb.from('monthly_reports').update({ [key]: on ? new Date().toISOString() : null }).eq('id', reportId));
    },
    async setProgramCategory(programId, kategori) {
      must(await sb.from('priority_programs').update({ kategori }).eq('id', programId));
    },

    async enqueue(cycleId, items, source = 'admin') {
      const rows = items.map((it) => ({ ...it, cycle_id: cycleId, source }));
      const { error, count } = await sb
        .from('notification_queue')
        .upsert(rows, { onConflict: 'cycle_id,department_id,week,target_role', ignoreDuplicates: true, count: 'exact' });
      if (error) throw new Error(error.message);
      return count ?? rows.length;
    },
    async setQueueStatus(id, status) {
      const { data } = await sb.auth.getUser();
      must(
        await sb
          .from('notification_queue')
          .update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null, sent_by: data.user?.id ?? null })
          .eq('id', id)
      );
    },
    async clearQueue(cycleId) {
      must(await sb.from('notification_queue').delete().eq('cycle_id', cycleId).neq('status', 'sent'));
    },
    /** Picu Edge Function yang sama dengan pg_cron (untuk uji atau susulan). */
    async runCron(week) {
      const { data, error } = await sb.functions.invoke('weekly-reminder', { body: { force: true, week } });
      if (error) throw new Error(error.message);
      return data;
    },
  };
}
